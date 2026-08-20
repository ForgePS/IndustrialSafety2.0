/**
 * Safety Intelligence Center — client types and helpers for the Analytics module.
 */

export type AnalyticsTab =
  | "overview"
  | "reports"
  | "safety"
  | "operations"
  | "dot"
  | "hotspots";

export const ANALYTICS_TABS: ReadonlyArray<{ id: AnalyticsTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "reports", label: "Custom Reports" },
  { id: "safety", label: "Safety Performance" },
  { id: "operations", label: "Operations" },
  { id: "dot", label: "DOT Compliance" },
  { id: "hotspots", label: "Injury Hotspots" },
];

export type AnalyticsPreset = "3m" | "6m" | "1y";

export type AnalyticsTrendPoint = { month: string; count: number };
export type AnalyticsCountItem = { label: string; count: number; key?: string; href?: string };

export type AnalyticsKpi = {
  id: string;
  label: string;
  value: string | number;
  sub?: string;
  href: string;
};

export type AnalyticsPeriodSummary = {
  id: "threeMonth" | "sixMonth" | "oneYear";
  label: string;
  dateRange: { start: string; end: string };
  incidents: number;
  inspections: number;
  observations: number;
  formSubmissions: number;
  trainingCompletions: number;
  scanCompletions: number;
  enterpriseActivity: number;
  jsas: number;
  totalActivity: number;
  avgInspectionScore: number | null;
  safetyScore: number;
  safetyGrade: "A" | "B" | "C" | "D" | "F";
  openIncidents: number;
  dot?: { totalRecords: number; openItems: number; complianceScore: number };
};

export type SafetyIntelligenceReport = {
  model: string;
  generatedAt: string;
  facilityId: string | null;
  periodLabel: string;
  preset: AnalyticsPreset;
  dateRange: { start: string; end: string };
  safetyScore: number;
  safetyGrade: "A" | "B" | "C" | "D" | "F";
  insights: string[];
  periodSummaries: AnalyticsPeriodSummary[];
  kpis: AnalyticsKpi[];
  incidentTrend: AnalyticsTrendPoint[];
  observationsTrend: AnalyticsTrendPoint[];
  inspectionsTrend: AnalyticsTrendPoint[];
  incidentsByStatus: AnalyticsCountItem[];
  observationsByStatus: AnalyticsCountItem[];
  activityByModule: AnalyticsCountItem[];
  enterpriseByModule: AnalyticsCountItem[];
  dot: { totalRecords: number; openItems: number; complianceScore: number };
  drilldowns?: Array<{ key: string; count: number; href: string }>;
};

export function parseAnalyticsTab(raw: string | null | undefined): AnalyticsTab {
  if (
    raw === "reports" ||
    raw === "safety" ||
    raw === "operations" ||
    raw === "dot" ||
    raw === "hotspots"
  ) {
    return raw;
  }
  return "overview";
}

export function presetFromPeriodId(id: AnalyticsPeriodSummary["id"]): AnalyticsPreset {
  if (id === "threeMonth") return "3m";
  if (id === "oneYear") return "1y";
  return "6m";
}

export function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case "A":
      return "bg-label-success";
    case "B":
      return "bg-label-primary";
    case "C":
      return "bg-label-warning";
    case "D":
    case "F":
      return "bg-label-danger";
    default:
      return "bg-label-secondary";
  }
}

