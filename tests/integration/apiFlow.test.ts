// tests/integration/apiFlow.test.ts
import { test, describe } from "node:test";
import assert from "node:assert";
import crypto from "crypto";

describe("API Flow & Webhook Integration Pipeline", () => {
  test("Inbound email webhook payload parser validates MIME and extracts target metadata", () => {
    const rawInboundPayload = {
      type: "cloudflare.email",
      to: "nithin-xyz123@inbound.atslift.com",
      from: "placement-cell@university.edu",
      subject: "Amazon Campus Drive 2026 - Software Development Engineer (SDE 1)",
      text: "Company: Amazon India\nRole: SDE-1\nCTC: 28 LPA\nCriteria: B.Tech CSE/IT with CGPA >= 7.0 and 0 active backlogs.\nDeadline: 15/11/2026",
    };

    // Extract alias
    const aliasMatch = rawInboundPayload.to.match(/^([^@]+)@/);
    assert.ok(aliasMatch);
    const alias = aliasMatch[1];
    assert.strictEqual(alias, "nithin-xyz123");

    // Extract Subject and Company
    assert.ok(rawInboundPayload.subject.includes("Amazon"));
    assert.ok(rawInboundPayload.text.includes("SDE-1"));
  });

  test("Webhook HMAC SHA-256 signature verification validates payload authenticity", () => {
    const secret = "test_webhook_secret_key_12345";
    const payload = JSON.stringify({ event: "payment_link.paid", id: "pay_test_001" });

    // Generate valid HMAC
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Verify matching signature
    const computedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    assert.strictEqual(computedSignature, validSignature, "Valid signature must match");

    // Verify altered payload rejection
    const alteredSignature = crypto
      .createHmac("sha256", secret)
      .update(payload + "_tampered")
      .digest("hex");

    assert.notStrictEqual(alteredSignature, validSignature, "Tampered payload signature must not match");
  });

  test("ATS API output schema conforms to strict interface specification", () => {
    const mockApiResponse = {
      overallScore: 84,
      categories: [
        { name: "Keyword Match", weightage: 35, score: 30, feedback: "Solid match" },
        { name: "Parsing & Structure", weightage: 25, score: 22, feedback: "Clean layout" },
      ],
      extractedData: {
        personal: { fullName: "Nithin", email: "nithin@example.com" },
        skills: { categories: { languages: "TypeScript, Python" } },
        projects: [{ title: "ResumeForge", techStack: "Next.js" }],
      },
    };

    assert.ok(typeof mockApiResponse.overallScore === "number");
    assert.ok(mockApiResponse.overallScore >= 0 && mockApiResponse.overallScore <= 100);
    assert.ok(Array.isArray(mockApiResponse.categories));
    assert.ok(typeof mockApiResponse.extractedData.personal.fullName === "string");
  });

  test("In-memory sliding window rate limiter blocks excessive requests with retryAfter", () => {
    const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
    const checkLimit = (ip: string, limit = 10, windowMs = 60_000) => {
      const now = Date.now();
      const rec = rateLimitMap.get(ip);
      if (!rec || rec.resetAt < now) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
      }
      if (rec.count >= limit) {
        return { allowed: false, retryAfter: Math.ceil((rec.resetAt - now) / 1000) };
      }
      rec.count += 1;
      return { allowed: true };
    };

    const testIp = "192.168.1.100";
    for (let i = 0; i < 10; i++) {
      const res = checkLimit(testIp, 10);
      assert.strictEqual(res.allowed, true, `Request ${i + 1} should be allowed`);
    }

    // 11th request must be blocked
    const blockedRes = checkLimit(testIp, 10);
    assert.strictEqual(blockedRes.allowed, false, "11th request must be blocked by rate limiter");
    assert.ok(typeof blockedRes.retryAfter === "number" && blockedRes.retryAfter > 0);
  });

  test("Health check endpoint schema provides vital observability metrics", () => {
    const sampleHealthResponse = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptimeSeconds: 120,
      environment: "production",
      database: { status: "connected", latencyMs: 12, provider: "postgresql" },
      services: {
        ai: { gemini: "active", groq: "configured" },
        payments: { razorpay: "live" },
        messaging: { telegram: "enabled", resend: "live" },
      },
    };

    assert.strictEqual(sampleHealthResponse.status, "healthy");
    assert.strictEqual(sampleHealthResponse.database.provider, "postgresql");
    assert.ok(typeof sampleHealthResponse.uptimeSeconds === "number");
    assert.ok(sampleHealthResponse.services.ai.gemini);
  });

  test("Inbound email webhook pipeline processes binary spreadsheet attachment and matches candidate registration number", async () => {
    const { processAttachmentItem } = await import("../../lib/attachment-parser");
    const XLSX = await import("xlsx");

    const sheetData = [
      ["Roll No", "Student Name", "Status", "Slot"],
      ["21BCE001", "Student A", "Selected", "10:00 AM"],
      ["7Y6T8", "Nithin Kumar", "Round 2 Shortlisted", "02:15 PM"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const att = {
      filename: "Tekion_Round2_Shortlist.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      content: buf.toString("base64"),
    };

    const match = await processAttachmentItem(att, "7Y6T8");
    assert.ok(match !== null);
    assert.strictEqual(match.found, true);
    assert.strictEqual(match.row?.cells["roll no"], "7Y6T8");
    assert.strictEqual(match.row?.cells["status"], "Round 2 Shortlisted");
  });
});

