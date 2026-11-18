// @vitest-environment node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildForm300Pdf } from "./osha-form-300-pdf";
import { buildForm301Pdf } from "./osha-form-301-pdf";
import { toOshaCase } from "./osha-module";
import { fitMultilineFontSize, fitSingleLineFontSize, OSHA_PDF_MAX_FONT } from "./osha-pdf-fit";

const sample = toOshaCase({
  id: "1",
  caseNumber: "107",
  employeeName: "JOHNATHAN L AYCOCK",
  jobTitle: "Maintenance",
  injuryDate: "2026-06-14",
  eventLocation: "Right arm",
  description: "Right arm",
  recordabilityStatus: "RECORDABLE",
  division: "PRI",
  caseOutcome: "OTHER_RECORDABLE",
  illnessCategory: "1",
  daysAway: 0,
  restrictedDays: 0,
});

function template(name: string) {
  const bytes = readFileSync(resolve(__dirname, `../../public/forms/${name}`));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("OSHA PDF font fitting", () => {
  it("never exceeds 12pt and shrinks long text to the box", async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(fitSingleLineFontSize("PRI", font, 300, 30)).toBe(OSHA_PDF_MAX_FONT);
    const long = "Producers Rice Mill, Inc. – Parboil Division North Plant";
    const small = fitSingleLineFontSize(long, font, 150, 14);
    expect(small).toBeLessThan(OSHA_PDF_MAX_FONT);
    expect(font.widthOfTextAtSize(long, small)).toBeLessThanOrEqual(150);
    expect(fitMultilineFontSize("short", font, 200, 60)).toBe(OSHA_PDF_MAX_FONT);
  });

  it("fills Form 300 header with full name, city and state", async () => {
    const bytes = await buildForm300Pdf(
      template("osha-300.pdf"),
      {
        year: 2026,
        establishment: "Producers Rice Mill, Inc. – PRI",
        city: "Stuttgart",
        state: "AR",
      },
      [sample],
    );
    const out = await PDFDocument.load(bytes);
    expect(out.getPageCount()).toBe(1);
    if (process.env.OSHA_PDF_OUT) writeFileSync(`${process.env.OSHA_PDF_OUT}/form300.pdf`, bytes);
  });

  it("builds Form 301 with fitted text", async () => {
    const bytes = await buildForm301Pdf(template("osha-301.pdf"), sample);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    if (process.env.OSHA_PDF_OUT) writeFileSync(`${process.env.OSHA_PDF_OUT}/form301.pdf`, bytes);
  });
});
