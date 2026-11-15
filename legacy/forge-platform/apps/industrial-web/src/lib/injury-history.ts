/** Counts for one month or one year on the dashboard Injury History graph. */
export type InjuryHistoryCounts = {
  injuries: number;
  lostTimeCases: number;
  daysAway: number;
};

/** One year on the dashboard Injury History graph (from /analytics/injury-history). */
export type InjuryHistoryYear = InjuryHistoryCounts & {
  year: number;
  /** Jan–Dec counts, always 12 entries (index 0 = January). */
  months: InjuryHistoryCounts[];
};

export type InjuryHistorySeries = "injuries" | "lostTimeCases";

const count = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const toCounts = (raw: unknown): InjuryHistoryCounts => {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    injuries: count(r.injuries),
    lostTimeCases: count(r.lostTimeCases),
    daysAway: count(r.daysAway),
  };
};

const emptyMonths = (): InjuryHistoryCounts[] =>
  Array.from({ length: 12 }, () => ({ injuries: 0, lostTimeCases: 0, daysAway: 0 }));

export function toInjuryHistory(raw: unknown): InjuryHistoryYear[] {
  const years = (raw as { years?: unknown } | null)?.years;
  if (!Array.isArray(years)) return [];
  return years
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const months = Array.isArray(r.months) ? r.months : [];
      return {
        year: Number(r.year),
        ...toCounts(r),
        months: emptyMonths().map((empty, i) => (i < months.length ? toCounts(months[i]) : empty)),
      };
    })
    .filter((r) => Number.isInteger(r.year))
    .sort((a, b) => a.year - b.year);
}

/** The last `range` years through `currentYear`, oldest first; years with no records are 0. */
export function fillHistoryYears(
  years: readonly InjuryHistoryYear[],
  currentYear: number,
  range: number,
): InjuryHistoryYear[] {
  const byYear = new Map(years.map((y) => [y.year, y]));
  const out: InjuryHistoryYear[] = [];
  for (let year = currentYear - range + 1; year <= currentYear; year++) {
    out.push(
      byYear.get(year) ?? {
        year,
        injuries: 0,
        lostTimeCases: 0,
        daysAway: 0,
        months: emptyMonths(),
      },
    );
  }
  return out;
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
  years: ReadonlyArray<InjuryHistoryCounts & { year: number }>,
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
