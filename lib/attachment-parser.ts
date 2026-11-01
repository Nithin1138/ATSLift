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

export function isCellMatch(cellText: string, regNumber: string, pattern?: RegExp): boolean {
  if (!cellText || !regNumber) return false;
  const cleanCell = String(cellText).trim();
  const cleanReg = String(regNumber).trim();
  if (cleanCell.length === 0 || cleanReg.length === 0) return false;

  // 1. Direct case-insensitive equality
  if (cleanCell.toLowerCase() === cleanReg.toLowerCase()) return true;

  // 2. Word boundary regex match
  const pat = pattern || getRegPattern(cleanReg);
  if (pat.test(cleanCell)) return true;

  // 3. Normalized alphanumeric match (stripping spaces, hyphens, slashes, underscores, dots)
  const normCell = cleanCell.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const normReg = cleanReg.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (normReg.length >= 3 && normCell === normReg) return true;

  // 4. Substring boundary match for normalized registration number (e.g. "Roll: 21BCE1001-CSE")
  if (normReg.length >= 4) {
    const normRegex = new RegExp(`(^|[^a-zA-Z0-9])${escapeRegex(normReg)}($|[^a-zA-Z0-9])`, "i");
    if (normRegex.test(cleanCell)) return true;
  }

  return false;
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

  // 1. First attempt parsing with SheetJS (handles multiline cells, quotes, commas, tabs, semicolons)
  try {
    const workbook = XLSX.read(csvText, { type: "string" });
    if (workbook && workbook.SheetNames && workbook.SheetNames.length > 0) {
      const match = parseXlsxBuffer(Buffer.from(csvText, "utf-8"), regNumber, "CSV attachment");
      if (match && match.found) return match;
    }
  } catch {
    // fallback to manual delimited line parser
  }

  // 2. Resilient delimited line parser fallback
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  let delimiter = ",";
  const commas = (firstLine.match(/,/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  const pipes = (firstLine.match(/\|/g) || []).length;

  if (tabs > commas && tabs > semicolons) delimiter = "\t";
  else if (semicolons > commas && semicolons > tabs) delimiter = ";";
  else if (pipes > commas && pipes > semicolons) delimiter = "|";

  const isFirstLineHeader =
    /roll|reg|name|student|branch|dept|status|slot|s\.?no/i.test(firstLine);

  const startIdx = isFirstLineHeader && lines.length > 1 ? 1 : 0;
  const headers = isFirstLineHeader
    ? splitDelimitedLine(firstLine, delimiter).map((h) => h.trim().toLowerCase().replace(/"/g, ""))
    : [];

  const pattern = getRegPattern(regNumber);

  for (let i = startIdx; i < lines.length; i++) {
    const cols = splitDelimitedLine(lines[i], delimiter).map((c) => c.trim().replace(/"/g, ""));
    const matchFound =
      cols.some((col) => isCellMatch(col, regNumber, pattern)) ||
      isCellMatch(lines[i], regNumber, pattern);

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

  // If first line wasn't checked as data and no match was found, check first line directly
  if (startIdx === 1) {
    const cols = splitDelimitedLine(lines[0], delimiter).map((c) => c.trim().replace(/"/g, ""));
    if (cols.some((col) => isCellMatch(col, regNumber, pattern))) {
      const cells: Record<string, string> = {};
      cols.forEach((val, idx) => (cells[`col_${idx}`] = val));
      return {
        found: true,
        source: "CSV attachment",
        row: { cells, rawLine: lines[0] },
        contextSummary: buildContextSummary(cells),
      };
    }
  }

  return null;
}

function splitDelimitedLine(line: string, delimiter = ","): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
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

      if (!rows || rows.length === 0) continue;

      // Smart Header Finder:
      // Scan top 10 rows to locate the header row (identifying "roll", "reg", "name", "student", "branch", "status", "s.no", etc.)
      let headerRowIdx = 0;
      let headers: string[] = [];

      for (let r = 0; r < Math.min(rows.length, 10); r++) {
        const rowStr = rows[r].map((c) => String(c ?? "").toLowerCase()).join(" ");
        if (
          rowStr.includes("roll") ||
          rowStr.includes("reg") ||
          rowStr.includes("name") ||
          rowStr.includes("student") ||
          rowStr.includes("branch") ||
          rowStr.includes("status") ||
          rowStr.includes("s.no") ||
          rowStr.includes("sl.no")
        ) {
          headerRowIdx = r;
          headers = rows[r].map((h) => String(h ?? "").trim().toLowerCase());
          break;
        }
      }

      // If no explicit header detected and multiple rows exist, default headers to row 0
      if (headers.length === 0 && rows.length > 1) {
        headers = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
      }

      // Iterate through rows
      for (let i = 0; i < rows.length; i++) {
        // Skip header row ONLY if it doesn't match the student's registration ID
        if (i === headerRowIdx && headers.length > 0 && rows.length > 1) {
          const isHeaderMatching = rows[i].some((col) => isCellMatch(String(col ?? ""), regNumber, pattern));
          if (!isHeaderMatching) continue;
        }

        const cols = rows[i].map((c) => String(c ?? "").trim());
        const matchFound =
          cols.some((col) => isCellMatch(col, regNumber, pattern)) ||
          isCellMatch(cols.join(" "), regNumber, pattern);

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
  regNumber: string,
  options?: { emailId?: string; resendApiKey?: string }
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
      const res = await fetch(att.download_url || att.url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        buffer = Buffer.from(ab);
      }
    } catch (e) {
      console.warn("[AttachmentParser] Failed to download attachment from url:", e);
    }
  }

  // Resend API attachment fetch fallback when att.id is present but buffer is empty
  if (!buffer && att.id && options?.emailId && options?.resendApiKey) {
    try {
      const res = await fetch(
        `https://api.resend.com/emails/receiving/${options.emailId}/attachments/${att.id}`,
        {
          headers: { Authorization: `Bearer ${options.resendApiKey}` },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (res.ok) {
        const json = await res.json();
        const dlUrl = json.download_url || json.url;
        if (dlUrl) {
          const fileRes = await fetch(dlUrl, { signal: AbortSignal.timeout(15000) });
          if (fileRes.ok) {
            const ab = await fileRes.arrayBuffer();
            buffer = Buffer.from(ab);
          }
        }
      }
    } catch (e) {
      console.warn(`[AttachmentParser] Failed downloading Resend attachment (${att.id}):`, e);
    }
  }

  if (!buffer || buffer.length === 0) return null;

  const mimeType = String(att.contentType || att.mimeType || att.type || "").toLowerCase();

  // 1. Excel (XLSX / XLS / XLSM / XLSB) by extension, MIME type, or PK zip / OLE2 signature
  const isZipPk = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle2 = buffer.length > 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf;
  if (
    filenameLower.endsWith(".xlsx") ||
    filenameLower.endsWith(".xls") ||
    filenameLower.endsWith(".xlsm") ||
    filenameLower.endsWith(".xlsb") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    isZipPk ||
    isOle2
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

  // 3. CSV / TSV by extension or text inspection
  if (
    filenameLower.endsWith(".csv") ||
    filenameLower.endsWith(".tsv") ||
    mimeType.includes("csv") ||
    mimeType.includes("tab-separated")
  ) {
    const text = buffer.toString("utf-8");
    const res = parseCsvText(text, regNumber);
    if (res && res.found) return { ...res, source: filename };
  }

  // 4. Universal SheetJS attempt on buffer (handles unlabelled spreadsheets)
  try {
    const res = parseXlsxBuffer(buffer, regNumber, filename);
    if (res && res.found) return res;
  } catch {
    // ignore
  }

  // 5. Universal plain text fallback search
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
    /https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/[^?\s"<)]*)?(?:\?([^\s"<)]*))?/g;

  const matches = [...emailText.matchAll(sheetUrlRegex)];
  if (!matches.length) return null;

  for (const match of matches) {
    const sheetId = match[1];
    const queryParams = match[2] || "";
    const gidMatch = queryParams.match(/gid=(\d+)/) || emailText.match(/#gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    // 1. First attempt full workbook export as XLSX (retrieves ALL sheets/tabs)
    try {
      const xlsxExportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
      const res = await fetch(xlsxExportUrl, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const ab = await res.arrayBuffer();
        const buffer = Buffer.from(ab);
        const result = parseXlsxBuffer(buffer, regNumber, `Google Sheet (${sheetId.slice(0, 8)}...)`);
        if (result && result.found) return result;
      }
    } catch (e) {
      console.warn("[AttachmentParser] Google Sheets XLSX export failed, falling back to CSV:", e);
    }

    // 2. Fallback to CSV export (with exact gid if present)
    try {
      const csvExportUrl = gid
        ? `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
        : `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

      const res = await fetch(csvExportUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const csvText = await res.text();
        const result = parseCsvText(csvText, regNumber);
        if (result && result.found) {
          return { ...result, source: `Google Sheet (${sheetId.slice(0, 8)}...)` };
        }
      }
    } catch (err) {
      console.warn("[AttachmentParser] Google Sheets CSV fetch error:", err);
    }
  }
  return null;
}

// ─── Google Drive File Links ──────────────────────────────────────────────────

export async function parseGoogleDriveLink(
  emailText: string,
  regNumber: string
): Promise<AttachmentMatchResult | null> {
  if (!emailText || !regNumber) return null;

  const driveRegex =
    /https:\/\/drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+))/g;

  const matches = [...emailText.matchAll(driveRegex)];
  if (!matches.length) return null;

  for (const match of matches) {
    const fileId = match[1] || match[2];
    if (!fileId) continue;

    try {
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const res = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (!res.ok) continue;

      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);
      const att = {
        filename: `GoogleDrive_${fileId.slice(0, 8)}`,
        content: buffer,
      };
      const matchRes = await processAttachmentItem(att, regNumber);
      if (matchRes && matchRes.found) {
        return { ...matchRes, source: `Google Drive File (${fileId.slice(0, 8)}...)` };
      }
    } catch (err) {
      console.warn("[AttachmentParser] Google Drive file fetch error:", err);
    }
  }
  return null;
}

// ─── HTML Table Shortlist Parser ──────────────────────────────────────────────

export function parseHtmlTableText(
  htmlText: string,
  regNumber: string
): AttachmentMatchResult | null {
  if (!htmlText || !regNumber || !htmlText.includes("<table")) return null;

  try {
    const pattern = getRegPattern(regNumber);
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(htmlText)) !== null) {
      const tableContent = tableMatch[1];
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      const rows: string[][] = [];

      while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
        const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
        let cellMatch;
        const cols: string[] = [];
        while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
          const cellText = cellMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
          cols.push(cellText);
        }
        if (cols.length > 0) rows.push(cols);
      }

      if (rows.length === 0) continue;

      let headers: string[] = [];
      const isFirstRowHeader = rows[0].some((c) =>
        /roll|reg|name|student|branch|status|slot/i.test(c)
      );
      if (isFirstRowHeader) {
        headers = rows[0].map((h) => h.toLowerCase().trim());
      }

      const startIdx = isFirstRowHeader && rows.length > 1 ? 1 : 0;
      for (let i = startIdx; i < rows.length; i++) {
        const cols = rows[i];
        const matchFound =
          cols.some((col) => isCellMatch(col, regNumber, pattern)) ||
          isCellMatch(cols.join(" "), regNumber, pattern);

        if (matchFound) {
          const cells: Record<string, string> = {};
          cols.forEach((val, idx) => {
            const key = headers[idx] || `col_${idx}`;
            cells[key] = val;
          });
          return {
            found: true,
            source: "Email Table",
            row: { cells, rawLine: cols.join(" | ") },
            contextSummary: buildContextSummary(cells),
          };
        }
      }
    }
  } catch (e) {
    console.warn("[AttachmentParser] HTML table parse error:", e);
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
