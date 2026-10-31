// lib/llm-extractor.ts
// Extract structured Placement Drive / JD information from forwarded email text & HTML tables
import { redactPiiFromText } from "@/lib/pii";

export interface ExtractedJdData {
  companyName: string;
  roleTitle: string;
  eligibilityCriteria: {
    branches?: string[];
    cgpaCutoff?: string;
    backlogPolicy?: string;
    rawEligibilityText?: string;
  };
  packageDetails?: string | null; // e.g. CTC, Salary, or Stipend info
  applicationDeadline?: string | null; // ISO Date String
  driveDate?: string | null; // ISO Date String
  otherImportantDates?: Array<{ event: string; date: string }>;
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";

  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " : ")
    .replace(/<\/th>/gi, " : ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[\r\t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function cleanEmailText(rawEmail: string, rawHtml?: string): string {
  let combined = rawEmail || "";

  if (rawHtml) {
    const convertedHtml = htmlToPlainText(rawHtml);
    if (convertedHtml.length > combined.length) {
      combined = convertedHtml;
    }
  }

  if (!combined) return "";

  // Remove common Gmail forwarding headers
  let cleaned = combined
    .replace(/^---------- Forwarded message ---------[\s\S]*?To:.*?\n/g, "")
    .replace(/^From:.*?\nDate:.*?\nSubject:.*?\nTo:.*?\n/gm, "")
    .replace(/^>+/gm, "") // Strip quoted text angle brackets
    .trim();

  // Redact personal student contact details (phone, email) from forwarded text
  cleaned = redactPiiFromText(cleaned, { maskOnly: true });

  if (cleaned.length > 15000) {
    cleaned = cleaned.slice(0, 15000) + "\n...[text truncated]";
  }

  return cleaned;
}

function heuristicFallbackParse(text: string): ExtractedJdData {
  let company = "Placement Drive";
  let role = "Software Engineer / Intern";
  let deadlineStr: string | null = null;
  let eligibility = "All Branches";
  let stipendOrCtc: string | null = null;

  // Match Company Name (e.g. "Name of the Company : Nutanix", "Company: Nutanix", "Nutanix Placement Drive")
  const companyMatch = text.match(/(?:Company Name|Name of the Company|Company|Organization)\s*[:\-\s]+\s*([A-Za-z0-9\.\-\s]+)/i);
  if (companyMatch && companyMatch[1].trim()) {
    company = companyMatch[1].trim().split("\n")[0].slice(0, 50);
  }

  // Match Role / Category
  const roleMatch = text.match(/(?:Role|Designation|Job Title|Position|Category)\s*[:\-\s]+\s*([A-Za-z0-9\.\-\/\s]+)/i);
  if (roleMatch && roleMatch[1].trim()) {
    role = roleMatch[1].trim().split("\n")[0].slice(0, 60);
  }

  // Match Deadline (e.g. "Last date for Registration : 27th July 2026")
  const deadlineMatch = text.match(/(?:Last date for Registration|Application Deadline|Deadline|Last Date)\s*[:\-\s]+\s*([A-Za-z0-9\:\s\(\)\,\-]+)/i);
  if (deadlineMatch) {
    const rawD = deadlineMatch[1].trim().split("\n")[0];
    const cleanD = rawD.replace(/\(.*?\)/g, "").trim();
    
    // Custom check for DD/MM/YYYY format in fallback regex
    const ddmmyyyyMatch = cleanD.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmmyyyyMatch) {
      const d = parseInt(ddmmyyyyMatch[1], 10);
      const m = parseInt(ddmmyyyyMatch[2], 10) - 1; // 0-indexed
      const y = parseInt(ddmmyyyyMatch[3], 10);
      const dateObj = new Date(Date.UTC(y, m, d, 18, 30, 0)); // Default to 11:59 PM IST (18:30 UTC)
      deadlineStr = dateObj.toISOString();
    } else {
      const parsedD = new Date(cleanD);
      if (!isNaN(parsedD.getTime())) {
        deadlineStr = parsedD.toISOString();
      }
    }
  }

  // Match Eligibility
  const eligMatch = text.match(/(?:Eligibility|Eligible Branches|Criteria)\s*[:\-\s]+\s*([^\n]+)/i);
  if (eligMatch) {
    eligibility = eligMatch[1].trim();
  }

  // Match Stipend / CTC Fallback
  const stipendMatch = text.match(/(?:Stipend|CTC|Package|Salary)\s*[:\-\s]+\s*([^\n]+)/i);
  if (stipendMatch) {
    stipendOrCtc = stipendMatch[1].trim().slice(0, 80);
  }

  return {
    companyName: company,
    roleTitle: role,
    eligibilityCriteria: {
      rawEligibilityText: eligibility,
    },
    packageDetails: stipendOrCtc,
    applicationDeadline: deadlineStr,
    driveDate: null,
    otherImportantDates: [],
  };
}

