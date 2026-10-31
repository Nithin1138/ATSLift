/**
 * lib/attachment-parser.ts
 * Parses XLSX, CSV, PDF, and Google Sheets links from email attachments and body.
 * Searches for a student's registration number and extracts the full row context.
 * Features an Intelligent Shortlist Event Classifier and Context-Adaptive Telegram Templates:
 *  - 💻 Online Assessment / Coding Test
 *  - 👥 Group Discussion (GD)
 *  - 🎯 Technical / HR Interview
 *  - 🏫 Pool Campus (Host College / External Venue)
 *  - 🏢 Office Walk-in / In-Person Visit
 *  - 🎊 Final Selection / Job Offer
 */
import * as XLSX from "xlsx";

// Dynamic loader for pdf-parse v2+ class or v1 function
function getPdfParserClass(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfMod = require("pdf-parse");
    return pdfMod.PDFParse || pdfMod;
  } catch (err) {
    console.warn("[AttachmentParser] Could not load pdf-parse:", err);
    return null;
  }
}

export interface ParsedRow {
  /** All cell values in the row, keyed by column header (lowercased) or index */
  cells: Record<string, string>;
  /** The raw row as a single joined string for fallback display */
  rawLine: string;
}

export interface AttachmentMatchResult {
  found: boolean;
  /** Name of the file / source where reg number was found */
  source: string;
  /** Parsed row data — columns keyed by header */
  row: ParsedRow | null;
  /** AI-readable summary of what was found, e.g. "Shortlisted for Round 2, Slot: 11:15 AM" */
  contextSummary: string;
}

export type ShortlistEventType =
  | "exam"
  | "gd"
  | "interview"
  | "pool_campus"
  | "walkin_office"
  | "final_selection"
  | "general_shortlist";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getRegPattern(regNumber: string): RegExp {
  const clean = regNumber.trim();
  return /^[a-zA-Z0-9_-]+$/.test(clean)
    ? new RegExp(`\\b${escapeRegex(clean)}\\b`, "i")
    : new RegExp(escapeRegex(clean), "i");
}

function escapeHtml(str: string): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export function parseCsvText(csvText: string, regNumber: string): AttachmentMatchResult | null {
  if (!csvText || !regNumber || regNumber.trim().length < 2) return null;
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  // First non-empty line is the header
  const headerLine = lines[0];
  const headers = splitCsvLine(headerLine).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const pattern = getRegPattern(regNumber);

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]).map((c) => c.trim().replace(/"/g, ""));
    const matchFound = cols.some((col) => pattern.test(col)) || pattern.test(lines[i]);

    if (matchFound) {
      const cells: Record<string, string> = {};
      cols.forEach((val, idx) => {
        const key = headers[idx] || `col_${idx}`;
        cells[key] = val;
      });
      return {
        found: true,
        source: "CSV attachment",
        row: { cells, rawLine: lines[i] },
        contextSummary: buildContextSummary(cells),
      };
    }
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────

export function parseXlsxBuffer(
  buffer: Buffer | Uint8Array,
  regNumber: string,
  fileName = "Excel attachment"
): AttachmentMatchResult | null {
  if (!buffer || !regNumber || regNumber.trim().length < 2) return null;
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const pattern = getRegPattern(regNumber);

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: string[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as string[][];

      if (rows.length < 2) continue;

      const headers = rows[0].map((h) => String(h).trim().toLowerCase());

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i].map((c) => String(c).trim());
        const matchFound = cols.some((col) => pattern.test(col));

        if (matchFound) {
          const cells: Record<string, string> = {};
          cols.forEach((val, idx) => {
            const key = headers[idx] || `col_${idx}`;
            cells[key] = val;
          });
          return {
            found: true,
            source: fileName,
            row: { cells, rawLine: cols.join(" | ") },
            contextSummary: buildContextSummary(cells),
          };
        }
      }
    }
  } catch (err) {
    console.warn("[AttachmentParser] XLSX parse error:", err);
  }
  return null;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function parsePdfBuffer(
  buffer: Buffer,
  regNumber: string,
  fileName = "PDF attachment"
): Promise<AttachmentMatchResult | null> {
  if (!buffer || !regNumber || regNumber.trim().length < 2) return null;
  try {
    let text = "";
    const PDFClass = getPdfParserClass();
    if (PDFClass) {
      try {
        if (typeof PDFClass === "function" && PDFClass.prototype?.getText) {
          const parser = new PDFClass({ data: new Uint8Array(buffer) });
          const res = await parser.getText();
          text = res?.text || "";
        } else if (typeof PDFClass === "function") {
          const res = await PDFClass(buffer);
          text = res?.text || "";
        }
      } catch (parserErr) {
        console.warn("[AttachmentParser] Class-based PDF parsing error:", parserErr);
      }
    }

    // Binary / Latin1 string fallback for fast matching when PDF has uncompressed text streams
    if (!text) {
      try {
        text = buffer.toString("latin1");
      } catch {
        // ignore
      }
    }

    const pattern = getRegPattern(regNumber);
    if (!pattern.test(text)) return null;

    // Find the line containing the reg number
    const lines = text.split(/\r?\n/).filter((l: string) => l.trim());
    const matchLine = lines.find((l: string) => pattern.test(l));
    if (!matchLine) {
      return {
        found: true,
        source: fileName,
        row: null,
        contextSummary: `Registration number ${regNumber} detected in ${fileName}`,
      };
    }

    // Try to build cells from the found line
    const parts = matchLine.split(/[\t|]+/).map((p: string) => p.trim()).filter(Boolean);
    const cells: Record<string, string> = {};
    parts.forEach((p: string, idx: number) => (cells[`col_${idx}`] = p));

    return {
      found: true,
      source: fileName,
      row: { cells, rawLine: matchLine },
      contextSummary: buildContextSummary(cells, matchLine),
    };
  } catch (err) {
    console.warn("[AttachmentParser] PDF parse error:", err);
  }
  return null;
}

