// lib/ats-scoring.ts
import { prisma } from "@/lib/prisma";
import { generateLlmText } from "@/lib/llm";
import { logger } from "@/lib/logger";
import { anonymizeProfileForAts, redactPiiFromText } from "@/lib/pii";

export const DAILY_ATS_CHECK_LIMIT = 10;

export interface AtsCheckResult {
  id: string;
  userId: string;
  masterProfileId: string | null;
  jobPostingId: string | null;
  overallScore: number;
  keywordGaps: string[];
  structuralIssues: string[];
  contentIssues: string[];
  improvements: Array<{ suggestion: string; relatedTo: string }>;
  strengths: string[];
  createdAt: Date;
}

export interface AtsScoringOutput {
  overall_score: number;
  keyword_gaps: string[];
  structural_issues: string[];
  content_issues: string[];
  improvements: Array<{ suggestion: string; relatedTo: string }>;
  strengths: string[];
}

/**
 * Isolated Prompt Template for ATS Scoring & Gap Analysis.
 * Can be iterated independently from execution logic.
 */
export function buildAtsScoringPrompt(profileDataText: string, jobPostingText?: string): string {
  const cleanProfile = redactPiiFromText(profileDataText);
  const cleanJd = jobPostingText ? redactPiiFromText(jobPostingText) : undefined;
  return `You are an expert ATS (Applicant Tracking System) Auditor and Senior Technical Recruiter.
Analyze the following student resume/profile data against ${
    cleanJd ? "the provided Job Description (JD)" : "general engineering ATS standards"
  }.

=== STUDENT RESUME / MY SPACE PROFILE DATA ===
${cleanProfile}

${
  cleanJd
    ? `=== TARGET JOB DESCRIPTION (JD) ===
${cleanJd}`
    : "=== NO SPECIFIC JD PROVIDED (General ATS Readiness Evaluation) ==="
}

INSTRUCTIONS:
1. Provide an overall ATS Match / Quality Score from 0 to 100 based on keyword match, bullet impact, clarity, and structural completeness.
2. Identify missing key skills, frameworks, or domain keywords required by the JD (if no JD, return empty array for keyword_gaps).
3. Identify structural or formatting issues (e.g. missing contact links, summary length, missing section depth).
4. Identify content issues (e.g. unquantified project bullets, weak action verbs, vague descriptions).
5. Provide specific, actionable improvements with the section it relates to (e.g., "Skills", "Projects", "Experience", "Summary", "Academics").
6. Highlight key strengths already aligned well.

STRICT JSON OUTPUT FORMAT (Respond ONLY with valid JSON, no markdown wrappers, no commentary):
{
  "overall_score": 85,
  "keyword_gaps": ["Docker", "Kubernetes", "AWS S3"],
  "structural_issues": ["No LinkedIn or GitHub link provided"],
  "content_issues": ["Project 1 bullet points lack metrics (e.g. latency, users, throughput)"],
  "improvements": [
    { "suggestion": "Highlight TypeScript and REST APIs under Skills to match JD requirements", "relatedTo": "Skills" },
    { "suggestion": "Add quantitative metrics to your backend project description", "relatedTo": "Projects" }
  ],
  "strengths": ["Strong CGPA", "Relevant React and Node.js experience"]
}`;
}

