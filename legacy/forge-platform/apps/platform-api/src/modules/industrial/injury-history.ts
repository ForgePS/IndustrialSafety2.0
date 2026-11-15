import { cappedOshaDays, oshaCaseLogYear } from "@forge/contracts";
import { incidentOccurredDate } from "./incident-trend.js";
import { isOshaFormLogCase, type OshaCaseOutcome, type OshaRecordability } from "./osha-helpers.js";

/** Counts for one month or one year on the injury history graph. */
export type InjuryHistoryCounts = {
  /** Injury incidents that occurred in the period. */
  injuries: number;
  /** OSHA log cases with days away from work (lost-time cases). */
  lostTimeCases: number;
  /** Total days away on those OSHA cases. */
  daysAway: number;
};

/** One calendar year on the dashboard injury history graph. */
export type InjuryHistoryYear = InjuryHistoryCounts & {
  year: number;
  /**
   * Jan–Dec counts (index 0 = January). Records without a known month count toward
   * the year totals only, so the months can add up to less than the year.
   */
  months: InjuryHistoryCounts[];
};

/** Year and month (1–12) of a record; month is null when only the year is known. */
export type InjuryHistoryDate = { year: number | null; month: number | null };

export const INJURY_HISTORY_MAX_YEARS = 10;

export function isInjuryCategory(raw: unknown): boolean {
  const category = String(raw ?? "")
    .trim()
    .toLowerCase();
  return category === "injuries" || category === "injury";
}

/** Year and month an incident occurred ("Date occurred"), falling back to when it was recorded. */
export function incidentYearMonth(
  payload: Record<string, unknown>,
  createdAt: Date | null,
): InjuryHistoryDate {
  const date = incidentOccurredDate(payload, createdAt);
  if (!date) return { year: null, month: null };
  const month = Number(date.slice(5, 7));
  return {
    year: Number(date.slice(0, 4)),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
  };
}

/** Year an incident occurred ("Date occurred"), falling back to when it was recorded. */
export function incidentYear(
  payload: Record<string, unknown>,
  createdAt: Date | null,
): number | null {
  return incidentYearMonth(payload, createdAt).year;
}

/** Month (1–12) of an OSHA case, from its injury date when that date is in the log year. */
function oshaCaseMonth(injuryDate: string | null | undefined, logYear: number): number | null {
  if (!injuryDate || !/^\d{4}-\d{2}/.test(injuryDate)) return null;
  if (Number(injuryDate.slice(0, 4)) !== logYear) return null;
  const month = Number(injuryDate.slice(5, 7));
  return month >= 1 && month <= 12 ? month : null;
}

const emptyCounts = (): InjuryHistoryCounts => ({ injuries: 0, lostTimeCases: 0, daysAway: 0 });

const emptyYear = (year: number): InjuryHistoryYear => ({
  year,
  ...emptyCounts(),
  months: Array.from({ length: 12 }, emptyCounts),
});

/**
 * Counts injuries and lost-time cases per year and per month, from the first year with data
 * through `currentYear` (years with no records are 0). Keeps at most the last `maxYears` years.
 */
export function buildInjuryHistory(input: {
  injuries: InjuryHistoryDate[];
  oshaCases: Array<{
    recordabilityStatus: OshaRecordability;
    calendarYear: number | null;
    injuryDate?: string | null;
    caseOutcome: OshaCaseOutcome | null;
    daysAway: number | null;
  }>;
  currentYear: number;
  maxYears?: number;
}): InjuryHistoryYear[] {
  const maxYears = input.maxYears ?? INJURY_HISTORY_MAX_YEARS;
  const firstAllowed = input.currentYear - maxYears + 1;
  const byYear = new Map<number, InjuryHistoryYear>();
  const bucket = (year: number | null): InjuryHistoryYear | null => {
    if (year == null || !Number.isInteger(year)) return null;
    if (year < firstAllowed || year > input.currentYear) return null;
    let row = byYear.get(year);
    if (!row) {
      row = emptyYear(year);
      byYear.set(year, row);
    }
    return row;
  };

  for (const { year, month } of input.injuries) {
    const row = bucket(year);
    if (!row) continue;
    row.injuries += 1;
    if (month != null) row.months[month - 1]!.injuries += 1;
  }
  for (const c of input.oshaCases) {
    if (!isOshaFormLogCase(c.recordabilityStatus) || c.caseOutcome !== "DAYS_AWAY") continue;
    // Same rules as the OSHA log: injury year wins, days away count up to 180.
    const logYear = oshaCaseLogYear(c);
    const row = bucket(logYear);
    if (!row || logYear == null) continue;
    const days = cappedOshaDays(c.daysAway, null).daysAway;
    row.lostTimeCases += 1;
    row.daysAway += days;
    const month = oshaCaseMonth(c.injuryDate, logYear);
    if (month != null) {
      row.months[month - 1]!.lostTimeCases += 1;
      row.months[month - 1]!.daysAway += days;
    }
  }

  if (byYear.size === 0) return [];
  const first = Math.min(...byYear.keys());
  const years: InjuryHistoryYear[] = [];
  for (let year = first; year <= input.currentYear; year++) {
    years.push(byYear.get(year) ?? emptyYear(year));
  }
  return years;
}