// ─── Universal Attachment Processor ──────────────────────────────────────────

export async function processAttachmentItem(
  att: any,
  regNumber: string
): Promise<AttachmentMatchResult | null> {
  if (!att || !regNumber) return null;

  const filename: string = att.filename || att.name || "attachment";
  const filenameLower = filename.toLowerCase();

  let buffer: Buffer | null = null;

  if (Buffer.isBuffer(att)) {
    buffer = att;
  } else if (Buffer.isBuffer(att.content)) {
    buffer = att.content;
  } else if (typeof att.content === "string") {
    try {
      buffer = Buffer.from(att.content, "base64");
    } catch {
      buffer = Buffer.from(att.content, "utf-8");
    }
  } else if (Array.isArray(att.bytes)) {
    buffer = Buffer.from(att.bytes);
  } else if (Array.isArray(att.data)) {
    buffer = Buffer.from(att.data);
  } else if (Array.isArray(att.content)) {
    buffer = Buffer.from(att.content);
  } else if (att instanceof Blob || typeof att.arrayBuffer === "function") {
    const ab = await att.arrayBuffer();
    buffer = Buffer.from(ab);
  } else if (att.download_url || att.url) {
    try {
      const res = await fetch(att.download_url || att.url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        buffer = Buffer.from(ab);
      }
    } catch (e) {
      console.warn("[AttachmentParser] Failed to download attachment from url:", e);
    }
  }

  if (!buffer || buffer.length === 0) return null;

  const mimeType = String(att.contentType || att.mimeType || att.type || "").toLowerCase();

  // 1. Excel (XLSX / XLS) by extension, MIME type, or PK zip signature
  if (
    filenameLower.endsWith(".xlsx") ||
    filenameLower.endsWith(".xls") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    (buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b)
  ) {
    const res = parseXlsxBuffer(buffer, regNumber, filename);
    if (res && res.found) return res;
  }

  // 2. PDF by extension, MIME type, or %PDF- header
  if (
    filenameLower.endsWith(".pdf") ||
    mimeType.includes("pdf") ||
    (buffer.length > 4 && buffer.slice(0, 5).toString() === "%PDF-")
  ) {
    const res = await parsePdfBuffer(buffer, regNumber, filename);
    if (res && res.found) return res;
  }

  // 3. CSV by extension or text inspection
  if (filenameLower.endsWith(".csv") || mimeType.includes("csv")) {
    const text = buffer.toString("utf-8");
    const res = parseCsvText(text, regNumber);
    if (res) return { ...res, source: filename };
  }

  // 4. Universal plain text fallback search
  try {
    const text = buffer.toString("utf-8");
    const csvRes = parseCsvText(text, regNumber);
    if (csvRes && csvRes.found) return { ...csvRes, source: filename };

    const search = searchRegNumberInText(text, regNumber);
    if (search.found) {
      return {
        found: true,
        source: filename,
        row: null,
        contextSummary: search.contextLine,
      };
    }
  } catch {
    // Ignore encoding errors
  }

  return null;
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

export async function parseGoogleSheetsLink(
  emailText: string,
  regNumber: string
): Promise<AttachmentMatchResult | null> {
  if (!emailText || !regNumber) return null;

  // Match all Google Sheets links in email body
  const sheetUrlRegex =
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/[^?\s"<)]*)?(?:\?[^\s"<)]*)?/g;

  const matches = [...emailText.matchAll(sheetUrlRegex)];
  if (!matches.length) return null;

  for (const match of matches) {
    const sheetId = match[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    try {
      const res = await fetch(exportUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;

      const csvText = await res.text();
      const result = parseCsvText(csvText, regNumber);
      if (result) {
        return { ...result, source: `Google Sheet (${sheetId.slice(0, 8)}...)` };
      }
    } catch (err) {
      console.warn("[AttachmentParser] Google Sheets fetch error:", err);
    }
  }
  return null;
}

// ─── Smart Context Summary Builder ────────────────────────────────────────────

export function buildContextSummary(
  cells: Record<string, string>,
  fallbackLine?: string
): string {
  const parts: string[] = [];

  const statusKeys = ["status", "round", "stage", "result", "selection"];
  for (const k of statusKeys) {
    const val = findCellValue(cells, k);
    if (val) {
      parts.push(val);
      break;
    }
  }

  const slotKeys = ["slot", "time", "interview time", "time slot", "reporting time", "scheduled time", "test window"];
  for (const k of slotKeys) {
    const val = findCellValue(cells, k);
    if (val) {
      parts.push(`Slot: ${val}`);
      break;
    }
  }

  const dateKeys = ["date", "interview date", "test date", "drive date", "schedule date"];
  for (const k of dateKeys) {
    const val = findCellValue(cells, k);
    if (val) {
      parts.push(`Date: ${val}`);
      break;
    }
  }

  const venueKeys = ["venue", "location", "room", "lab", "hall", "reporting to", "place", "campus", "office"];
  for (const k of venueKeys) {
    const val = findCellValue(cells, k);
    if (val) {
      parts.push(`Venue: ${val}`);
      break;
    }
  }

  const meetKeys = ["meet link", "test link", "assessment link", "google meet", "zoom link", "online link", "link", "url", "meeting"];
  for (const k of meetKeys) {
    const val = findCellValue(cells, k);
    if (val && (val.startsWith("http") || val.includes("meet.google") || val.includes("zoom"))) {
      parts.push(`Link: ${val}`);
      break;
    }
  }

  const panelKeys = ["panel", "interviewer", "panellist", "panel id", "batch"];
  for (const k of panelKeys) {
    const val = findCellValue(cells, k);
    if (val) {
      parts.push(`Panel: ${val}`);
      break;
    }
  }

  if (parts.length > 0) return parts.join(" · ");
  if (fallbackLine) return fallbackLine.slice(0, 200);
  return Object.values(cells).filter(Boolean).slice(0, 4).join(" · ");
}

export function findCellValue(cells: Record<string, string>, keyword: string): string | null {
  for (const [key, val] of Object.entries(cells)) {
    const strVal = String(val ?? "").trim();
    if (key.toLowerCase().includes(keyword.toLowerCase()) && strVal) {
      return strVal;
    }
  }
  return null;
}

// ─── Plain-text body search (fallback) ───────────────────────────────────────

export function searchRegNumberInText(
  text: string,
  regNumber: string
): { found: boolean; contextLine: string } {
  if (!text || !regNumber || regNumber.trim().length < 2) return { found: false, contextLine: "" };

  const pattern = getRegPattern(regNumber);
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      const context = [
        lines[i - 1] || "",
        lines[i],
        lines[i + 1] || "",
      ]
        .filter(Boolean)
        .join(" | ")
        .trim();
      return { found: true, contextLine: context };
    }
  }
  return { found: false, contextLine: "" };
}