export async function extractJdInfoWithLLM(
  rawEmailText: string,
  rawHtmlText?: string,
  attempt: number = 1
): Promise<ExtractedJdData> {
  const cleanedText = cleanEmailText(rawEmailText, rawHtmlText);

  if (!cleanedText || cleanedText.length < 5) {
    return heuristicFallbackParse(rawEmailText || "Placement Drive Email");
  }

  const prompt = `
You are an expert Job Description & Placement Drive Parser for Indian Engineering College Placement Cells.
Your goal is to extract extremely accurate, 100% correct placement details from the following email text (which contains placement announcements).

EMAIL TEXT:
"""
${cleanedText}
"""

CRITICAL INSTRUCTIONS (MUST BE 100% ACCURATE):
1. "companyName": Extract the exact name of the company hiring (e.g. Nutanix, Honeywell, Tekion, Amazon, TCS, Microsoft, etc.). Look in table fields like "Name of the Company", "Company Name", or email headers. If unspecified, use "Placement Drive".
2. "roleTitle": Extract the exact job designation or role offered (e.g. "Software Track Intern", "SDE Intern", "Embedded Specialist Intern", "Graduate Engineer Trainee").
   - WARNING: Do NOT use VIT placement categories (like "Super Dream Internship", "Dream Placement", "Super Dream", "Dream", etc.) as the role title. Look at the "Job Designation Offered", "Designation", or "Designation Offered" field in the email.
3. "eligibilityCriteria":
   - "branches": Array of eligible branch strings (e.g. ["CSE", "IT", "ECE", "EEE"]).
   - "cgpaCutoff": Cutoff/criteria (e.g. "7.5 CGPA", "No CGPA Cutoff").
   - "backlogPolicy": Backlog rules (e.g. "No standing backlogs", "Active backlogs allowed").
   - "rawEligibilityText": A clean, concise bulleted summary of ALL eligibility criteria. Do not miss any details like 10th/12th percentages or branch limitations.
4. "packageDetails": Extract the compensation package, CTC, salary, or monthly stipend (e.g., "9 LPA + 1.2 JB (10.2 LPA) if converted, Stipend: 36000 per month"). Look for terms like "Package", "CTC", "Salary", or "Stipend". Combine CTC and Stipend if both are mentioned.
5. "deadlineDateLocal": YYYY-MM-DD in Indian local time (e.g. "2026-07-28"). Remember, Indian date format is DD/MM/YYYY. For "28-07-2026", return "2026-07-28".
6. "deadlineTimeLocal": HH:mm (24-hour format) in Indian local time (e.g. "12:00" for 12noon, "17:00" for 5:00 PM, "23:59" if not specified).
7. "driveDateLocal": YYYY-MM-DD in Indian local time or null if no drive date is mentioned.
8. "driveTimeLocal": HH:mm in Indian local time or null if no drive time is mentioned.

REQUIRED JSON STRUCTURE (Return ONLY raw JSON, no markdown wrappers, no explanations):
{
  "companyName": "Company Name",
  "roleTitle": "Role Title",
  "eligibilityCriteria": {
    "branches": ["CS", "IT"],
    "cgpaCutoff": "7.5 CGPA",
    "backlogPolicy": "No Standing Arrears",
    "rawEligibilityText": "B.Tech CSE/IT with 7.5 CGPA, 70% in 10th & 12th, and no active backlogs."
  },
  "packageDetails": "CTC / Stipend Details",
  "deadlineDateLocal": "YYYY-MM-DD",
  "deadlineTimeLocal": "HH:mm",
  "driveDateLocal": "YYYY-MM-DD",
  "driveTimeLocal": "HH:mm",
  "otherImportantDates": []
}

Today's Date: ${new Date().toISOString()}
Return ONLY valid JSON.
`;

  let extractedObj: any = null;

  // 1. Try Groq LPU API first for ultra-fast (sub-second ~300ms) structured extraction
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const groqModels = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    for (const model of groqModels) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
          signal: AbortSignal.timeout(3500),
        });

        if (res.ok) {
          const data = await res.json();
          const rawJsonStr = data.choices?.[0]?.message?.content;
          if (rawJsonStr) {
            extractedObj = JSON.parse(rawJsonStr);
            if (extractedObj && extractedObj.companyName) break;
          }
        }
      } catch (err) {
        // Continue to next model or fallback
      }
    }
  }

  // 2. Fallback to Gemini API if Groq was unavailable or failed
  if (!extractedObj) {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(6000),
        });

        if (res.ok) {
          const data = await res.json();
          const rawJsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJsonStr) {
            extractedObj = JSON.parse(rawJsonStr);
          }
        }
      } catch (err) {
        console.warn("[LLM Extraction - Gemini Error]:", err);
      }
    }
  }

  if (extractedObj && extractedObj.companyName) {
    // Process local date-times into ISO strings
    let applicationDeadline = null;
    let driveDate = null;

    if (extractedObj.deadlineDateLocal) {
      const time = extractedObj.deadlineTimeLocal || "23:59";
      const localStr = `${extractedObj.deadlineDateLocal}T${time}:00+05:30`;
      const d = new Date(localStr);
      if (!isNaN(d.getTime())) {
        applicationDeadline = d.toISOString();
      }
    }

    if (extractedObj.driveDateLocal) {
      const time = extractedObj.driveTimeLocal || "09:00";
      const localStr = `${extractedObj.driveDateLocal}T${time}:00+05:30`;
      const d = new Date(localStr);
      if (!isNaN(d.getTime())) {
        driveDate = d.toISOString();
      }
    }

    return {
      companyName: extractedObj.companyName,
      roleTitle: extractedObj.roleTitle,
      eligibilityCriteria: extractedObj.eligibilityCriteria,
      packageDetails: extractedObj.packageDetails,
      applicationDeadline,
      driveDate,
      otherImportantDates: extractedObj.otherImportantDates || [],
    };
  }

  // Final Guaranteed Fallback Parser (Zero-Failure Guarantee)
  return heuristicFallbackParse(cleanedText);
}
