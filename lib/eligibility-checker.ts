// lib/eligibility-checker.ts
import { prisma } from "@/lib/prisma";
import { generateLlmText } from "@/lib/llm";
import { formatProfileDataForPrompt } from "@/lib/ats-scoring";

export type EligibilityResultType = "eligible" | "not_eligible" | "uncertain";

export interface EligibilityCheckResult {
  result: EligibilityResultType;
  reason: string;
  unmetCriteria: string[];
  matchedCriteriaSummary?: string;
}

export function buildEligibilityPrompt(profileText: string, rawEmailText: string, eligibilityCriteriaText: string): string {
  return `You are an automated Campus Placement Eligibility Verifier for Indian engineering college placement cells.
Compare the student's My Space profile against the Placement Drive Job Description (JD) eligibility criteria.

=== STUDENT MY SPACE PROFILE ===
${profileText}

=== PLACEMENT DRIVE ELIGIBILITY CRITERIA ===
${eligibilityCriteriaText}

=== FULL EMAIL TEXT FOR CONTEXT ===
${rawEmailText.slice(0, 4000)}

CRITICAL EVALUATION RULES:
1. "eligible": Set to TRUE only if the student clearly satisfies ALL specified eligibility criteria (branch, CGPA cutoff, graduation year, etc.).
2. "not_eligible": Set to FALSE only if the student clearly violates an explicit requirement (e.g. JD requires Civil Engineering, but student is CSE; or JD requires CGPA 8.0, but student has 6.5).
3. "uncertain": Set to "uncertain" if ANY of the following apply:
   - The criteria is vague or unstated in the email.
   - The student's profile is missing a field needed to check (e.g. student hasn't entered CGPA, or email requires 12th % and profile lacks 12th %).
   *NOTE: It is critical NOT to wrongly reject a student. When in doubt, return "uncertain".*
4. "matched_summary": Produce a concise 1-line personalized match summary for THIS SPECIFIC STUDENT (e.g., "B.Tech CSE | CGPA ≥ 6.0 | 0 Active Backlogs").
   - CRITICAL RULE FOR BRANCHES: Do NOT dump all 10-15 eligible branches listed in the JD email! Output ONLY the student's specific branch that matched (e.g., "B.Tech CSE" instead of "All B.Tech CSE, ECE, EEE, Mech...").

STRICT JSON OUTPUT FORMAT (Respond ONLY with valid JSON, no markdown wrappers, no commentary):
{
  "eligible": true, // true, false, or "uncertain"
  "reason": "Clear 1-sentence explanation of the match or mismatch.",
  "unmet_criteria": ["Array of specific criteria strings not met, if any"],
  "matched_summary": "B.Tech CSE | CGPA ≥ 6.0 Cutoff Met | 0 Standing Arrears"
}`;
}

export async function evaluateUserEligibility(params: {
  userId: string;
  rawEmailText: string;
  eligibilityCriteriaText?: string;
  preloadedUser?: any;
}): Promise<EligibilityCheckResult> {
  const { userId, rawEmailText, eligibilityCriteriaText = "", preloadedUser } = params;

  try {
    // 1. Fetch User Profile (reuse preloaded user to eliminate DB roundtrip)
    const user =
      preloadedUser ||
      (await prisma.user.findUnique({
        where: { id: userId },
        include: { masterProfile: true, resumes: { take: 1, orderBy: { createdAt: "desc" } } },
      }));

    if (!user) {
      return {
        result: "uncertain",
        reason: "User account not found — notifying by default.",
        unmetCriteria: [],
      };
    }

    let profileText = "";
    if (user.masterProfile) {
      profileText = formatProfileDataForPrompt(user.masterProfile);
    } else if (user.resumes.length > 0) {
      try {
        const inputData = JSON.parse(user.resumes[0].inputData || "{}");
        profileText = `Branch: ${user.resumes[0].branch || inputData.personal?.branch || "N/A"}
CGPA: ${user.resumes[0].cgpa || inputData.personal?.cgpa || "N/A"}
College: ${user.resumes[0].college || inputData.personal?.collegeName || "N/A"}
Target Role: ${user.resumes[0].targetRole || "N/A"}`;
      } catch (e) {
        profileText = `Branch: ${user.resumes[0].branch || "N/A"}, CGPA: ${user.resumes[0].cgpa || "N/A"}`;
      }
    }

    if (!profileText || profileText.trim().length === 0) {
      return {
        result: "uncertain",
        reason: "No profile data or resume found in My Space to verify eligibility.",
        unmetCriteria: [],
      };
    }

    // 2. Build Prompt & Execute LLM Evaluation with 1 Retry
    const prompt = buildEligibilityPrompt(profileText, rawEmailText, eligibilityCriteriaText);
    let parsed: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const responseText = await generateLlmText(prompt, { json: true });
        const cleanJson = responseText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        parsed = JSON.parse(cleanJson);
        if (parsed && (parsed.eligible === true || parsed.eligible === false || parsed.eligible === "uncertain" || typeof parsed.eligible === "boolean")) {
          break;
        }
      } catch (err) {
        console.warn(`[eligibility-checker] LLM Attempt ${attempt} failed:`, err);
      }
    }

    if (!parsed) {
      return {
        result: "uncertain",
        reason: "Eligibility evaluator temporarily unavailable — defaulting to notify user.",
        unmetCriteria: [],
      };
    }

    // Map output to standardized type
    let resultType: EligibilityResultType = "uncertain";
    if (parsed.eligible === true) {
      resultType = "eligible";
    } else if (parsed.eligible === false) {
      resultType = "not_eligible";
    } else {
      resultType = "uncertain";
    }

    return {
      result: resultType,
      reason: String(parsed.reason || "Eligibility evaluated."),
      unmetCriteria: Array.isArray(parsed.unmet_criteria) ? parsed.unmet_criteria.map(String) : [],
      matchedCriteriaSummary: parsed.matched_summary ? String(parsed.matched_summary) : undefined,
    };
  } catch (error: any) {
    console.error("[evaluateUserEligibility error]:", error);
    return {
      result: "uncertain",
      reason: "Eligibility verification system error — defaulting to notify user.",
      unmetCriteria: [],
    };
  }
}
