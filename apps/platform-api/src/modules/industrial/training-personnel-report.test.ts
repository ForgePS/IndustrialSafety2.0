import { describe, expect, it } from "vitest";
import {
  buildCompletionPrintableHtml,
  buildPersonnelTrainingReportHtml,
} from "./training-personnel-report.js";

describe("buildPersonnelTrainingReportHtml", () => {
  it("renders employee summary tables", () => {
    const html = buildPersonnelTrainingReportHtml({
      employee: {
        displayName: "Jane Doe",
        employeeNumber: "EMP-21055",
        jobTitle: "Operator",
        departmentName: "Mill",
        siteName: "Stuttgart",
      },
      branding: { companyName: "Producers Rice Mill" },
      openAssignments: [
        {
          title: "LOTO Refresher",
          sourceTitle: "Safety Basics",
          status: "IN_PROGRESS",
          dueAt: "2026-09-01",
          bestPercent: 82,
        },
      ],
      completions: [
        {
          id: "c1",
          assignmentTitle: "Forklift",
          sourceTitle: "Equipment",
          result: "PASSED",
          scorePercent: 92,
          passingPercent: 80,
          attemptNumber: 1,
          completedAt: "2026-08-01T12:00:00.000Z",
        },
      ],
      legacyRecords: [],
    });
    expect(html).toContain("Employee training report");
    expect(html).toContain("Jane Doe");
    expect(html).toContain("EMP-21055");
    expect(html).toContain("LOTO Refresher");
    expect(html).toContain("Forklift");
    expect(html).toContain("Print / Save as PDF");
  });
});

describe("buildCompletionPrintableHtml", () => {
  it("renders quiz responses with marks", () => {
    const html = buildCompletionPrintableHtml({
      employee: {
        displayName: "Jane Doe",
        employeeNumber: "EMP-21055",
      },
      assignmentTitle: "Forklift safety",
      sourceTitle: "Equipment training",
      result: "PASSED",
      scorePercent: 100,
      passingPercent: 80,
      attemptNumber: 1,
      completedAt: "2026-08-01T12:00:00.000Z",
      questions: [
        {
          stem: "When should you inspect the forklift?",
          choices: ["Before each shift", "Monthly", "Never"],
          selectedIndex: 0,
          correctIndex: 0,
          correct: true,
        },
      ],
    });
    expect(html).toContain("Quiz responses");
    expect(html).toContain("Before each shift");
    expect(html).toContain("✓");
  });
});
