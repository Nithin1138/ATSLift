import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractJdInfoWithLLM } from "@/lib/llm-extractor";
import { sendTelegramMessage, formatDateDDMMYYYY, escapeHtml } from "@/lib/telegram";
import { scheduleQStashReminder } from "@/lib/qstash";
import { evaluateUserEligibility } from "@/lib/eligibility-checker";
import { runAtsScoreCheck } from "@/lib/ats-scoring";
import { maskEmail, maskIdentifier } from "@/lib/pii";
import {
  parseXlsxBuffer,
  parseCsvText,
  parsePdfBuffer,
  parseGoogleSheetsLink,
  parseGoogleDriveLink,
  parseHtmlTableText,
  searchRegNumberInText,
  processAttachmentItem,
  formatShortlistTelegramMessage,
  type AttachmentMatchResult,
} from "@/lib/attachment-parser";

function extractCleanEmail(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  const addr = match ? match[1] : raw;
  return addr.toLowerCase().trim();
}

function extractMimeAttachmentsAndText(rawBody: string): { text: string; html: string; attachments: any[] } {
  const boundaryMatch = rawBody.match(/boundary="?([^"\r\n;]+)"?/i);
  if (!boundaryMatch) {
    return { text: rawBody, html: "", attachments: [] };
  }
  const boundary = boundaryMatch[1];
  const parts = rawBody.split(new RegExp(`--${boundary}(?:--)?`));
  let text = "";
  let html = "";
  const attachments: any[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const splitIdx = trimmed.indexOf("\r\n\r\n") !== -1 ? trimmed.indexOf("\r\n\r\n") : trimmed.indexOf("\n\n");
    if (splitIdx === -1) continue;
    const headerSection = trimmed.slice(0, splitIdx);
    const bodySection = trimmed.slice(splitIdx).trim();

    const contentTypeMatch = headerSection.match(/content-type:\s*([^;\r\n]+)/i);
    const ct = contentTypeMatch ? contentTypeMatch[1].toLowerCase().trim() : "";
    const filenameMatch =
      headerSection.match(/filename="?([^"\r\n]+)"?/i) ||
      headerSection.match(/name="?([^"\r\n]+)"?/i);
    const filename = filenameMatch ? filenameMatch[1].trim() : "";

    const isBase64 = /content-transfer-encoding:\s*base64/i.test(headerSection);

    if (filename || /application\/(pdf|vnd|octet|zip)|text\/csv/i.test(ct)) {
      try {
        const buffer = isBase64
          ? Buffer.from(bodySection.replace(/\s+/g, ""), "base64")
          : Buffer.from(bodySection, "utf-8");
        attachments.push({
          filename: filename || "attachment",
          contentType: ct,
          content: buffer,
        });
      } catch {
        // ignore decoding errors
      }
    } else if (ct.includes("text/html")) {
      html += bodySection;
    } else if (ct.includes("text/plain") || !text) {
      text += bodySection;
    }
  }

  return { text: text || rawBody, html, attachments };
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let payload: Record<string, unknown> = {};
    const formAttachments: any[] = [];

    if (contentType.includes("application/json")) {
      payload = await req.json();
    } else if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [key, val] of form.entries()) {
        if (val && typeof val === "object" && typeof (val as any).arrayBuffer === "function") {
          const fileObj = val as any;
          try {
            const ab = await fileObj.arrayBuffer();
            formAttachments.push({
              filename: fileObj.name || key || "attachment",
              contentType: fileObj.type || "",
              content: Buffer.from(ab),
            });
          } catch (e) {
            console.warn("[Inbound] Failed reading form file:", e);
          }
        } else {
          payload[key] = val;
        }
      }
    } else {
      // Raw body (Cloudflare may send raw email RFC 2822 or plain text)
      const rawBody = await req.text();
      try {
        payload = JSON.parse(rawBody);
      } catch {
        // Not JSON — check if it's a multipart MIME email
        if (rawBody.includes("boundary=") || contentType.includes("message/rfc822")) {
          const parsedMime = extractMimeAttachmentsAndText(rawBody);
          payload = { text: parsedMime.text, html: parsedMime.html, type: "cloudflare.email" };
          formAttachments.push(...parsedMime.attachments);
        } else {
          payload = { text: rawBody, type: "cloudflare.email" };
        }
      }
    }

    const data = (payload.data as Record<string, unknown>) || payload;

    // Log payload for debugging with PII masking
    console.log("[Inbound Webhook] ContentType:", contentType);
    console.log("[Inbound Webhook] Keys:", Object.keys(payload).join(", "));
    console.log("[Inbound Webhook] type:", payload.type, "| subject:", data.subject || payload.subject, "| to:", maskEmail(String(data.to || payload.to || payload.recipient || "")), "| from:", maskEmail(String(data.from || payload.from || payload.sender || "")));

    // Resend / Cloudflare event type check (allow email.received, cloudflare.email, or direct payload)
    if (payload.type && payload.type !== "email.received" && payload.type !== "email.inbound" && payload.type !== "cloudflare.email") {
      console.log("[Inbound Webhook] Ignored event type:", payload.type);
      return NextResponse.json({ message: "Ignored event type" }, { status: 200 });
    }

    const email_id = String(data.email_id || data.id || payload.email_id || "");
    const to = data.to || payload.to || payload.recipient;
    const from = String(data.from || payload.from || payload.sender || "");
    const subject = String(data.subject || payload.subject || "");

    const recipientList: string[] = Array.isArray(to) ? [...(to as string[])] : (to ? [String(to)] : []);
    if (payload.delivered_to) recipientList.push(String(payload.delivered_to));
    if (payload.forwarded_to) recipientList.push(String(payload.forwarded_to));
    if (data.delivered_to) recipientList.push(String(data.delivered_to));

    // Find the inbound alias or user email matching a TelegramUser in DB
    let matchedTgUser = null;

    for (const rawRecipient of recipientList) {
      const cleanAddr = extractCleanEmail(rawRecipient);
      const prefix = cleanAddr.split("@")[0]; // e.g. "jd_cmrv1w4kb000"

      // 1. Try exact inboundAlias match
      let tgUser = await prisma.telegramUser.findFirst({
        where: {
          inboundAlias: {
            equals: cleanAddr,
            mode: "insensitive",
          },
        },
      });

      // 2. Try user email match (e.g. personalprojects1009@gmail.com)
      if (!tgUser) {
        tgUser = await prisma.telegramUser.findFirst({
          where: {
            user: {
              email: {
                equals: cleanAddr,
                mode: "insensitive",
              },
            },
          },
        });
      }

      // 3. Try prefix match (e.g. jd_cmrv1w4kb000)
      if (!tgUser && prefix && prefix.startsWith("jd_")) {
        tgUser = await prisma.telegramUser.findFirst({
          where: {
            inboundAlias: {
              startsWith: prefix,
              mode: "insensitive",
            },
          },
        });
      }

      if (tgUser) {
        matchedTgUser = tgUser;
        break;
      }
    }

    // 2.5. Try matching sender email (if user forwarded from their Google Sheet or personal Gmail)
    if (!matchedTgUser && from) {
      const cleanFrom = extractCleanEmail(from);
      if (cleanFrom) {
        const userByEmail = await prisma.telegramUser.findFirst({
          where: {
            user: {
              email: {
                equals: cleanFrom,
                mode: "insensitive",
              },
            },
          },
        });
        if (userByEmail) {
          console.log(`[Resend Inbound]: Matched Telegram user via sender email: ${maskEmail(cleanFrom)}`);
          matchedTgUser = userByEmail;
        }
      }
    }

    // 3. Fallback: If only 1 Telegram user is linked in DB or default single user, match recent TelegramUser
    if (!matchedTgUser) {
      const firstUser = await prisma.telegramUser.findFirst({
        orderBy: { createdAt: "desc" },
      });
      if (firstUser) {
        console.log(`[Resend Inbound Fallback]: Matched recipient to recent user ${firstUser.inboundAlias}`);
        matchedTgUser = firstUser;
      }
    }

    if (!matchedTgUser) {
      console.warn(`[Resend Inbound] No matching TelegramUser found for recipients:`, recipientList);
      return NextResponse.json({ message: "No matching user alias" }, { status: 200 });
    }

    // Fetch email content from Resend payload or API
    let rawEmailText = String(data.text || data.body || payload.text || "");
    let rawHtmlText = String(data.html || payload.html || "");
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!rawEmailText && !rawHtmlText && resendApiKey && email_id) {
      try {
        const emailRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}`, {
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
          },
        });

        if (emailRes.ok) {
          const emailData = await emailRes.json();
          rawEmailText = emailData.text || "";
          rawHtmlText = emailData.html || "";
        } else {
          // Retry with alternate Resend endpoint if needed
          const emailResAlt = await fetch(`https://api.resend.com/emails/${email_id}`, {
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
            },
          });
          if (emailResAlt.ok) {
            const emailDataAlt = await emailResAlt.json();
            rawEmailText = emailDataAlt.text || "";
            rawHtmlText = emailDataAlt.html || "";
          }
        }
      } catch (err) {
        console.error("[Resend Inbound API Error]:", err);
      }
    }

    const fullTextContext = `Subject: ${subject || ""}\nFrom: ${from || ""}\n\n${rawEmailText}`;
    const fromLower = (from || "").toLowerCase();
    const subjectLower = (subject || "").toLowerCase();
    const bodyContextLower = (fullTextContext + " " + rawHtmlText).toLowerCase();

    // Check if this is a Gmail Auto-Forwarding Confirmation Email from Google
    // IMPORTANT: Be very specific here — forwarded real emails also contain google.com links in the wrapper HTML.
    // Only flag as confirmation if sender is explicitly Google's forwarding noreply address,
    // OR the subject specifically mentions forwarding/confirmation,
    // OR the body contains the distinctive Gmail verification URL pattern.
    const isGmailConfirmation =
      fromLower.includes("forwarding-noreply@google.com") ||
      (subjectLower.includes("gmail forwarding") && subjectLower.includes("confirmation")) ||
      bodyContextLower.includes("google.com/mail/vf-") ||
      (bodyContextLower.includes("confirmation code") && fromLower.includes("google.com"));

    if (isGmailConfirmation) {
      // 1. Code match: 9-digit or 7-10 digit numbers
      const codeMatch =
        fullTextContext.match(/Confirmation code:\s*(\d+)/i) ||
        fullTextContext.match(/code:\s*(\d+)/i) ||
        fullTextContext.match(/\b(\d{7,10})\b/) ||
        rawHtmlText.match(/\b(\d{7,10})\b/);

      // 2. Link match: https://mail.google.com/mail/vf-... or mail-attachment
      const linkMatch =
        fullTextContext.match(/(https:\/\/mail\.google\.com\/mail\/vf-[^\s<">]+)/i) ||
        rawHtmlText.match(/(https:\/\/mail\.google\.com\/mail\/vf-[^\s<">]+)/i) ||
        fullTextContext.match(/(https:\/\/[^\s<">]*google[^\s<">]*\/vf-[^\s<">]+)/i) ||
        rawHtmlText.match(/(https:\/\/[^\s<">]*google[^\s<">]*\/vf-[^\s<">]+)/i);

      const confirmCode = codeMatch ? codeMatch[1] : null;
      let confirmLink = linkMatch ? linkMatch[1] : null;

      if (confirmLink) {
        confirmLink = confirmLink.replace(/&amp;/g, "&").replace(/["'>]+$/, "");
      }

      // Store Verification Code and Link in DB so it shows on Website Dashboard
      await prisma.telegramUser.update({
        where: { id: matchedTgUser.id },
        data: {
          gmailVerificationCode: confirmCode,
          gmailVerificationLink: confirmLink,
        },
      });

      let confirmMsg = `🔑 <b>Gmail Auto-Forwarding Confirmation Request Received!</b>\n\nGoogle sent a verification email to complete your Gmail filter setup:\n\n`;

      if (confirmCode) {
        confirmMsg += `<b>Confirmation Code:</b> <code>${confirmCode}</code>\n\n`;
      }
      if (confirmLink) {
        confirmMsg += `🔗 <b>Verification Link:</b>\n<a href="${confirmLink}">Click Here to Approve Gmail Forwarding</a>\n\n`;
      }

      confirmMsg += `Copy this confirmation code into your Gmail Settings or check your ATSLift website dashboard to approve!`;

      await sendTelegramMessage(matchedTgUser.telegramChatId, confirmMsg);
      return NextResponse.json({ ok: true, type: "GMAIL_CONFIRMATION" });
    }

    // ── ATTACHMENT PARSING + REG NUMBER SHORTLIST DETECTION ──────────────────
    let userRegNumber = "";
    let isAtsEnabled = false;
    let fullUser: any = null;

    if (matchedTgUser.userId) {
      try {
        fullUser = await prisma.user.findUnique({
          where: { id: matchedTgUser.userId },
          include: { masterProfile: true, resumes: { take: 1, orderBy: { createdAt: "desc" } } },
        });
        userRegNumber = (fullUser?.masterProfile as any)?.registrationNumber?.trim() || "";
        if (!userRegNumber && fullUser?.resumes?.[0]?.content) {
          const content = fullUser.resumes[0].content as any;
          userRegNumber = String(content?.registrationNumber || content?.rollNumber || content?.regNo || "").trim();
        }
        isAtsEnabled = fullUser?.masterProfile?.atsCheckEnabled ?? false;
      } catch (dbErr: any) {
        console.warn("[Inbound] Could not fetch masterProfile with registrationNumber:", dbErr?.message || dbErr);
        try {
          const basicUser = await prisma.user.findUnique({
            where: { id: matchedTgUser.userId },
            select: {
              id: true,
              masterProfile: {
                select: {
                  id: true,
                  atsCheckEnabled: true,
                },
              },
            },
          });
          isAtsEnabled = basicUser?.masterProfile?.atsCheckEnabled ?? false;
        } catch (fallbackErr) {
          console.warn("[Inbound] User fetch fallback failed:", fallbackErr);
        }
      }
    }

    let shortlistMatch: AttachmentMatchResult | null = null;

    // 1. Check plain email body / text first (fast, zero-cost)
    if (userRegNumber) {
      const textSearch = searchRegNumberInText(fullTextContext + " " + rawHtmlText, userRegNumber);
      if (textSearch.found) {
        shortlistMatch = {
          found: true,
          source: "Email Body",
          row: null,
          contextSummary: textSearch.contextLine,
        };
      }
    }

    // 2. Check HTML tables in email body (frequently used by campus placement cells)
    if (!shortlistMatch && userRegNumber && rawHtmlText) {
      try {
        shortlistMatch = parseHtmlTableText(rawHtmlText, userRegNumber);
      } catch (e) {
        console.warn("[Inbound] HTML table parse error:", e);
      }
    }

    // 3. Try Google Sheets links in email body (exports entire workbook with all tabs)
    if (!shortlistMatch && userRegNumber) {
      try {
        shortlistMatch = await parseGoogleSheetsLink(fullTextContext + " " + rawHtmlText, userRegNumber);
      } catch (e) {
        console.warn("[Inbound] Google Sheets parse error:", e);
      }
    }

    // 4. Try Google Drive file links in email body (shared XLSX / PDF files)
    if (!shortlistMatch && userRegNumber) {
      try {
        shortlistMatch = await parseGoogleDriveLink(fullTextContext + " " + rawHtmlText, userRegNumber);
      } catch (e) {
        console.warn("[Inbound] Google Drive file parse error:", e);
      }
    }

    // 5. Parse attachments (JSON payload attachments, multipart form files, Resend downloads, or blobs)
    if (!shortlistMatch && userRegNumber) {
      const attachmentList: any[] = [...formAttachments];

      if (Array.isArray(payload.attachments)) {
        attachmentList.push(...payload.attachments);
      }
      if (Array.isArray(data.attachments)) {
        attachmentList.push(...data.attachments);
      }

      // Check form-data fields for attachments (ignore the 'attachments' key itself)
      const attachmentKeys = Object.keys(payload).filter(
        (k) => (k.toLowerCase().includes("attachment") || k.toLowerCase().includes("file")) && k !== "attachments"
      );
      for (const k of attachmentKeys) {
        const val = payload[k];
        if (Array.isArray(val)) {
          attachmentList.push(...val);
        } else if (val && typeof val === "object") {
          attachmentList.push(val);
        }
      }

      // If arriving from Resend, query receiving attachments and download actual file buffers
      if (resendApiKey && email_id) {
        // If webhook payload had no attachments array, query Resend receiving attachments endpoint
        if (attachmentList.length === 0) {
          try {
            const listRes = await fetch(`https://api.resend.com/emails/receiving/${email_id}/attachments`, {
              headers: { Authorization: `Bearer ${resendApiKey}` },
              signal: AbortSignal.timeout(8000),
            });
            if (listRes.ok) {
              const listJson = await listRes.json();
              const items = Array.isArray(listJson.data) ? listJson.data : (Array.isArray(listJson) ? listJson : []);
              attachmentList.push(...items);
            }
          } catch (listErr) {
            console.warn("[Inbound] Error listing attachments from Resend:", listErr);
          }
        }

        // For each attachment with an ID but without buffer, fetch its download_url and file content
        await Promise.all(
          attachmentList.map(async (att) => {
            if (!att.content && !att.data && !att.bytes && (att.id || att.attachment_id)) {
              const attId = att.id || att.attachment_id;
              try {
                const attRes = await fetch(
                  `https://api.resend.com/emails/receiving/${email_id}/attachments/${attId}`,
                  {
                    headers: { Authorization: `Bearer ${resendApiKey}` },
                    signal: AbortSignal.timeout(10000),
                  }
                );
                if (attRes.ok) {
                  const attData = await attRes.json();
                  const dlUrl = attData.download_url || attData.url;
                  if (dlUrl) {
                    const fileRes = await fetch(dlUrl, { signal: AbortSignal.timeout(15000) });
                    if (fileRes.ok) {
                      const ab = await fileRes.arrayBuffer();
                      att.content = Buffer.from(ab);
                      if (attData.filename && !att.filename) att.filename = attData.filename;
                      if (attData.content_type && !att.contentType) att.contentType = attData.content_type;
                    }
                  }
                }
              } catch (dlErr) {
                console.warn(`[Inbound] Failed fetching attachment buffer for ${attId}:`, dlErr);
              }
            }
          })
        );
      }

      if (attachmentList.length > 0) {
        console.log(`[Inbound Shortlist] Inspecting ${attachmentList.length} attachment(s) for Reg No: ${maskIdentifier(userRegNumber)}`);
      }

      for (const att of attachmentList) {
        try {
          const match = await processAttachmentItem(att, userRegNumber, {
            emailId: email_id,
            resendApiKey,
          });
          if (match && match.found) {
            shortlistMatch = match;
            console.log(`[Inbound Shortlist] Match found in attachment "${att.filename || match.source}" for Reg No: ${maskIdentifier(userRegNumber)}`);
            break;
          }
        } catch (attErr) {
          console.warn("[Inbound] Error processing attachment:", attErr);
        }
      }
    }

    // ── HIGH-SPEED 3-WAY PARALLEL PIPELINE ─────────────────────────────────
    // 1. If Shortlist Match is confirmed, we bypass heavy LLM eligibility checking & scoring entirely!
    // 2. If New Drive Announcement, we run JD extraction, eligibility verification, and ATS scoring
    //    ALL IN PARALLEL via Promise.allSettled with preloaded user data (0 redundant DB queries).
    const isShortlistFound = !!(shortlistMatch && shortlistMatch.found);

    const [extractSettled, eligSettled, atsSettled] = await Promise.allSettled([
      extractJdInfoWithLLM(fullTextContext, rawHtmlText),
      (!isShortlistFound && isAtsEnabled)
        ? evaluateUserEligibility({
            userId: matchedTgUser.userId,
            rawEmailText: fullTextContext,
            eligibilityCriteriaText: "",
            preloadedUser: fullUser,
          })
        : Promise.resolve(null),
      (!isShortlistFound && isAtsEnabled)
        ? runAtsScoreCheck({
            userId: matchedTgUser.userId,
            jobPostingText: fullTextContext,
            preloadedMasterProfile: fullUser?.masterProfile,
            triggeredBy: "auto_notification",
          })
        : Promise.resolve(null),
    ]);

    const extracted = extractSettled.status === "fulfilled" ? extractSettled.value : null;

    const companyName = (extracted && extracted.companyName && extracted.companyName !== "Placement Drive")
      ? extracted.companyName
      : (subject ? subject.replace(/^jd\s*/i, "").trim() || "Placement Drive" : "Placement Drive");

    const roleTitle = extracted?.roleTitle || "Software Engineer / Candidate";

    let eligText: string;
    if (typeof extracted?.eligibilityCriteria === "object" && extracted.eligibilityCriteria !== null) {
      const ec = extracted.eligibilityCriteria as Record<string, unknown>;
      if (ec.rawEligibilityText) {
        eligText = String(ec.rawEligibilityText);
      } else {
        const parts: string[] = [];
        if (ec.branches && Array.isArray(ec.branches)) parts.push(`Branches: ${(ec.branches as string[]).join(", ")}`);
        if (ec.cgpaCutoff) parts.push(`CGPA: ${ec.cgpaCutoff}`);
        if (ec.backlogPolicy) parts.push(String(ec.backlogPolicy));
        if (ec.percentageCutoff) parts.push(`${ec.percentageCutoff}`);
        eligText = parts.length > 0 ? parts.join(" | ") : "All Branches";
      }
    } else {
      eligText = String(extracted?.eligibilityCriteria || "All Branches");
    }

    const datesText = extracted?.otherImportantDates
      ? JSON.stringify(extracted.otherImportantDates)
      : null;

    // Process parallel eligibility results
    let eligCheckResult = "uncertain";
    let eligReason = "";
    let unmetCriteriaJson = "[]";
    let matchedCriteriaSummary = "";
    let atsScoreSection = "";
    let atsEdgeCaseNotice = "";

    if (eligSettled.status === "fulfilled" && eligSettled.value) {
      const evalRes = eligSettled.value;
      eligCheckResult = evalRes.result;
      eligReason = evalRes.reason;
      unmetCriteriaJson = JSON.stringify(evalRes.unmetCriteria || []);
      matchedCriteriaSummary = evalRes.matchedCriteriaSummary || "";
    }

    // Process parallel ATS scoring results
    if (atsSettled.status === "fulfilled" && atsSettled.value) {
      const scoreResult = atsSettled.value;
      if (scoreResult && typeof scoreResult.overallScore === "number") {
        const scoreTier =
          scoreResult.overallScore >= 80
            ? "Strong Match"
            : scoreResult.overallScore >= 60
              ? "Moderate Match"
              : "Needs Improvement";

        atsScoreSection += `\n\n🎯 <b>ATS Match Score: ${scoreResult.overallScore}% (${scoreTier})</b>`;

        const topGaps: string[] = [];
        if (Array.isArray(scoreResult.keywordGaps) && scoreResult.keywordGaps.length > 0) {
          topGaps.push(...scoreResult.keywordGaps.slice(0, 3));
        }
        if (topGaps.length < 3 && Array.isArray(scoreResult.improvements)) {
          for (const imp of scoreResult.improvements) {
            if (topGaps.length >= 3) break;
            const text = typeof imp === "string" ? imp : (imp?.suggestion || "");
            if (text && !topGaps.includes(text)) topGaps.push(text);
          }
        }
        if (topGaps.length > 0) {
          const safeGaps = topGaps.map((g) => escapeHtml(g.replace(/^\[.*?\]\s*/, ""))).join(", ");
          atsScoreSection += `\n⚡ <b>Top Improvements:</b> ${safeGaps}`;
        }
      }
    } else if (atsSettled.status === "rejected") {
      const atsErr = atsSettled.reason;
      console.warn("[Inbound ATS Score Auto-check error]:", atsErr?.message || atsErr);
      if (atsErr?.message === "NO_RESUME_FOUND") {
        atsEdgeCaseNotice = `\n\nℹ️ <i>Add a resume to My Space to see inline ATS match scores & gap analysis on new drive alerts.</i>`;
      } else if (atsErr?.message?.includes("limit reached")) {
        atsEdgeCaseNotice = `\n\nℹ️ <i>Daily automated ATS scoring limit reached (10/10 checks today). Use "Check ATS Readiness" inside the app to score this drive manually.</i>`;
      }
    }

    // Create JobPosting record in database in ONE single query (no secondary update required)
    const jobPosting = await prisma.jobPosting.create({
      data: {
        telegramUserId: matchedTgUser.id,
        companyName: companyName,
        roleTitle: roleTitle,
        eligibilityCriteria: eligText,
        packageDetails: extracted?.packageDetails || null,
        applicationDeadline: safeParseDate(extracted?.applicationDeadline),
        driveDate: safeParseDate(extracted?.driveDate),
        otherImportantDates: datesText,
        rawEmailText: rawEmailText || fullTextContext,
        eligibilityCheckResult: isAtsEnabled ? eligCheckResult : null,
        eligibilityReason: isAtsEnabled ? eligReason : null,
        unmetCriteria: isAtsEnabled ? unmetCriteriaJson : null,
        ...(isAtsEnabled && eligCheckResult === "not_eligible" ? { status: "NOT_ELIGIBLE" } : {}),
      },
    });

    // If ATS check created an unlinked record, link it asynchronously in the background
    if (atsSettled.status === "fulfilled" && atsSettled.value?.id) {
      prisma.atsScoreCheck.update({
        where: { id: atsSettled.value.id },
        data: { jobPostingId: jobPosting.id },
      }).catch(() => {});
    }

    // IF NOT ELIGIBLE & Feature ON: Suppress Telegram notification entirely (UNLESS student was shortlisted!)
    if (isAtsEnabled && eligCheckResult === "not_eligible" && !isShortlistFound) {
      console.log(`[Inbound] Notification SUPPRESSED for jobPosting ${jobPosting.id} - Student Not Eligible: ${eligReason}`);
      return NextResponse.json({
        ok: true,
        jobPostingId: jobPosting.id,
        notified: false,
        reason: eligReason,
      });
    }

    const deadlineFormatted = formatDateDDMMYYYY(jobPosting.applicationDeadline);

    // Sanitize eligibility text — strip any JSON artifacts before sending to Telegram
    const safeEligText = jobPosting.eligibilityCriteria
      .replace(/^\{.*\}$/, (json) => {
        try {
          const obj = JSON.parse(json) as Record<string, unknown>;
          const parts: string[] = [];
          if (obj.branches && Array.isArray(obj.branches)) parts.push(`Branches: ${(obj.branches as string[]).join(", ")}`);
          if (obj.cgpaCutoff) parts.push(`CGPA: ${obj.cgpaCutoff}`);
          if (obj.backlogPolicy) parts.push(String(obj.backlogPolicy));
          return parts.length > 0 ? parts.join(" | ") : json;
        } catch { return json; }
      });

    const displayEligText = (isAtsEnabled && matchedCriteriaSummary) ? matchedCriteriaSummary : safeEligText;

    // ── TELEGRAM MESSAGE BUILDER ──────────────────────────────────────────────
    const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://atslift.com");
    const deepLinkUrl = `${baseUrl.replace(/\/$/, "")}/automations?openAtsCheck=${jobPosting.id}`;

    let tgMsg: string;
    let inlineKeyboard: object;

    if (shortlistMatch && shortlistMatch.found) {
      // ── 🎉 SMART CONTEXT-ADAPTIVE SHORTLIST ALERT ────────────────────────
      const formatted = formatShortlistTelegramMessage({
        companyName,
        roleTitle,
        userRegNumber,
        shortlistMatch,
        subject,
        rawEmailText: fullTextContext,
      });

      tgMsg = formatted.text;

      inlineKeyboard = {
        inline_keyboard: [
          [
            { text: "📝 View Drive Details", url: deepLinkUrl },
            { text: "✅ Applied", callback_data: `applied:${jobPosting.id}` },
          ],
        ],
      };

      console.log(`[Inbound] 🎉 SHORTLIST MATCH (${formatted.eventType}) for reg: ${maskIdentifier(userRegNumber)}, company: ${companyName}`);
    } else {
      // ── 📢 NEW DRIVE ANNOUNCEMENT MODE ──────────────────────────────────
      tgMsg = `📢 <b>New Placement Drive — ${escapeHtml(companyName)}!</b>\n\n`;
      tgMsg += `💼 <b>Role:</b> ${escapeHtml(roleTitle)}\n`;
      tgMsg += `🎓 <b>Eligibility:</b> ${escapeHtml(displayEligText)}\n`;
      if (jobPosting.packageDetails) {
        tgMsg += `💰 <b>CTC / Stipend:</b> ${escapeHtml(jobPosting.packageDetails)}\n`;
      }
      tgMsg += `⏰ <b>Apply By:</b> <b>${deadlineFormatted || "Check email"}</b>`;

      if (userRegNumber) {
        tgMsg += `\n\n🔍 <i>Shortlist tracking active for Reg No <code>${escapeHtml(userRegNumber)}</code> — we'll alert you instantly if your ID appears in any attachment.</i>`;
      } else {
        tgMsg += `\n\n💡 <i>Tip: Add your Placement Reg. Number in My Space to get auto-alerts whenever shortlists or interview slots drop!</i>`;
      }

      if (atsScoreSection) {
        tgMsg += atsScoreSection;
      } else if (atsEdgeCaseNotice) {
        tgMsg += atsEdgeCaseNotice;
      }

      if (isAtsEnabled && eligCheckResult === "uncertain") {
        tgMsg += `\n\n⚠️ <i>Eligibility couldn't be fully verified — double-check the criteria. (${escapeHtml(eligReason || "Profile or JD criteria unverified")})</i>`;
      }

      inlineKeyboard = isAtsEnabled
        ? {
          inline_keyboard: [
            [
              { text: "📝 Update Resume", url: deepLinkUrl },
              { text: "✅ Applied", callback_data: `applied:${jobPosting.id}` },
              { text: "⏭️ Skip", callback_data: `skip:${jobPosting.id}` },
            ],
          ],
        }
        : {
          inline_keyboard: [
            [
              { text: "✅ Applied", callback_data: `applied:${jobPosting.id}` },
              { text: "❌ Not Eligible", callback_data: `not_eligible:${jobPosting.id}` },
              { text: "⏭️ Skip", callback_data: `skip:${jobPosting.id}` },
            ],
          ],
        };
    }

    console.log(`[Inbound] Sending Telegram to chatId: ${maskIdentifier(matchedTgUser.telegramChatId)}, company: ${jobPosting.companyName}`);
    const tgResult = await sendTelegramMessage(matchedTgUser.telegramChatId, tgMsg, inlineKeyboard);
    console.log(`[Inbound] Telegram send result: ${tgResult}`);
    if (!tgResult) {
      console.error(`[Inbound] Telegram message FAILED for jobPosting: ${jobPosting.id}`);
    }

    return NextResponse.json({
      ok: true,
      jobPostingId: jobPosting.id,
      notified: true,
      shortlistDetected: shortlistMatch?.found ?? false,
      eligibilityResult: eligCheckResult,
    });
  } catch (error) {
    console.error("Error in /api/resend/inbound:", error instanceof Error ? error.stack || error.message : error);
    return NextResponse.json(
      {
        message: "Internal server error",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Find a cell value by any of the given keyword patterns */
function getCell(cells: Record<string, string>, keywords: string[]): string | null {
  for (const kw of keywords) {
    for (const [key, val] of Object.entries(cells)) {
      const strVal = String(val ?? "").trim();
      if (key.toLowerCase().includes(kw.toLowerCase()) && strVal) {
        return strVal;
      }
    }
  }
  return null;
}
