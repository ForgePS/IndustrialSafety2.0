/** One year on the dashboard Injury History graph (from /analytics/injury-history). */
export type InjuryHistoryYear = {
  year: number;
  injuries: number;
  lostTimeCases: number;
  daysAway: number;
};

export type InjuryHistorySeries = "injuries" | "lostTimeCases";

const count = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

export function toInjuryHistory(raw: unknown): InjuryHistoryYear[] {
  const years = (raw as { years?: unknown } | null)?.years;
  if (!Array.isArray(years)) return [];
  return years
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      return {
        year: Number(r.year),
        injuries: count(r.injuries),
        lostTimeCases: count(r.lostTimeCases),
        daysAway: count(r.daysAway),
      };
    })
    .filter((r) => Number.isInteger(r.year))
    .sort((a, b) => a.year - b.year);
}

export type InjuryHistoryChange = {
  fromYear: number;
  toYear: number;
  from: number;
  to: number;
  /** Percent change, or null when the earlier year was 0. */
  percent: number | null;
  direction: "down" | "up" | "flat";
};

/**
 * Change between the last two full years (the current year is partial, so it is skipped).
 * Null when there are fewer than two full years.
 */
export function injuryHistoryChange(
  years: readonly InjuryHistoryYear[],
  series: InjuryHistorySeries,
  currentYear: number,
): InjuryHistoryChange | null {
  const full = years.filter((y) => y.year < currentYear);
  if (full.length < 2) return null;
  const prev = full[full.length - 2]!;
  const last = full[full.length - 1]!;
  const from = prev[series];
  const to = last[series];
  return {
    fromYear: prev.year,
    toYear: last.year,
    from,
    to,
    percent: from === 0 ? null : Math.round(((to - from) / from) * 100),
    direction: to < from ? "down" : to > from ? "up" : "flat",
  };
}
