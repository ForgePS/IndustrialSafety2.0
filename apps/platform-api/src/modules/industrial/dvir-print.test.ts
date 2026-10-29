import { describe, expect, it } from "vitest";
import { buildDvirDayPrintableHtml, buildDvirPrintableHtml } from "./dvir-print.js";

describe("dvir-print", () => {
  it("builds single DVIR HTML with checklist rows", () => {
    const html = buildDvirPrintableHtml({
      title: "Pre-trip DVIR 12",
      tripType: "PRE_TRIP",
      inspectionDate: "2026-08-21",
      truckNumber: "12",
      trailerNumbers: "T-9",
      workerName: "Jamie",
      items: [
        {
          id: "brakes",
          label: "Brakes",
          section: "truck",
          answer: "NO",
          notes: "Soft pedal",
        },
      ],
      remarks: "Check again tomorrow",
      driverSignedAt: "2026-08-21T08:00:00Z",
    });
    expect(html).toContain("Pre-trip DVIR 12");
    expect(html).toContain("Brakes");
    expect(html).toContain("Soft pedal");
    expect(html).toContain("Check again tomorrow");
  });

  it("expands legacy defect-only payloads for print", () => {
    const html = buildDvirPrintableHtml({
      tripType: "POST_TRIP",
      inspectionDate: "2026-08-20",
      truckNumber: "88",
      workerName: "Alex",
      truckDefects: ["brakes"],
      trailerDefects: [],
      remarks: "Pedal soft",
    });
    expect(html).toContain("brakes");
    expect(html).toContain("Pedal soft");
  });

  it("builds day bundle HTML for pre and post trip", () => {
    const html = buildDvirDayPrintableHtml(
      "2026-08-21",
      "Unit 12",
      [
        {
          tripType: "PRE_TRIP",
          inspectionDate: "2026-08-21",
          truckNumber: "12",
          workerName: "Jamie",
          items: [],
        },
        {
          tripType: "POST_TRIP",
          inspectionDate: "2026-08-21",
          truckNumber: "12",
          workerName: "Jamie",
          items: [],
        },
      ],
      { companyName: "Forge Industrial" },
    );
    expect(html).toContain("2026-08-21");
    expect(html).toContain("Unit 12");
    expect(html).toContain("Forge Industrial");
    expect(html.match(/<section class="dvir-print__report"/g)?.length).toBe(2);
  });
});
