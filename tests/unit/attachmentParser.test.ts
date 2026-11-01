import { describe, it } from "node:test";
import assert from "node:assert";
import * as XLSX from "xlsx";
import {
  parseCsvText,
  parseXlsxBuffer,
  searchRegNumberInText,
  buildContextSummary,
  processAttachmentItem,
  formatShortlistTelegramMessage,
} from "../../lib/attachment-parser";

describe("Attachment Parser & Shortlist Registration Detector", () => {
  describe("CSV Shortlist Parsing", () => {
    it("successfully identifies candidate registration number and parses structured columns", () => {
      const csvData = `Reg No,Candidate Name,Branch,Round,Interview Slot,Venue,Meet Link
21BCE1001,Aarav Sharma,CSE,Round 2,10:00 AM,Lab 2,https://meet.google.com/abc-defg
7Y6T8,Nithin Kumar,CSE,Technical Interview,11:15 AM,Lab 4,https://meet.google.com/tek-inte
21BCE1003,Priya Patel,ECE,Round 1,12:00 PM,Lab 1,https://meet.google.com/xyz-uvw`;

      const result = parseCsvText(csvData, "7Y6T8");

      assert.ok(result !== null);
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.source, "CSV attachment");
      assert.ok(result.row !== null);
      assert.strictEqual(result.row.cells["reg no"], "7Y6T8");
      assert.strictEqual(result.row.cells["candidate name"], "Nithin Kumar");
      assert.strictEqual(result.row.cells["interview slot"], "11:15 AM");
      assert.strictEqual(result.row.cells["meet link"], "https://meet.google.com/tek-inte");

      // Verify human-readable summary
      assert.ok(result.contextSummary.includes("Technical Interview"));
      assert.ok(result.contextSummary.includes("Slot: 11:15 AM"));
      assert.ok(result.contextSummary.includes("Venue: Lab 4"));
    });

    it("handles quoted CSV fields with commas properly", () => {
      const csvData = `"Registration ID","Full Name","Status","Reporting Time"
"21BCS001","Sharma, Rahul","Shortlisted","09:30 AM"
"7Y6T8","Kumar, Nithin","Selected for Round 2","10:45 AM"`;

      const result = parseCsvText(csvData, "7Y6T8");
      assert.ok(result !== null);
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.row?.cells["registration id"], "7Y6T8");
      assert.strictEqual(result.row?.cells["full name"], "Kumar, Nithin");
      assert.strictEqual(result.row?.cells["status"], "Selected for Round 2");
    });

    it("returns null when registration number is absent in CSV", () => {
      const csvData = `RegNo,Name,Status
21BCE001,John Doe,Shortlisted
21BCE002,Jane Doe,Waitlisted`;

      const result = parseCsvText(csvData, "7Y6T8");
      assert.strictEqual(result, null);
    });
  });

  describe("Excel (XLSX) Shortlist Parsing", () => {
    it("parses binary Excel spreadsheet and retrieves row for matched student ID", () => {
      // Generate in-memory Excel buffer using XLSX library
      const sheetData = [
        ["Roll No", "Student Name", "Status", "Slot", "Panel", "Link"],
        ["20BCE010", "Aditi Rao", "Shortlisted", "10:00 AM", "Panel A", "https://meet.google.com/p1"],
        ["7Y6T8", "Nithin V", "Round 2 Shortlist", "02:30 PM", "Panel C", "https://meet.google.com/p3"],
        ["20BCE099", "Vikram S", "Pending", "03:00 PM", "Panel B", "https://meet.google.com/p2"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shortlisted_Candidates");
      const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const result = parseXlsxBuffer(excelBuffer, "7Y6T8", "Tekion_Shortlist.xlsx");

      assert.ok(result !== null);
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.source, "Tekion_Shortlist.xlsx");
      assert.strictEqual(result.row?.cells["roll no"], "7Y6T8");
      assert.strictEqual(result.row?.cells["student name"], "Nithin V");
      assert.strictEqual(result.row?.cells["slot"], "02:30 PM");
      assert.strictEqual(result.row?.cells["panel"], "Panel C");
      assert.ok(result.contextSummary.includes("Round 2 Shortlist"));
      assert.ok(result.contextSummary.includes("Slot: 02:30 PM"));
    });

    it("returns null when ID is not present in Excel workbook", () => {
      const sheetData = [
        ["Roll No", "Student Name"],
        ["11111", "Student A"],
      ];
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      const result = parseXlsxBuffer(buffer, "7Y6T8");
      assert.strictEqual(result, null);
    });
  });

  describe("Plain Text & Email Body Matcher", () => {
    it("extracts context line when registration ID is mentioned in email body", () => {
      const bodyText = `Dear Students,

Please find the shortlist for Nutanix Round 2 interviews scheduled for tomorrow:
- 21BCE045: 10:00 AM
- 7Y6T8: 11:30 AM (Meeting Room 3)
- 21BCE099: 01:00 PM

Please be punctual.`;

      const match = searchRegNumberInText(bodyText, "7Y6T8");
      assert.strictEqual(match.found, true);
      assert.ok(match.contextLine.includes("7Y6T8: 11:30 AM (Meeting Room 3)"));
    });

    it("does not trigger false positives on partial substring matches", () => {
      const bodyText = `Reference code: ABC7Y6T8XYZ was generated for order 98765.`;

      const match = searchRegNumberInText(bodyText, "7Y6T8");
      // Word boundary regex should avoid matching inside ABC7Y6T8XYZ
      assert.strictEqual(match.found, false);
    });
  });

  describe("Universal Attachment Item Processor", () => {
    it("processes base64-encoded attachment payloads transparently", async () => {
      const csvContent = `RegID,Name,Status\n7Y6T8,Candidate Name,Shortlisted`;
      const base64Content = Buffer.from(csvContent, "utf-8").toString("base64");

      const attPayload = {
        filename: "candidates_round1.csv",
        content: base64Content,
      };

      const result = await processAttachmentItem(attPayload, "7Y6T8");
      assert.ok(result !== null);
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.source, "candidates_round1.csv");
      assert.strictEqual(result.row?.cells["regid"], "7Y6T8");
    });
  });

  describe("Intelligent Shortlist Event Classifier & Adaptive Formatter", () => {
    it("classifies Online Assessment / Coding Exam properly and includes test launch link", () => {
      const match = {
        found: true,
        source: "Tekion_OA_Shortlist.xlsx",
        row: {
          cells: {
            "roll no": "7Y6T8",
            round: "Round 2 Coding Assessment",
            platform: "HackerEarth",
            slot: "06:00 PM – 07:30 PM",
            date: "03 Nov 2026",
            duration: "90 Mins",
            link: "https://assessment.hackerearth.com/test-xyz",
          },
          rawLine: "7Y6T8 | Tekion | Round 2 Coding Assessment",
        },
        contextSummary: "Round 2 Coding Assessment · Slot: 06:00 PM",
      };

      const result = formatShortlistTelegramMessage({
        companyName: "Tekion",
        roleTitle: "Software Engineer Intern",
        userRegNumber: "7Y6T8",
        shortlistMatch: match,
        subject: "Tekion Round 2 Online Assessment Link & Shortlisted Students",
      });

      assert.strictEqual(result.eventType, "exam");
      assert.ok(result.text.includes("💻 <b>Online Assessment Shortlist — Tekion!</b>"));
      assert.ok(result.text.includes("HackerEarth"));
      assert.ok(result.text.includes("https://assessment.hackerearth.com/test-xyz"));
      assert.ok(result.text.includes("Keep blank paper and pen ready"));
    });

    it("classifies Group Discussion (GD) round and outputs batch and GD pro-tips", () => {
      const match = {
        found: true,
        source: "Deloitte_GD_Batches.csv",
        row: {
          cells: {
            "reg no": "7Y6T8",
            round: "Group Discussion & Case Study",
            batch: "Batch #4",
            slot: "10:30 AM IST",
            venue: "Conference Room 204",
            panel: "Panel B",
          },
          rawLine: "7Y6T8 | Batch 4 | 10:30 AM",
        },
        contextSummary: "Group Discussion · Batch 4",
      };

      const result = formatShortlistTelegramMessage({
        companyName: "Deloitte",
        roleTitle: "Technology Consultant",
        userRegNumber: "7Y6T8",
        shortlistMatch: match,
        subject: "Deloitte Group Discussion (GD) Schedule",
      });

      assert.strictEqual(result.eventType, "gd");
      assert.ok(result.text.includes("👥 <b>Group Discussion (GD) Shortlist — Deloitte!</b>"));
      assert.ok(result.text.includes("Batch #4"));
      assert.ok(result.text.includes("Conference Room 204"));
      assert.ok(result.text.includes("contribute constructively without interrupting"));
    });

    it("classifies Pool Campus external drive and includes mandatory checklist to carry", () => {
      const match = {
        found: true,
        source: "Amazon_Pool_Candidates.xlsx",
        row: {
          cells: {
            "reg no": "7Y6T8",
            "host college": "RV College of Engineering, Mysore Road, Bengaluru",
            slot: "08:30 AM",
            date: "04 Nov 2026",
            bus: "College Bus leaves campus gate at 07:15 AM",
          },
          rawLine: "7Y6T8 | RV College of Engineering",
        },
        contextSummary: "Pool Campus Drive at RV College",
      };

      const result = formatShortlistTelegramMessage({
        companyName: "Amazon",
        roleTitle: "SDE Intern",
        userRegNumber: "7Y6T8",
        shortlistMatch: match,
        subject: "Amazon Pool Campus Drive at RV College of Engineering",
      });

      assert.strictEqual(result.eventType, "pool_campus");
      assert.ok(result.text.includes("🏫 <b>Pool Campus Shortlist — Amazon (External Drive)!</b>"));
      assert.ok(result.text.includes("RV College of Engineering"));
      assert.ok(result.text.includes("Mandatory Checklist to Carry:"));
      assert.ok(result.text.includes("3 Hard copies of your Resume"));
      assert.ok(result.text.includes("Formal business attire is strictly mandatory"));
    });

    it("classifies Office Walk-in visit and includes Google Maps location link", () => {
      const match = {
        found: true,
        source: "Microsoft_Onsite_Candidates.xlsx",
        row: {
          cells: {
            "reg no": "7Y6T8",
            status: "Onsite Loop Interviews",
            address: "Microsoft Campus, Outer Ring Road, Bellandur, Bengaluru",
            slot: "09:30 AM",
            date: "05 Nov 2026",
          },
          rawLine: "7Y6T8 | Microsoft Campus Bellandur",
        },
        contextSummary: "Onsite Interviews at Microsoft Campus",
      };

      const result = formatShortlistTelegramMessage({
        companyName: "Microsoft",
        roleTitle: "Software Engineer",
        userRegNumber: "7Y6T8",
        shortlistMatch: match,
        subject: "Microsoft In-person Office Walk-in Interviews",
      });

      assert.strictEqual(result.eventType, "walkin_office");
      assert.ok(result.text.includes("🏢 <b>In-Person Office Walk-in — Microsoft!</b>"));
      assert.ok(result.text.includes("Microsoft Campus, Outer Ring Road"));
      assert.ok(result.text.includes("google.com/maps") || result.text.includes("maps.google.com"));
      assert.ok(result.text.includes("Security Entry:"));
    });

    it("classifies Final Selection announcement with celebration and CTC package", () => {
      const match = {
        found: true,
        source: "Tekion_Final_Selects.xlsx",
        row: {
          cells: {
            "reg no": "7Y6T8",
            result: "Selected for Full-Time Employment",
            package: "16 LPA",
            date: "06 Nov 2026",
          },
          rawLine: "7Y6T8 | Selected | 16 LPA",
        },
        contextSummary: "Final Selects List",
      };

      const result = formatShortlistTelegramMessage({
        companyName: "Tekion",
        roleTitle: "Associate Software Engineer",
        userRegNumber: "7Y6T8",
        shortlistMatch: match,
        subject: "Congratulations! Final Selects List for Tekion 2026 Batch",
      });

      assert.strictEqual(result.eventType, "final_selection");
      assert.ok(result.text.includes("🎊 <b>CONGRATULATIONS! You Are Selected at Tekion!</b>"));
      assert.ok(result.text.includes("OFFER EXTENDED!"));
      assert.ok(result.text.includes("16 LPA"));
    });

    it("handles numeric cell values without throwing TypeError (val.trim is not a function)", () => {
      const numericCells: any = {
        "sl no": 1,
        "reg no": "7Y6T8",
        "room no": 402,
        batch: 3,
        slot: "10:30 AM",
      };

      const match = {
        found: true,
        source: "Shortlist_Rooms.xlsx",
        row: {
          cells: numericCells,
          rawLine: "1 | 7Y6T8 | 402 | 3",
        },
        contextSummary: "Interview schedule with room numbers",
      };

      const result = formatShortlistTelegramMessage({
        companyName: "Amazon",
        roleTitle: "SDE-1",
        userRegNumber: "7Y6T8",
        shortlistMatch: match,
        subject: "Amazon Interview Shortlist and Room Allotment",
      });

      assert.ok(result);
      assert.strictEqual(result.eventType, "interview");
      assert.ok(result.text.includes("Amazon"));
      assert.ok(result.text.includes("10:30 AM"));
    });
  });

  describe("PDF Attachment Parser", () => {
    it("safely handles PDF buffers without throwing unhandled exceptions", async () => {
      const { parsePdfBuffer } = await import("../../lib/attachment-parser");
      const samplePdfText = `%PDF-1.4\n1 0 obj\n<< /Length 120 >>\nstream\nShortlisted candidates for Round 2:\n21BCE1001\n7Y6T8\n21BCE1009\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF`;
      const buffer = Buffer.from(samplePdfText, "latin1");

      const result = await parsePdfBuffer(buffer, "7Y6T8", "Shortlist.pdf");
      assert.ok(result !== null);
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.source, "Shortlist.pdf");
    });
  });

  describe("Spreadsheet & Multi-Format Shortlist Edge Cases", () => {
    it("parses Excel with title banners and matches hyphenated or spaced roll numbers", () => {
      const sheetData = [
        ["COLLEGE OF ENGINEERING & TECHNOLOGY - PLACEMENT CELL"],
        ["BATCH 2026 - TEKION ROUND 2 SHORTLIST"],
        ["S.No", "Registration ID", "Student Name", "Branch", "Status", "Slot"],
        ["1", "21-BCE-1001", "Aarav Sharma", "CSE", "Selected", "10:00 AM"],
        ["2", "7-Y-6-T-8", "Nithin Kumar", "CSE", "Selected for Round 2", "11:30 AM"],
        ["3", "21-BCE-1003", "Priya Patel", "ECE", "Waitlist", "12:00 PM"],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shortlist");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      // Search with unhyphenated registration number "7Y6T8"
      const result = parseXlsxBuffer(buffer, "7Y6T8", "Tekion_Round2.xlsx");
      assert.ok(result !== null);
      assert.strictEqual(result.found, true);
      assert.strictEqual(result.row?.cells["registration id"], "7-Y-6-T-8");
      assert.strictEqual(result.row?.cells["student name"], "Nithin Kumar");
      assert.strictEqual(result.row?.cells["slot"], "11:30 AM");
    });

    it("parses semicolon-delimited and tab-delimited CSV shortlists", () => {
      const tsvData = `SNo\tRollNumber\tCandidate\tStage\tTimeSlot\n1\t21BCE001\tStudent A\tRound 1\t10 AM\n2\t7Y6T8\tNithin\tRound 2\t02:00 PM`;
      const tsvResult = parseCsvText(tsvData, "7Y6T8");
      assert.ok(tsvResult !== null);
      assert.strictEqual(tsvResult.found, true);
      assert.strictEqual(tsvResult.row?.cells["rollnumber"], "7Y6T8");
      assert.strictEqual(tsvResult.row?.cells["timeslot"], "02:00 PM");

      const semiColonData = `SNo;RollNumber;Candidate;Stage\n1;21BCE001;Student A;Round 1\n2;7Y6T8;Nithin;Round 2`;
      const semiResult = parseCsvText(semiColonData, "7Y6T8");
      assert.ok(semiResult !== null);
      assert.strictEqual(semiResult.found, true);
      assert.strictEqual(semiResult.row?.cells["rollnumber"], "7Y6T8");
    });

    it("parses HTML tables embedded directly in email body", async () => {
      const { parseHtmlTableText } = await import("../../lib/attachment-parser");
      const htmlBody = `
        <html>
          <body>
            <p>Dear Candidates, find the shortlisted students below:</p>
            <table border="1">
              <thead>
                <tr><th>S.No</th><th>Roll No</th><th>Student Name</th><th>Interview Slot</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>21BCE1001</td><td>Alice</td><td>10:00 AM</td></tr>
                <tr><td>2</td><td>7Y6T8</td><td>Nithin</td><td>11:45 AM</td></tr>
              </tbody>
            </table>
          </body>
        </html>
      `;

      const match = parseHtmlTableText(htmlBody, "7Y6T8");
      assert.ok(match !== null);
      assert.strictEqual(match.found, true);
      assert.strictEqual(match.source, "Email Table");
      assert.strictEqual(match.row?.cells["roll no"], "7Y6T8");
      assert.strictEqual(match.row?.cells["student name"], "Nithin");
      assert.strictEqual(match.row?.cells["interview slot"], "11:45 AM");
    });
  });
});

