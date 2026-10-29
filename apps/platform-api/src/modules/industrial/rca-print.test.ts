import { describe, expect, it } from "vitest";
import { buildRcaPrintableHtml, formatRcaDate, normalizeRcaForPrint } from "./rca-print.js";

describe("rca-print", () => {
  it("normalizes partial payloads and drops empty rows", () => {
    const rca = normalizeRcaForPrint({
      contributingFactors: ["Rarely done", " "],
      correctiveActions: [{ action: "Bigger wheels", assignedTo: "Maint" }, { action: "" }],
      fiveWhys: ["Because A"],
    });
    expect(rca.contributingFactors).toEqual(["Rarely done"]);
    expect(rca.correctiveActions).toEqual([
      { action: "Bigger wheels", assignedTo: "Maint", dueDate: "", status: "" },
    ]);
    expect(normalizeRcaForPrint(null).fiveWhys).toEqual([]);
  });

  it("formats dates for the report", () => {
    expect(formatRcaDate("2026-11-02")).toBe("11/02/2026");
    expect(formatRcaDate("2026-10-05T14:00:00Z")).toBe("10/05/2026");
    expect(formatRcaDate("")).toBe("");
  });

  it("renders the full report with escaped content", () => {
    const html = buildRcaPrintableHtml({
      incident: {
        title: "26-10-05 SHANNA R FREEMAN - Mill",
        personAffected: "Shanna",
        status: "open",
      },
      rca: normalizeRcaForPrint({
        eventDate: "2026-10-05",
        conductedBy: "Tim Bogy, EHS Director",
        participantsInvolved: ["Tim Bogy", "Greg Stokes"],
        incidentSummary: "Leg crushed <screw>",
        fiveWhyQuestions: ["Why did it move?", "", "", "", ""],
        fiveWhys: ["Because it broke free", "", "", "", ""],
        rootCause: "Conveyor designed without weight considered",
        correctiveActions: [
          {
            action: "Replace wheels",
            assignedTo: "WR Maintenance",
            dueDate: "2026-11-02",
            status: "in-progress",
          },
        ],
      }),
      branding: { companyName: "Producers Rice Mill", logoUrl: "https://example.com/logo.png" },
      generatedAt: new Date("2026-10-08T12:00:00Z"),
    });
    expect(html).toContain("Root Cause Analysis");
    expect(html).toContain("Producers Rice Mill");
    expect(html).toContain("https://example.com/logo.png");
    expect(html).not.toContain('<div class="rca__company">');
    expect(html).toContain("Leg crushed &lt;screw&gt;");
    expect(html).not.toContain("<screw>");
    expect(html).toContain("Because it broke free");
    expect(html).toContain("10/05/2026");
    expect(html).toContain("11/02/2026");
    expect(html).toContain("In progress");
    expect(html).toContain("Reviewed and approved by");
    expect((html.match(/class="rca__num">\d<\/td><td>Why/g) ?? []).length).toBe(1);
  });
});