// ─── Intelligent Event Classifier ─────────────────────────────────────────────

export function detectShortlistEventType(params: {
  contextText?: string;
  source?: string;
  subject?: string;
  cells?: Record<string, string>;
}): ShortlistEventType {
  const parts: string[] = [];
  if (params.subject) parts.push(params.subject);
  if (params.source) parts.push(params.source);
  if (params.contextText) parts.push(params.contextText);
  if (params.cells) {
    parts.push(...Object.keys(params.cells));
    parts.push(...Object.values(params.cells));
  }
  const text = parts.join(" ").toLowerCase();

  // 1. Final Selection / Job Offer
  if (
    text.includes("final select") ||
    text.includes("selected candidates") ||
    text.includes("offer letter") ||
    text.includes("offer extended") ||
    text.includes("congratulations on selection") ||
    text.includes("job offer") ||
    text.includes("final result") ||
    text.includes("hired candidates") ||
    text.includes("selects list") ||
    text.includes("selected list")
  ) {
    return "final_selection";
  }

  // 2. Group Discussion (GD)
  if (
    text.includes("group discussion") ||
    /\bgd\b/.test(text) ||
    text.includes("gd round") ||
    text.includes("gd batch") ||
    text.includes("case study round") ||
    text.includes("jam round") ||
    text.includes("extempore")
  ) {
    return "gd";
  }

  // 3. Online Assessment / Exam / Coding Test
  if (
    text.includes("online assessment") ||
    text.includes("coding test") ||
    text.includes("coding round") ||
    text.includes("technical assessment") ||
    text.includes("hackerrank") ||
    text.includes("hackerearth") ||
    text.includes("mettl") ||
    text.includes("cocubes") ||
    text.includes("amcat") ||
    text.includes("proctored") ||
    text.includes("test link") ||
    text.includes("exam slot") ||
    text.includes("exam link") ||
    text.includes("test window") ||
    text.includes("written test") ||
    text.includes("aptitude test") ||
    /\boa\b/.test(text)
  ) {
    return "exam";
  }

  // 4. Pool Campus / External College Venue
  if (
    text.includes("pool campus") ||
    text.includes("pooled campus") ||
    text.includes("joint campus") ||
    text.includes("off-campus drive") ||
    text.includes("host college") ||
    text.includes("host institute") ||
    text.includes("bus facility") ||
    text.includes("bus leaves") ||
    text.includes("college bus") ||
    text.includes("at other campus") ||
    text.includes("reporting at campus")
  ) {
    return "pool_campus";
  }

  // 5. Office Walk-in / Company Premises Visit
  if (
    text.includes("walk-in") ||
    text.includes("walk in") ||
    text.includes("walkin") ||
    text.includes("office visit") ||
    text.includes("company premises") ||
    text.includes("company office") ||
    text.includes("onsite interview") ||
    text.includes("onsite round") ||
    text.includes("headquarters") ||
    text.includes("reception gate") ||
    text.includes("security gate") ||
    text.includes("office address")
  ) {
    return "walkin_office";
  }

  // 6. Interview (Technical / HR / Managerial)
  if (
    text.includes("interview") ||
    text.includes("technical round") ||
    text.includes("hr round") ||
    text.includes("managerial round") ||
    text.includes("f2f") ||
    text.includes("panel") ||
    text.includes("google meet") ||
    text.includes("zoom") ||
    text.includes("teams meet") ||
    text.includes("discussion round")
  ) {
    return "interview";
  }

  return "general_shortlist";
}