/** Helper to format MasterProfile into a clean readable text representation */
export function formatProfileDataForPrompt(
  profile: any,
  options?: { anonymize?: boolean }
): string {
  const target = options?.anonymize ? anonymizeProfileForAts(profile) : profile;
  const lines: string[] = [];

  lines.push(`Full Name: ${target.fullName || "N/A"}`);
  lines.push(`Email: ${target.email || "N/A"}`);
  lines.push(`College: ${target.college || "N/A"}`);
  lines.push(`Branch: ${target.branch || "N/A"}`);
  lines.push(`CGPA: ${target.cgpa || "N/A"}`);
  lines.push(`Graduation Year: ${target.graduationYear || "N/A"}`);
  lines.push(`Active Backlogs (Arrears): ${target.activeBacklogs !== null && target.activeBacklogs !== undefined ? target.activeBacklogs : "0"}`);
  lines.push(`Total Backlog History: ${target.backlogHistory !== null && target.backlogHistory !== undefined ? target.backlogHistory : "0"}`);
  lines.push(`Academic Gap Years: ${target.academicGapYears !== null && target.academicGapYears !== undefined ? target.academicGapYears : "0"}`);
  lines.push(`Notice Period: ${target.noticePeriod || "N/A"}`);

  if (target.github) lines.push(`GitHub: ${target.github}`);
  if (target.linkedin) lines.push(`LinkedIn: ${target.linkedin}`);
  if (target.portfolio) lines.push(`Portfolio: ${target.portfolio}`);

  if (target.summary) {
    lines.push(`\n--- SUMMARY ---\n${target.summary}`);
  }

  // Skills
  try {
    const skills = JSON.parse(target.skillsJson || "[]");
    if (Array.isArray(skills) && skills.length > 0) {
      lines.push(`\n--- SKILLS ---\n${skills.join(", ")}`);
    }
  } catch (e) {}

  // Education
  try {
    const edus = JSON.parse(profile.educationJson || "[]");
    if (Array.isArray(edus) && edus.length > 0) {
      lines.push("\n--- EDUCATION ---");
      edus.forEach((e: any) => {
        lines.push(`- ${e.type || e.degree}: ${e.institution || ""} (${e.branch || ""}) CGPA/Percentage: ${e.cgpaOrPercentage || "N/A"} Year: ${e.graduationYear || ""}`);
      });
    }
  } catch (e) {}

  // Projects
  try {
    const projects = JSON.parse(profile.projectsJson || "[]");
    if (Array.isArray(projects) && projects.length > 0) {
      lines.push("\n--- PROJECTS ---");
      projects.forEach((p: any) => {
        const title = p.title || p.name || "Project";
        const tech = p.techStack || p.technologies || "";
        const desc = p.description || p.details || (Array.isArray(p.bullets) ? p.bullets.join("\n") : "");
        lines.push(`- ${title}${tech ? ` (${tech})` : ""}:\n  ${desc}`);
      });
    }
  } catch (e) {}

  // Experience
  try {
    const exps = JSON.parse(profile.experiencesJson || "[]");
    if (Array.isArray(exps) && exps.length > 0) {
      lines.push("\n--- EXPERIENCE ---");
      exps.forEach((x: any) => {
        const role = x.role || x.position || "Intern/Developer";
        const company = x.company || x.organization || "";
        const desc = x.description || (Array.isArray(x.bullets) ? x.bullets.join("\n") : "");
        lines.push(`- ${role} at ${company}:\n  ${desc}`);
      });
    }
  } catch (e) {}

  // Certifications
  try {
    const certs = JSON.parse(profile.certificationsJson || "[]");
    if (Array.isArray(certs) && certs.length > 0) {
      lines.push(`\n--- CERTIFICATIONS ---\n${certs.map((c: any) => typeof c === "string" ? c : `${c.name} (${c.year || ""})`).join(", ")}`);
    }
  } catch (e) {}

  // Achievements
  try {
    const achs = JSON.parse(profile.achievementsJson || "[]");
    if (Array.isArray(achs) && achs.length > 0) {
      lines.push(`\n--- ACHIEVEMENTS & AWARDS ---\n${achs.join("\n")}`);
    }
  } catch (e) {}

  return lines.join("\n");
}

/** Check user's daily ATS check rate limit */
export async function getDailyAtsCheckCount(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.atsScoreCheck.count({
    where: {
      userId,
      createdAt: { gte: startOfDay },
    },
  });
}

/**
 * Heuristic fallback scoring algorithm used when LLM calls fail, time out,
 * or return unparseable JSON. Ensures zero downtime and graceful degradation.
 */