export function toSafetyIntelligenceReport(raw: unknown): SafetyIntelligenceReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const periods = Array.isArray(r.periodSummaries) ? r.periodSummaries : [];
  const kpis = Array.isArray(r.kpis) ? r.kpis : [];
  if (periods.length === 0 && kpis.length === 0 && !Array.isArray(r.drilldowns)) return null;

  // Older API shape (simple drilldowns only) — lift into KPI tiles.
  const legacyKpis: AnalyticsKpi[] =
    kpis.length === 0 && Array.isArray(r.drilldowns)
      ? (r.drilldowns as Array<Record<string, unknown>>).map((d) => ({
          id: String(d.key ?? ""),
          label: String(d.key ?? "Metric"),
          value: typeof d.count === "number" ? d.count : 0,
          href: typeof d.href === "string" ? d.href : "/modules/analytics/",
        }))
      : (kpis as AnalyticsKpi[]);

  const score = typeof r.safetyScore === "number" ? r.safetyScore : 100;
  const grade =
    r.safetyGrade === "A" ||
    r.safetyGrade === "B" ||
    r.safetyGrade === "C" ||
    r.safetyGrade === "D" ||
    r.safetyGrade === "F"
      ? r.safetyGrade
      : score >= 90
        ? "A"
        : "C";

  return {
    model: typeof r.model === "string" ? r.model : "MODEL_A",
    generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : new Date().toISOString(),
    facilityId: typeof r.facilityId === "string" ? r.facilityId : null,
    periodLabel: typeof r.periodLabel === "string" ? r.periodLabel : "Last 6 months",
    preset: r.preset === "3m" || r.preset === "1y" ? r.preset : "6m",
    dateRange:
      r.dateRange && typeof r.dateRange === "object"
        ? (r.dateRange as { start: string; end: string })
        : { start: "", end: "" },
    safetyScore: score,
    safetyGrade: grade,
    insights: Array.isArray(r.insights) ? (r.insights as string[]) : [],
    periodSummaries: periods as AnalyticsPeriodSummary[],
    kpis: legacyKpis,
    incidentTrend: Array.isArray(r.incidentTrend) ? (r.incidentTrend as AnalyticsTrendPoint[]) : [],
    observationsTrend: Array.isArray(r.observationsTrend)
      ? (r.observationsTrend as AnalyticsTrendPoint[])
      : [],
    inspectionsTrend: Array.isArray(r.inspectionsTrend)
      ? (r.inspectionsTrend as AnalyticsTrendPoint[])
      : [],
    incidentsByStatus: Array.isArray(r.incidentsByStatus)
      ? (r.incidentsByStatus as AnalyticsCountItem[])
      : [],
    observationsByStatus: Array.isArray(r.observationsByStatus)
      ? (r.observationsByStatus as AnalyticsCountItem[])
      : [],
    activityByModule: Array.isArray(r.activityByModule)
      ? (r.activityByModule as AnalyticsCountItem[])
      : [],
    enterpriseByModule: Array.isArray(r.enterpriseByModule)
      ? (r.enterpriseByModule as AnalyticsCountItem[])
      : [],
    dot:
      r.dot && typeof r.dot === "object"
        ? (r.dot as SafetyIntelligenceReport["dot"])
        : { totalRecords: 0, openItems: 0, complianceScore: 100 },
    drilldowns: Array.isArray(r.drilldowns)
      ? (r.drilldowns as Array<{ key: string; count: number; href: string }>)
      : [],
  };
}

/** Tiny SVG polyline for monthly trend cards — no chart dependency. */
export function trendPolyline(points: AnalyticsTrendPoint[], width = 320, height = 120): string {
  if (points.length === 0) return "";
  const max = Math.max(...points.map((p) => p.count), 1);
  const step = points.length === 1 ? width / 2 : width / (points.length - 1);
  return points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : index * step;
      const y = height - (point.count / max) * (height - 16) - 8;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildAnalyticsExportRows(report: SafetyIntelligenceReport): string[][] {
  const rows: string[][] = [
    ["Safety Intelligence Center"],
    ["Period", report.periodLabel],
    ["Generated", report.generatedAt],
    ["Safety Score", String(report.safetyScore)],
    ["Grade", report.safetyGrade],
    [],
    ["KPI", "Value", "Detail"],
  ];
  for (const kpi of report.kpis) {
    rows.push([kpi.label, String(kpi.value), kpi.sub ?? ""]);
  }
  rows.push([], ["Insight"]);
  for (const insight of report.insights) rows.push([insight]);
  rows.push([], ["Module", "Count"]);
  for (const module of report.activityByModule) {
    rows.push([module.label, String(module.count)]);
  }
  return rows;
}
