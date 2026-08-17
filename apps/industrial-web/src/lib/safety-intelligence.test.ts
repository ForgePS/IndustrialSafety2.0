import { describe, expect, it } from "vitest";
import {
  buildAnalyticsExportRows,
  gradeBadgeClass,
  parseAnalyticsTab,
  presetFromPeriodId,
  toSafetyIntelligenceReport,
  trendPolyline,
} from "./safety-intelligence";

describe("safety intelligence helpers", () => {
  it("parses tabs and period presets", () => {
    expect(parseAnalyticsTab("operations")).toBe("operations");
    expect(parseAnalyticsTab("nope")).toBe("overview");
    expect(presetFromPeriodId("threeMonth")).toBe("3m");
    expect(presetFromPeriodId("oneYear")).toBe("1y");
    expect(gradeBadgeClass("A")).toBe("bg-label-success");
  });

  it("maps a full API report", () => {
    const report = toSafetyIntelligenceReport({
      model: "MODEL_A",
      generatedAt: "2026-08-17T12:00:00.000Z",
      periodLabel: "Last 6 months",
      preset: "6m",
      safetyScore: 100,
      safetyGrade: "A",
      insights: ["No open incidents"],
      periodSummaries: [
        {
          id: "sixMonth",
          label: "Last 6 Months",
          dateRange: { start: "2026-02-17", end: "2026-08-17" },
          incidents: 0,
          inspections: 0,
          observations: 0,
          formSubmissions: 0,
          trainingCompletions: 0,
          scanCompletions: 0,
          enterpriseActivity: 499,
          jsas: 888,
          totalActivity: 888,
          avgInspectionScore: null,
          safetyScore: 100,
          safetyGrade: "A",
          openIncidents: 0,
        },
      ],
      kpis: [{ id: "safety-score", label: "Safety Score", value: 100, href: "/modules/analytics/" }],
      incidentTrend: [{ month: "2026-08", count: 0 }],
      observationsTrend: [],
      inspectionsTrend: [],
      incidentsByStatus: [],
      observationsByStatus: [],
      activityByModule: [{ label: "JSAs", count: 888, href: "/modules/jsas/" }],
      enterpriseByModule: [],
      dot: { totalRecords: 0, openItems: 0, complianceScore: 100 },
    });
    expect(report?.safetyScore).toBe(100);
    expect(report?.kpis).toHaveLength(1);
    expect(trendPolyline(report!.incidentTrend)).toContain(",");
    expect(buildAnalyticsExportRows(report!)[0]).toEqual(["Safety Intelligence Center"]);
  });

  it("lifts legacy drilldowns into KPI tiles", () => {
    const report = toSafetyIntelligenceReport({
      generatedAt: "2026-08-17T12:00:00.000Z",
      drilldowns: [{ key: "incidents", count: 3, href: "/modules/incidents" }],
    });
    expect(report?.kpis[0]?.label).toBe("incidents");
    expect(report?.kpis[0]?.value).toBe(3);
  });
});
