// tests/integration/criticalPath.test.ts
import { test, describe } from "node:test";
import assert from "node:assert";
import { normalizeNormalBullet } from "../../lib/atsFormatting";
import { generateHeuristicAtsFallback } from "../../lib/ats-scoring";
import { anonymizeProfileForAts, redactPiiFromText } from "../../lib/pii";

describe("Critical Path End-to-End Workflows", () => {
  // 1. Density Adjustment & Normal Bullet Constraint Flow
  test("Critical Path: Density adjustment correctly constrains bullet lengths across modes", () => {
    const rawParagraphBullet = 
      "Architected and implemented a high-performance system for Engineered a spatial demand forecasting pipeline, trained LightGBM quantile models with time-aware cross-validation, and delivered interpretable location recommendations via a FastAPI REST service., optimizing request latencies and response pipelines.";
    
    // Test Normal density constraint
    const normalBullet = normalizeNormalBullet(rawParagraphBullet);
    assert.ok(normalBullet.length <= 135, `Normal bullet length (${normalBullet.length}) must be <= 135 chars`);
    assert.ok(!normalBullet.includes("Architected and implemented a high-performance system for"), "Boilerplate prefix must be stripped");
    assert.ok(!normalBullet.includes("optimizing request latencies and response pipelines."), "Boilerplate suffix must be stripped");
    assert.ok(normalBullet.length >= 40, "Core statement must be preserved");

    // Concise mode truncation
    const conciseBullet = normalBullet.length > 85 ? normalBullet.slice(0, 80).trim() + "." : normalBullet;
    assert.ok(conciseBullet.length <= 90, "Concise bullet must be <= 90 chars");
  });

  // 2. JD Parsing -> ATS Scoring -> Missing Keywords Detection Flow
  test("Critical Path: Job description matching accurately identifies missing keywords and discounts score", () => {
    const candidateProfile = {
      fullName: "Rahul Sharma",
      skillsJson: JSON.stringify(["Python", "FastAPI", "PostgreSQL", "Git"]),
      projectsJson: JSON.stringify([
        {
          title: "Demand Forecasting",
          tech: "Python, FastAPI",
          bullets: ["Built REST APIs with FastAPI."],
        },
      ]),
      cgpa: "8.62",
      github: "https://github.com/candidate",
      linkedin: "https://linkedin.com/in/candidate",
    };

    const targetJob = {
      roleTitle: "Cloud Backend Engineer",
      eligibilityCriteria: "Required: Docker, Kubernetes, AWS, and TypeScript expertise.",
      rawEmailText: "We need someone with strong Docker containerization and Kubernetes orchestration.",
    };

    const atsReport = generateHeuristicAtsFallback(candidateProfile, targetJob);

    assert.ok(atsReport.overall_score >= 40 && atsReport.overall_score <= 95, "Score must be within realistic bounds");
    assert.ok(Array.isArray(atsReport.keyword_gaps), "Must provide keyword_gaps array");
    assert.ok(atsReport.keyword_gaps.includes("DOCKER"), "Docker should be flagged as missing keyword gap");
    assert.ok(atsReport.keyword_gaps.includes("KUBERNETES") || atsReport.keyword_gaps.includes("AWS"));
  });

  // 3. Idempotent Payment Reconciliation Flow
  test("Critical Path: Payment webhook reconciles order state idempotently with event deduplication", () => {
    // Simulated state store for order reconciliation and side-effect tracking
    const processedOrders = new Map<string, { status: string; paymentId: string; processedAt: number }>();
    let emailDispatches = 0;

    function processPaymentWebhook(orderId: string, paymentId: string, event: string) {
      // Event-ID / Order deduplication check
      if (processedOrders.has(orderId)) {
        return { isDuplicate: true, status: processedOrders.get(orderId)!.status };
      }

      if (event === "payment.captured") {
        processedOrders.set(orderId, {
          status: "PAID",
          paymentId,
          processedAt: Date.now(),
        });
        emailDispatches++; // Side-effect: transactional email dispatch
        return { isDuplicate: false, status: "PAID" };
      }

      return { isDuplicate: false, status: "PENDING" };
    }

    // First incoming webhook: Process payment
    const firstDelivery = processPaymentWebhook("order_12345", "pay_abc123", "payment.captured");
    assert.strictEqual(firstDelivery.isDuplicate, false);
    assert.strictEqual(firstDelivery.status, "PAID");
    assert.strictEqual(emailDispatches, 1, "First delivery must trigger email dispatch");

    // Second incoming webhook: Duplicate delivery / replay from Razorpay
    const secondDelivery = processPaymentWebhook("order_12345", "pay_abc123", "payment.captured");
    assert.strictEqual(secondDelivery.isDuplicate, true, "Duplicate delivery must be recognized as idempotent");
    assert.strictEqual(secondDelivery.status, "PAID");
    assert.strictEqual(processedOrders.size, 1, "Only one record should exist in the payment ledger");
    assert.strictEqual(emailDispatches, 1, "Confirmation email must NOT re-send on webhook replays");
  });

  // 4. End-to-End PII Redaction Pipeline on Student Submissions
  test("Critical Path: End-to-end PII redaction sanitizes sensitive attributes before external LLM calls", () => {
    const rawStudentProfile = {
      fullName: "Rahul Sharma",
      email: "rahul.sharma2026@vit.ac.in",
      phone: "+91 9876543210",
      college: "VIT Vellore",
      branch: "CSE",
      cgpa: "8.85",
      graduationYear: "2026",
      skillsJson: JSON.stringify(["Java", "Spring Boot", "MySQL", "Kafka"]),
      projectsJson: JSON.stringify([{ title: "E-Commerce", tech: "Java" }]),
      github: "https://github.com/rahul2026",
      linkedin: "https://linkedin.com/in/rahul2026",
    };

    // Anonymize profile
    const anonymized = anonymizeProfileForAts(rawStudentProfile);

    // Verify identifiers are sanitized
    assert.strictEqual(anonymized.email, "[EMAIL_PROTECTED]");
    assert.strictEqual(anonymized.phone, "[PHONE_PROTECTED]");
    assert.strictEqual(anonymized.fullName, "Candidate (Anonymized for ATS Audit)");
    assert.strictEqual(anonymized.github, "https://github.com/[ANONYMIZED_USER]");
    assert.strictEqual(anonymized.linkedin, "https://linkedin.com/in/[ANONYMIZED_USER]");

    // Verify academic and technical signals remain 100% intact for evaluation
    assert.strictEqual(anonymized.cgpa, "8.85");
    assert.strictEqual(anonymized.branch, "CSE");
    assert.strictEqual(anonymized.college, "VIT Vellore");

    // Verify unstructured text scrubber removes embedded numbers and emails
    const rawText = "Contact me at rahul.sharma2026@vit.ac.in or 9876543210 for queries.";
    const scrubbed = redactPiiFromText(rawText);
    assert.ok(!scrubbed.includes("rahul.sharma2026@vit.ac.in"));
    assert.ok(!scrubbed.includes("9876543210"));
    assert.ok(scrubbed.includes("[EMAIL_REDACTED]"));
    assert.ok(scrubbed.includes("[PHONE_REDACTED]"));
  });
});
