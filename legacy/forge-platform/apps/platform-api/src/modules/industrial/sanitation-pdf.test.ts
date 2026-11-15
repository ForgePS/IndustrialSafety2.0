import { describe, expect, it } from "vitest";
import {
  buildSanitationInspectionPdf,
  decodeImageDataUrl,
  formatPdfDateTime,
  formatResult,
  isValidTimeZone,
  pdfSafeText,
  sanitationPdfFilename,
  sanitationPdfRows,
} from "./sanitation-pdf.js";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("sanitationPdfRows", () => {
  it("orders rows by template questions and appends unknown answers", () => {
    const rows = sanitationPdfRows(
      {
        extra: { result: "PASS", label: "Extra item" },
        q2: { result: "NO", notes: "Spill by conveyor", photos: [{ dataUrl: PNG_1PX }] },
        q1: { result: "PASS" },
      },
      [
        { id: "q1", label: "Floors clean", section: "Mill" },
        { id: "q2", label: "No spills", section: "Mill" },
        { id: "q3", label: "Bins sealed", section: "Storage" },
      ],
    );
    expect(rows.map((r) => [r.label, r.result])).toEqual([
      ["Floors clean", "Pass"],
      ["No spills", "No"],
      ["Bins sealed", "Not answered"],
      ["Extra item", "Pass"],
    ]);
    expect(rows[1]!.notes).toBe("Spill by conveyor");
    expect(rows[1]!.photos).toHaveLength(1);
  });

  it("counts photos it cannot embed instead of dropping them silently", () => {
    const rows = sanitationPdfRows({
      q1: { result: "FAIL", photos: [{ dataUrl: "data:image/webp;base64,AAAA" }] },
    });
    expect(rows[0]!.photos).toHaveLength(0);
    expect(rows[0]!.unsupportedPhotos).toBe(1);
  });
});

describe("pdf helpers", () => {
  it("decodes only png and jpeg data urls", () => {
    expect(decodeImageDataUrl(PNG_1PX)?.length).toBeGreaterThan(0);
    expect(decodeImageDataUrl("data:image/webp;base64,AAAA")).toBeNull();
    expect(decodeImageDataUrl("typed:Clay Kannada")).toBeNull();
  });

  it("labels results and formats dates in the given time zone", () => {
    expect(formatResult("na")).toBe("N/A");
    expect(formatResult("")).toBe("Not answered");
    expect(formatPdfDateTime("2026-10-14T17:42:00.000Z", "America/Chicago")).toContain("12:42");
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });

  it("strips characters the standard PDF fonts cannot draw", () => {
    expect(pdfSafeText("Mill \u{1F600} check")).toBe("Mill  check");
  });

  it("builds a safe filename from the inspection number", () => {
    expect(sanitationPdfFilename({ inspectionNumber: "SAN-2026-000017" })).toBe(
      "SAN-2026-000017.pdf",
    );
    expect(sanitationPdfFilename({ title: "10/14 Parboil Mill" })).toBe("10-14-Parboil-Mill.pdf");
  });
});

describe("buildSanitationInspectionPdf", () => {
  it("renders a multi-page PDF with photos and a drawn signature", async () => {
    const responses: Record<string, unknown> = {};
    const questions = Array.from({ length: 60 }, (_, i) => {
      responses[`q${i}`] = {
        result: i % 7 === 0 ? "NO" : "PASS",
        ...(i % 7 === 0 ? { notes: "Needs cleaning", photos: [{ dataUrl: PNG_1PX }] } : {}),
      };
      return { id: `q${i}`, label: `Checklist item ${i}`, section: i < 30 ? "Mill" : "Storage" };
    });
    const pdf = await buildSanitationInspectionPdf({
      inspection: {
        title: "Parboil Mill inspection",
        inspectionNumber: "SAN-2026-000017",
        status: "COMPLETED",
        complianceStatus: "FAIL",
        scorePercent: 82,
        completedAt: "2026-10-14T17:42:00.000Z",
        responsesJson: responses,
        signaturesJson: [{ type: "INSPECTOR", name: "Clay Kannada", value: PNG_1PX }],
      },
      findings: [{ findingNumber: "FND-1", severity: "MINOR", title: "Spill", status: "OPEN" }],
      questions,
      companyName: "Producers Rice Mill",
      siteName: "Stuttgart",
      timeZone: "America/Chicago",
    });
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const pages = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
  });
});