export function generateHeuristicAtsFallback(profile: any, jobPosting?: any): AtsScoringOutput {
  let score = 50; // Base score
  const keyword_gaps: string[] = [];
  const structural_issues: string[] = [];
  const content_issues: string[] = [];
  const improvements: Array<{ suggestion: string; relatedTo: string }> = [];
  const strengths: string[] = [];

  // 1. Links & Contact Info Evaluation
  if (profile.github && profile.github.trim()) {
    score += 5;
    strengths.push("GitHub technical profile provided");
  } else {
    structural_issues.push("Missing GitHub profile link");
    improvements.push({ suggestion: "Add your GitHub profile URL to showcase open-source and coding repositories", relatedTo: "Academics" });
  }

  if (profile.linkedin && profile.linkedin.trim()) {
    score += 5;
    strengths.push("Professional LinkedIn profile linked");
  } else {
    structural_issues.push("Missing LinkedIn profile link");
    improvements.push({ suggestion: "Add your LinkedIn URL for recruiter verification", relatedTo: "General" });
  }

  // 2. Skills Depth
  let parsedSkills: string[] = [];
  try {
    parsedSkills = JSON.parse(profile.skillsJson || "[]");
  } catch (e) {}

  if (parsedSkills.length >= 8) {
    score += 15;
    strengths.push(`Strong technical skill depth (${parsedSkills.length} skills listed)`);
  } else if (parsedSkills.length >= 4) {
    score += 8;
  } else {
    content_issues.push("Low technical skills density");
    improvements.push({ suggestion: "Expand technical skills section to include core languages, frameworks, and databases", relatedTo: "Skills" });
  }

  // 3. Projects Evaluation
  let parsedProjects: any[] = [];
  try {
    parsedProjects = JSON.parse(profile.projectsJson || "[]");
  } catch (e) {}

  if (parsedProjects.length >= 2) {
    score += 15;
    strengths.push(`Multiple technical projects included (${parsedProjects.length} projects)`);
    const hasMetrics = parsedProjects.some((p: any) => {
      const text = `${p.description || ""} ${p.details || ""}`;
      return /%|\bms\b|\bsec\b|\busers\b|\blatency\b|\d+x\b/i.test(text);
    });
    if (!hasMetrics) {
      content_issues.push("Project bullet points lack quantifiable impact metrics");
      improvements.push({ suggestion: "Quantify project impact with measurable numbers (e.g., latency reduction, throughput, user count)", relatedTo: "Projects" });
    }
  } else if (parsedProjects.length === 1) {
    score += 8;
    improvements.push({ suggestion: "Add at least 2 in-depth software engineering projects to demonstrate breadth", relatedTo: "Projects" });
  } else {
    structural_issues.push("No engineering projects listed");
    improvements.push({ suggestion: "Add projects demonstrating your core programming and system-building abilities", relatedTo: "Projects" });
  }

  // 4. Academics & CGPA
  if (profile.cgpa && parseFloat(profile.cgpa) >= 7.5) {
    score += 10;
    strengths.push(`Solid academic performance (${profile.cgpa} CGPA)`);
  }

  // 5. Job Description Alignment (if JD provided)
  if (jobPosting && jobPosting.roleTitle) {
    const jdText = `${jobPosting.roleTitle} ${jobPosting.eligibilityCriteria || ""} ${jobPosting.rawEmailText || ""}`.toLowerCase();
    const commonKeywords = ["docker", "aws", "kubernetes", "sql", "typescript", "python", "react", "node", "redis", "ci/cd"];
    
    for (const kw of commonKeywords) {
      if (jdText.includes(kw) && !parsedSkills.some(s => s.toLowerCase().includes(kw))) {
        keyword_gaps.push(kw.toUpperCase());
        if (keyword_gaps.length >= 3) break;
      }
    }
    if (keyword_gaps.length > 0) {
      improvements.push({
        suggestion: `Tailor your resume by adding keywords matching the job description: ${keyword_gaps.join(", ")}`,
        relatedTo: "Skills"
      });
    }
  }

  return {
    overall_score: Math.min(95, Math.max(35, score)),
    keyword_gaps,
    structural_issues,
    content_issues,
    improvements,
    strengths,
  };
}

/**
 * Main Scoring Engine function.
 * Fetches user profile + optional JobPosting, generates ATS analysis via LLM with 1 retry,
 * stores the result in prisma.atsScoreCheck, and returns the record.
 */
