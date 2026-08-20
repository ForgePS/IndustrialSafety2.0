import type { AnalyticsPeriodSummary, SafetyIntelligenceReport } from "@/lib/safety-intelligence";

export type SiteCount = { label: string; count: number };

export type SafetyIndexPeriod = "6m" | "1y";

export type SafetyIndexView = {
  score: number;
  grade: AnalyticsPeriodSummary["safetyGrade"];
  dateStart: string;
  dateEnd: string;
  periodLabel: string;
  dotScore: number;
  dotOpenItems: number;
};

/** Dashboard date range like "Feb 19, 2026 – Aug 19, 2026". */
export function formatInsightDateRange(start: string, end: string, fallback = "Last 6 months"): string {
  const fmt = (iso: string) => {
    if (!iso) return "";
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || fallback;
}

export function safetyIndexStrokeClass(grade: string): string {
  if (grade === "A") return "is-a";
  if (grade === "B") return "is-b";
  if (grade === "C") return "is-c";
  return "is-low";
}

function reportDotFallback(report: SafetyIntelligenceReport): {
  dotScore: number;
  dotOpenItems: number;
} {
  return {
    dotScore: report.dot.complianceScore,
    dotOpenItems: report.dot.openItems,
  };
}

function periodDot(summary: AnalyticsPeriodSummary | undefined, report: SafetyIntelligenceReport) {
  if (summary?.dot && typeof summary.dot.complianceScore === "number") {
    return {
      dotScore: summary.dot.complianceScore,
      dotOpenItems: summary.dot.openItems,
    };
  }
  return reportDotFallback(report);
}

/**
 * 6-month / 12-month company score from the analytics overview payload.
 * Falls back to the report's active score when a period summary is missing.
 */
export function safetyIndexView(
  report: SafetyIntelligenceReport | null,
  period: SafetyIndexPeriod,
): SafetyIndexView | null {
  if (!report) return null;
  const wantedId = period === "1y" ? "oneYear" : "sixMonth";
  const summary = report.periodSummaries.find((row) => row.id === wantedId);
  const dot = periodDot(summary, report);
  if (summary) {
    return {
      score: summary.safetyScore,
      grade: summary.safetyGrade,
      dateStart: summary.dateRange.start,
      dateEnd: summary.dateRange.end,
      periodLabel: summary.label,
      ...dot,
    };
  }
  if (period === "6m" || report.preset === "1y") {
    return {
      score: report.safetyScore,
      grade: report.safetyGrade,
      dateStart: report.dateRange.start,
      dateEnd: report.dateRange.end,
      periodLabel: report.periodLabel,
      ...dot,
    };
  }
  return null;
}

/**
 * Group inspection list rows by site label for the dashboard card.
 * Prefers a human site name from the payload; falls back to siteId lookup.
 */
export function aggregateInspectionsBySite(
  items: unknown[],
  siteNamesById: Map<string, string> = new Map(),
): SiteCount[] {
  const counts = new Map<string, number>();

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const label = siteLabelForInspection(row, siteNamesById);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function siteLabelForInspection(
  row: Record<string, unknown>,
  siteNamesById: Map<string, string>,
): string {
  for (const key of ["siteName", "site", "facilityName", "location", "facility"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const siteId = typeof row.siteId === "string" ? row.siteId.trim() : "";
  if (siteId) {
    return siteNamesById.get(siteId) ?? `Site ${siteId.slice(0, 8)}`;
  }
  return "Unassigned site";
}
