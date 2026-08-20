import { describe, expect, it } from "vitest";
import { aggregateInspectionsBySite, safetyIndexView } from "./dashboard-insights";
import type { SafetyIntelligenceReport } from "./safety-intelligence";

describe("aggregateInspectionsBySite", () => {
  it("groups by site name and sorts by count", () => {
    const sites = aggregateInspectionsBySite([
      { id: "1", siteName: "Plant A" },
      { id: "2", site: "Plant B" },
      { id: "3", siteName: "Plant A" },
      { id: "4" },
    ]);
    expect(sites).toEqual([
      { label: "Plant A", count: 2 },
      { label: "Plant B", count: 1 },
      { label: "Unassigned site", count: 1 },
    ]);
  });

  it("resolves siteId via lookup map", () => {
    const sites = aggregateInspectionsBySite(
      [{ id: "1", siteId: "abc" }],
      new Map([["abc", "North Yard"]]),
    );
    expect(sites).toEqual([{ label: "North Yard", count: 1 }]);
  });
});

describe("safetyIndexView", () => {
  const report = {
    preset: "6m",
    periodLabel: "Last 6 months",
    dateRange: { start: "2026-02-19", end: "2026-08-19" },
    safetyScore: 58,
    safetyGrade: "F",
    dot: { totalRecords: 12, openItems: 3, complianceScore: 94 },
    periodSummaries: [
      {
        id: "sixMonth",
        label: "Last 6 Months",
        dateRange: { start: "2026-02-19", end: "2026-08-19" },
        safetyScore: 58,
        safetyGrade: "F",
        dot: { totalRecords: 12, openItems: 3, complianceScore: 94 },
      },
      {
        id: "oneYear",
        label: "Last 12 Months",
        dateRange: { start: "2025-08-19", end: "2026-08-19" },
        safetyScore: 71,
        safetyGrade: "C",
        dot: { totalRecords: 20, openItems: 1, complianceScore: 88 },
      },
    ],
  } as SafetyIntelligenceReport;

  it("reads 6-month and 12-month period summaries", () => {
    expect(safetyIndexView(report, "6m")).toMatchObject({
      score: 58,
      grade: "F",
      dotScore: 94,
      dotOpenItems: 3,
    });
    expect(safetyIndexView(report, "1y")).toMatchObject({
      score: 71,
      grade: "C",
      dotScore: 88,
      dotOpenItems: 1,
    });
  });

  it("falls back to the report score when summaries are missing", () => {
    const thin = { ...report, periodSummaries: [] };
    expect(safetyIndexView(thin, "6m")).toMatchObject({ score: 58, dotScore: 94 });
    expect(safetyIndexView(thin, "1y")).toBeNull();
  });
});
