import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendResumeEmail } from "@/lib/resend";
import crypto from "crypto";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Standard webhook signature validation in production
    if (secret && signature && secret !== "mock" && secret !== "xxx") {
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(bodyText)
        .digest("hex");

      if (expectedSignature !== signature) {
        console.warn("Invalid Razorpay webhook signature detected.");
        return NextResponse.json({ error: "Signature verification failed." }, { status: 400 });
      }
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (err) {
      return NextResponse.json({ error: "Invalid JSON body payload." }, { status: 400 });
    }

    const event = payload.event;

    // Process completed checkout link payments
    if (event === "payment_link.paid") {
      const paymentLinkEntity = payload.payload?.payment_link?.entity;
      const paymentEntity = payload.payload?.payment?.entity;
      
      const resumeId = paymentLinkEntity?.notes?.resumeId;
      const paymentId = paymentEntity?.id;
      const amountPaid = paymentLinkEntity?.amount_paid || 4900; // in paise

      console.log(`[Webhook] Processing payment_link.paid: resumeId=${resumeId}, paymentId=${paymentId}`);

      if (resumeId) {
        // ── 1. IDEMPOTENCY CHECK: EVENT DEDUPLICATION ────────────────────────
        // Check if resume is already marked PAID to prevent duplicate updates,
        // duplicate analytics tracking, and duplicate confirmation emails on webhooks retries/replays.
        const existingResume = await prisma.resume.findUnique({
          where: { id: resumeId },
          select: { id: true, paymentStatus: true, paymentId: true },
        });

        if (existingResume?.paymentStatus === "PAID") {
          logger.info(`[Webhook Idempotency] Resume ${resumeId} is already marked PAID. Webhook replay ignored.`, {
            resumeId,
            paymentId,
          });
          return NextResponse.json(
            { status: "already_processed", message: "Webhook event already handled (idempotent)." },
            { status: 200 }
          );
        }

        // Check if this payment event was already recorded in PaymentEvent
        const existingEvent = await prisma.paymentEvent.findFirst({
          where: {
            resumeId,
            status: "PAID",
          },
        });
        if (existingEvent) {
          logger.info(`[Webhook Idempotency] PaymentEvent already logged for resume ${resumeId}. Skipping replay.`);
          return NextResponse.json(
            { status: "already_processed", message: "Payment event already logged." },
            { status: 200 }
          );
        }

        const updatedResume = await prisma.resume.update({
          where: { id: resumeId },
          data: {
            paymentStatus: "PAID",
            paymentId: paymentId || `pay_web_${Math.random().toString(36).substr(2, 9)}`,
            status: "PAID",
            amountPaid: amountPaid,
          },
        });
        console.log(`[Webhook] ✓ Resume ${resumeId} updated to PAID. Payment Status: ${updatedResume.paymentStatus}`);

        // Record the payment event for persistent idempotency tracking
        try {
          await prisma.paymentEvent.create({
            data: {
              resumeId,
              sessionId: updatedResume.sessionId,
              status: "PAID",
              amount: amountPaid,
            },
          });
        } catch (eventErr) {
          console.warn("[Webhook] Failed to record PaymentEvent dedupe record:", eventErr);
        }

        // Log successful checkout unlock analytics event via webhook
        try {
          await prisma.analyticsEvent.create({
            data: {
              sessionId: updatedResume.sessionId,
              eventType: "PAYWALL_UNLOCK",
              page: `result_${resumeId}`,
              metadata: JSON.stringify({ resumeId, amountPaid: updatedResume.amountPaid, source: "webhook" })
            }
          });
        } catch (e) {
          console.error("Failed to log webhook paywall unlock event:", e);
        }

        // Verify the update immediately
        const verified = await prisma.resume.findUnique({
          where: { id: resumeId }
        });
        console.log(`[Webhook] ✓ Verification: Resume ${resumeId} paymentStatus in DB = ${verified?.paymentStatus}`);

        // Safely trigger background transactional email delivery
        try {
          const inputData = JSON.parse(updatedResume.inputData);
          const outputFull = JSON.parse(updatedResume.outputFull || "{}");
          
          const customerName = inputData.personal?.fullName || "Placement Student";
          const toEmail = inputData.personal?.email;

          if (toEmail) {
            const plainTextResume = `
${inputData.personal.fullName.toUpperCase()}
Email: ${inputData.personal.email}${inputData.personal.phone ? ` | Phone: ${inputData.personal.phone}` : ""}${inputData.personal.linkedin ? ` | LinkedIn: ${inputData.personal.linkedin}` : ""}${inputData.personal.github ? ` | GitHub: ${inputData.personal.github}` : ""}
Target: ${inputData.personal.targetRole} ${inputData.personal.branch ? `(${inputData.personal.branch})` : ""}
Education: ${outputFull.pgEducation || inputData.personal.hasPG ? `[PG] ${outputFull.pgEducation?.degree || `${inputData.personal.pgDegreeName} in ${inputData.personal.pgBranch}`} - ${outputFull.pgEducation?.institution || inputData.personal.pgCollegeName} (${outputFull.pgEducation?.year || inputData.personal.pgGraduationYear}) | CGPA: ${outputFull.pgEducation?.cgpa || `${inputData.personal.pgCgpa}/10.0`} ; ` : ""}[UG] ${outputFull.education?.degree} - ${outputFull.education?.institution} (${outputFull.education?.year}) | CGPA: ${outputFull.education?.cgpa}

PROFESSIONAL SUMMARY
${outputFull.summary}

TECHNICAL SKILLS
- Languages: ${(outputFull.skills?.languages || []).join(", ")}
- Frameworks & Libraries: ${(outputFull.skills?.frameworks || []).join(", ")}
- Tools & Platforms: ${(outputFull.skills?.tools || []).join(", ")}
- Databases: ${(outputFull.skills?.databases || []).join(", ")}
- Core Concepts: ${(outputFull.skills?.concepts || []).join(", ")}
${outputFull.skills?.softSkills && outputFull.skills.softSkills.length > 0 ? `- Soft Skills: ${outputFull.skills.softSkills.join(", ")}\n` : ""}

PROJECTS
${(outputFull.projects || []).map((proj: any) => `
${proj.title} (${proj.techStack})
${proj.duration ? `Duration: ${proj.duration}\n` : ""}${proj.bullets.map((b: string) => `- ${b}`).join("\n")}
`).join("\n")}
            `.trim();

            sendResumeEmail(toEmail, customerName, resumeId, plainTextResume)
              .then(sent => logger.info(`[Webhook] Email trigger: ${sent ? 'Sent successfully' : 'Skipped'}`, { resumeId }))
              .catch(err => logger.error("[Webhook] Background email delivery failure:", { resumeId, error: err?.message }));
          }
        } catch (emailErr: any) {
          logger.error("[Webhook] Background candidate resolution failed:", { resumeId, error: emailErr?.message });
        }
      }
    }

    // Process failed payments
    if (event === "payment.failed") {
      const paymentEntity = payload.payload?.payment?.entity;
      const resumeId = paymentEntity?.notes?.resumeId;
      const reason = paymentEntity?.error_description || paymentEntity?.error_reason || "Payment declined";

      logger.warn(`[Webhook] Payment failed: resumeId=${resumeId}`, {
        resumeId,
        paymentId: paymentEntity?.id,
        reason,
      });

      if (resumeId) {
        try {
          const current = await prisma.resume.findUnique({
            where: { id: resumeId },
            select: { paymentStatus: true },
          });
          if (current?.paymentStatus === "PAID") {
            logger.info(`[Webhook] Ignoring payment.failed because resume ${resumeId} is already PAID.`);
            return NextResponse.json({ status: "ignored_already_paid" }, { status: 200 });
          }

          await prisma.resume.update({
            where: { id: resumeId },
            data: { paymentStatus: "FAILED" },
          });

          await prisma.analyticsEvent.create({
            data: {
              sessionId: `failed_${resumeId}`,
              eventType: "PAYMENT_FAILED",
              page: `result_${resumeId}`,
              metadata: JSON.stringify({ resumeId, reason, paymentId: paymentEntity?.id }),
            },
          });
        } catch (dbErr: any) {
          logger.error("[Webhook] Failed to update resume status on payment failure:", { error: dbErr?.message });
        }
      }
    }

    // Process expired payment links
    if (event === "payment_link.expired") {
      const paymentLinkEntity = payload.payload?.payment_link?.entity;
      const resumeId = paymentLinkEntity?.notes?.resumeId;

      logger.info(`[Webhook] Payment link expired: resumeId=${resumeId}`, { resumeId });

      if (resumeId) {
        try {
          const current = await prisma.resume.findUnique({
            where: { id: resumeId },
            select: { paymentStatus: true },
          });
          if (current?.paymentStatus === "PAID") {
            logger.info(`[Webhook] Ignoring payment_link.expired because resume ${resumeId} is already PAID.`);
            return NextResponse.json({ status: "ignored_already_paid" }, { status: 200 });
          }

          await prisma.resume.update({
            where: { id: resumeId },
            data: { paymentStatus: "EXPIRED" },
          });
        } catch (e: any) {
          logger.error("[Webhook] Error updating expired link status:", { error: e?.message });
        }
      }
    }

    // Process refunds
    if (event === "refund.processed") {
      const refundEntity = payload.payload?.refund?.entity;
      const paymentId = refundEntity?.payment_id;

      logger.info(`[Webhook] Refund processed for paymentId=${paymentId}`, {
        refundId: refundEntity?.id,
        paymentId,
        amount: refundEntity?.amount,
      });

      if (paymentId) {
        try {
          const matched = await prisma.resume.findFirst({
            where: { paymentId },
          });
          if (matched) {
            await prisma.resume.update({
              where: { id: matched.id },
              data: { paymentStatus: "REFUNDED", status: "REFUNDED" },
            });
            await prisma.analyticsEvent.create({
              data: {
                sessionId: matched.sessionId,
                eventType: "PAYMENT_REFUNDED",
                page: `result_${matched.id}`,
                metadata: JSON.stringify({ resumeId: matched.id, paymentId, refundId: refundEntity?.id }),
              },
            });
          }
        } catch (refundErr: any) {
          logger.error("[Webhook] Failed to mark resume as refunded:", { error: refundErr?.message });
        }
      }
    }

    return NextResponse.json({ status: "success", received: true });
  } catch (error: any) {
    logger.error("API /api/payment/webhook POST error:", { error: error?.message || String(error) });
    return NextResponse.json({ error: "Webhook notification processing failed." }, { status: 500 });
  }
}