export async function runAtsScoreCheck(params: {
  userId: string;
  jobPostingId?: string;
  jobPostingText?: string;
  preloadedMasterProfile?: any;
  triggeredBy?: "manual" | "auto_notification";
}): Promise<AtsCheckResult> {
  const { userId, jobPostingId, jobPostingText: customJdText, preloadedMasterProfile, triggeredBy = "manual" } = params;

  // 1. Enforce Rate Limit
  const dailyCount = await getDailyAtsCheckCount(userId);
  if (dailyCount >= DAILY_ATS_CHECK_LIMIT) {
    throw new Error(`Daily ATS check limit reached (${DAILY_ATS_CHECK_LIMIT}/${DAILY_ATS_CHECK_LIMIT} per day). Please try again tomorrow!`);
  }

  // 2. Fetch MasterProfile (or use preloaded profile to eliminate DB roundtrip)
  let masterProfile = preloadedMasterProfile || await prisma.masterProfile.findUnique({
    where: { userId },
  });

  if (!masterProfile) {
    const latestResume = await prisma.resume.findFirst({
      where: { userId, abandoned: false },
      orderBy: { createdAt: "desc" },
    });

    if (!latestResume) {
      throw new Error("NO_RESUME_FOUND");
    }

    try {
      const inputData = JSON.parse(latestResume.inputData || "{}");
      const personal = inputData.personal || {};
      masterProfile = {
        id: "temp",
        userId,
        fullName: personal.fullName || "",
        phone: personal.phone || "",
        location: personal.city || personal.location || "",
        github: personal.github || "",
        linkedin: personal.linkedin || "",
        portfolio: personal.portfolio || "",
        college: personal.collegeName || latestResume.college || "",
        branch: personal.branch || latestResume.branch || "",
        cgpa: personal.cgpa || latestResume.cgpa || "",
        summary: inputData.summary || "",
        skillsJson: JSON.stringify(Array.isArray(inputData.skills) ? inputData.skills : []),
        projectsJson: JSON.stringify(Array.isArray(inputData.projects) ? inputData.projects : []),
        experiencesJson: JSON.stringify(Array.isArray(inputData.internships) ? inputData.internships : (Array.isArray(inputData.experience) ? inputData.experience : [])),
        certificationsJson: JSON.stringify(Array.isArray(inputData.certifications) ? inputData.certifications : []),
        achievementsJson: JSON.stringify(Array.isArray(inputData.achievements) ? inputData.achievements : []),
        activeBacklogs: "0",
        backlogHistory: "0",
        academicGapYears: "0",
        atsCheckEnabled: true,
      } as any;
    } catch (e) {
      throw new Error("NO_RESUME_FOUND");
    }
  }

  // 3. Fetch JobPosting if specified or use preloaded text
  let jobPosting: any = null;
  let jobPostingText = customJdText || "";
  if (!jobPostingText && jobPostingId) {
    jobPosting = await prisma.jobPosting.findUnique({
      where: { id: jobPostingId },
    });

    if (jobPosting) {
      jobPostingText = `Company: ${jobPosting.companyName}
Role: ${jobPosting.roleTitle}
Package Details: ${jobPosting.packageDetails || "N/A"}
Eligibility / Criteria: ${jobPosting.eligibilityCriteria || "N/A"}

Full Description:
${jobPosting.rawEmailText}`;
    }
  }

  // 4. Format Profile Data (Anonymized for blind ATS audit & LLM privacy)
  const profileText = formatProfileDataForPrompt(masterProfile, { anonymize: true });

  // 5. LLM Call with 1 Retry mechanism + Graceful Fallback
  const prompt = buildAtsScoringPrompt(profileText, jobPostingText || undefined);
  let parsedOutput: AtsScoringOutput | null = null;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const responseText = await logger.timeAsync(
        `ats-scoring-attempt-${attempt}`,
        () => generateLlmText(prompt, { json: true }),
        { userId, jobPostingId, attempt }
      ).then(res => res.result);

      const cleanJson = responseText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const data = JSON.parse(cleanJson);

      if (typeof data.overall_score === "number") {
        parsedOutput = {
          overall_score: Math.min(100, Math.max(0, Math.round(data.overall_score))),
          keyword_gaps: Array.isArray(data.keyword_gaps) ? data.keyword_gaps.map(String) : [],
          structural_issues: Array.isArray(data.structural_issues) ? data.structural_issues.map(String) : [],
          content_issues: Array.isArray(data.content_issues) ? data.content_issues.map(String) : [],
          improvements: Array.isArray(data.improvements)
            ? data.improvements.map((item: any) => ({
                suggestion: String(item.suggestion || item.text || item || ""),
                relatedTo: String(item.relatedTo || item.section || "General"),
              }))
            : [],
          strengths: Array.isArray(data.strengths) ? data.strengths.map(String) : [],
        };
        break;
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
      logger.warn(`[ats-scoring] Attempt ${attempt} failed: ${lastError}`, { userId, attempt, error: lastError });
    }
  }

  // Graceful degradation: If LLM is down or returned invalid JSON twice, use intelligent heuristic scoring
  if (!parsedOutput) {
    logger.warn("[ats-scoring] LLM generation failed twice. Activating heuristic fallback scoring engine.", {
      userId,
      jobPostingId,
      lastError,
    });
    parsedOutput = generateHeuristicAtsFallback(masterProfile, jobPosting);
  }

  // 6. Save check to Database
  const createdCheck = await prisma.atsScoreCheck.create({
    data: {
      userId,
      masterProfileId: (masterProfile && masterProfile.id !== "temp") ? masterProfile.id : null,
      jobPostingId: jobPosting?.id || null,
      overallScore: parsedOutput.overall_score,
      keywordGaps: JSON.stringify(parsedOutput.keyword_gaps),
      structuralIssues: JSON.stringify(parsedOutput.structural_issues),
      contentIssues: JSON.stringify(parsedOutput.content_issues),
      improvements: JSON.stringify(parsedOutput.improvements),
      strengths: JSON.stringify(parsedOutput.strengths),
      triggeredBy,
    },
  });

  return {
    id: createdCheck.id,
    userId: createdCheck.userId,
    masterProfileId: createdCheck.masterProfileId,
    jobPostingId: createdCheck.jobPostingId,
    overallScore: createdCheck.overallScore,
    keywordGaps: parsedOutput.keyword_gaps,
    structuralIssues: parsedOutput.structural_issues,
    contentIssues: parsedOutput.content_issues,
    improvements: parsedOutput.improvements,
    strengths: parsedOutput.strengths,
    createdAt: createdCheck.createdAt,
  };
}