// ─── Context-Adaptive Telegram Template Formatter ────────────────────────────

export function formatShortlistTelegramMessage(params: {
  companyName: string;
  roleTitle: string;
  userRegNumber: string;
  shortlistMatch: AttachmentMatchResult;
  subject?: string;
  rawEmailText?: string;
}): { text: string; eventType: ShortlistEventType } {
  const cells = params.shortlistMatch?.row?.cells || {};
  const sourceLabel = escapeHtml(params.shortlistMatch?.source || "Shortlist Attachment");
  const regCode = escapeHtml(params.userRegNumber || "");
  const company = escapeHtml(params.companyName || "Placement Drive");
  const role = escapeHtml(params.roleTitle || "Candidate");

  const eventType = detectShortlistEventType({
    subject: params.subject,
    source: params.shortlistMatch?.source,
    contextText: (params.rawEmailText || "") + " " + (params.shortlistMatch?.contextSummary || ""),
    cells,
  });

  const status = findFirstCell(cells, ["status", "round", "stage", "result", "selection"]) || "Shortlisted";
  const slot = findFirstCell(cells, ["slot", "time", "interview time", "time slot", "reporting time", "scheduled time", "test window"]);
  const date = findFirstCell(cells, ["date", "interview date", "test date", "drive date"]);
  const venue = findFirstCell(cells, ["venue", "location", "room", "lab", "hall", "place", "center"]);
  const hostCampus = findFirstCell(cells, ["host college", "host institute", "college name", "campus", "host campus"]);
  const address = findFirstCell(cells, ["address", "office address", "office location", "office"]);
  const panel = findFirstCell(cells, ["panel", "interviewer", "panellist", "panel id"]);
  const batch = findFirstCell(cells, ["batch", "gd batch", "group"]);
  const platform = findFirstCell(cells, ["platform", "portal", "vendor", "test portal"]);
  const duration = findFirstCell(cells, ["duration", "test duration", "time limit"]);
  const link = findFirstCell(cells, ["link", "meet link", "test link", "assessment link", "google meet", "zoom", "url"]);
  const busDetails = findFirstCell(cells, ["bus", "transport", "bus timing", "bus route"]);
  const ctc = findFirstCell(cells, ["package", "ctc", "salary", "stipend"]);

  let msg = "";

  switch (eventType) {
    case "exam": {
      msg = `💻 <b>Online Assessment Shortlist — ${company}!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `📋 <b>Assessment:</b> ${escapeHtml(status)}\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (platform) msg += `🖥️ <b>Platform:</b> ${escapeHtml(platform)}\n`;
      if (slot) msg += `⏰ <b>Test Window / Slot:</b> <b>${escapeHtml(slot)}</b>\n`;
      if (date) msg += `📅 <b>Date:</b> ${escapeHtml(date)}\n`;
      if (duration) msg += `⏳ <b>Duration:</b> ${escapeHtml(duration)}\n`;

      if (link && link.startsWith("http")) {
        msg += `\n🔗 <a href="${escapeHtml(link)}"><b>Click Here to Launch Assessment Link</b></a>\n`;
      }

      msg += `\n💡 <b>Pro-Tip:</b> Use a PC/Laptop with stable internet and a working webcam. Keep blank paper and pen ready for scratch calculations.`;
      break;
    }

    case "gd": {
      msg = `👥 <b>Group Discussion (GD) Shortlist — ${company}!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `📋 <b>Round:</b> ${escapeHtml(status)}\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (batch) msg += `🔢 <b>Your Batch:</b> <b>${escapeHtml(batch)}</b>\n`;
      if (slot) msg += `⏰ <b>Reporting Time:</b> <b>${escapeHtml(slot)}</b>\n`;
      if (date) msg += `📅 <b>Date:</b> ${escapeHtml(date)}\n`;
      if (venue) msg += `📍 <b>Room / Venue:</b> ${escapeHtml(venue)}\n`;
      if (panel) msg += `👤 <b>Panel:</b> ${escapeHtml(panel)}\n`;

      msg += `\n💡 <b>Pro-Tip:</b> Reach 15 minutes before your batch time. Structure your points clearly, listen actively, and contribute constructively without interrupting.`;
      break;
    }

    case "pool_campus": {
      msg = `🏫 <b>Pool Campus Shortlist — ${company} (External Drive)!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `📋 <b>Drive Type:</b> Off-Campus / Pool Campus Hiring\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (hostCampus || venue) msg += `🏛️ <b>Host Campus:</b> <b>${escapeHtml(hostCampus || venue || "Check placement notice")}</b>\n`;
      if (slot) msg += `⏰ <b>Reporting Time:</b> <b>${escapeHtml(slot)}</b>\n`;
      if (date) msg += `📅 <b>Date:</b> ${escapeHtml(date)}\n`;
      if (busDetails) msg += `🚌 <b>Transport / Bus:</b> ${escapeHtml(busDetails)}\n`;

      msg += `\n📋 <b>Mandatory Checklist to Carry:</b>\n`;
      msg += `• College ID Card (Mandatory for security entry)\n`;
      msg += `• 3 Hard copies of your Resume\n`;
      msg += `• Government Photo ID (Aadhaar / Driving License)\n`;

      msg += `\n💡 <b>Pro-Tip:</b> Reach 30 minutes before reporting time. Formal business attire is strictly mandatory.`;
      break;
    }

    case "walkin_office": {
      msg = `🏢 <b>In-Person Office Walk-in — ${company}!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `📋 <b>Round:</b> ${escapeHtml(status)}\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (address || venue) msg += `📍 <b>Office Address:</b> <b>${escapeHtml(address || venue || "Company Office Premises")}</b>\n`;
      if (slot) msg += `⏰ <b>Reporting Time:</b> <b>${escapeHtml(slot)}</b>\n`;
      if (date) msg += `📅 <b>Date:</b> ${escapeHtml(date)}\n`;
      msg += `🪪 <b>Security Entry:</b> Present this notice & Govt Photo ID at the reception gate\n`;

      if (address) {
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(company + " " + address)}`;
        msg += `\n🗺️ <a href="${mapsUrl}"><b>Open Office Location in Google Maps</b></a>\n`;
      }

      msg += `\n💡 <b>Pro-Tip:</b> Arrive 15 minutes early for visitor badge issuance. Keep digital copies of all academic records on your phone.`;
      break;
    }

    case "final_selection": {
      msg = `🎊 <b>CONGRATULATIONS! You Are Selected at ${company}!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `🏆 <b>Result:</b> <b>OFFER EXTENDED!</b>\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (ctc) msg += `💰 <b>Package (CTC):</b> <b>${escapeHtml(ctc)}</b>\n`;
      if (date) msg += `📅 <b>Date of Result:</b> ${escapeHtml(date)}\n`;

      msg += `\n🚀 <i>Huge congratulations on landing this offer! Your hard work and dedication paid off brilliantly.</i>`;
      break;
    }

    case "interview": {
      msg = `🎯 <b>Interview Shortlist — ${company}!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `📋 <b>Round:</b> ${escapeHtml(status)}\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (slot) msg += `⏰ <b>Your Slot:</b> <b>${escapeHtml(slot)}</b>\n`;
      if (date) msg += `📅 <b>Date:</b> ${escapeHtml(date)}\n`;
      if (venue) msg += `📍 <b>Venue / Mode:</b> ${escapeHtml(venue)}\n`;
      if (panel) msg += `👤 <b>Panel:</b> ${escapeHtml(panel)}\n`;

      if (link && (link.startsWith("http") || link.includes("meet.google") || link.includes("zoom"))) {
        msg += `\n🔗 <a href="${escapeHtml(link)}"><b>Join Online Interview Link</b></a>\n`;
      }

      msg += `\n💡 <b>Pro-Tip:</b> Join 5 minutes early. Have your ATS-optimized resume, GitHub portfolio, and key project talking points ready.`;
      break;
    }

    default: {
      msg = `🎉 <b>Shortlist Alert — ${company}!</b>\n\n`;
      msg += `🆔 Reg No <code>${regCode}</code> found in: <i>${sourceLabel}</i>\n\n`;
      msg += `📋 <b>Status:</b> ${escapeHtml(status)}\n`;
      msg += `💼 <b>Role:</b> ${role}\n`;
      if (slot) msg += `⏰ <b>Your Slot:</b> <b>${escapeHtml(slot)}</b>\n`;
      if (date) msg += `📅 <b>Date:</b> ${escapeHtml(date)}\n`;
      if (venue) msg += `📍 <b>Venue / Mode:</b> ${escapeHtml(venue)}\n`;
      if (panel) msg += `👤 <b>Panel / Batch:</b> ${escapeHtml(panel)}\n`;

      if (!slot && !date && !venue) {
        msg += `📝 <b>Details:</b> <i>${escapeHtml(params.shortlistMatch.contextSummary || "Shortlisted for next process")}</i>\n`;
      }

      if (link && link.startsWith("http")) {
        msg += `\n🔗 <a href="${escapeHtml(link)}"><b>Join / View Link</b></a>\n`;
      }

      msg += `\n✅ <i>Best of luck! Prepare well and check your email for any additional guidelines.</i>`;
      break;
    }
  }

  return { text: msg, eventType };
}

function findFirstCell(cells: Record<string, string>, keywords: string[]): string | null {
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
