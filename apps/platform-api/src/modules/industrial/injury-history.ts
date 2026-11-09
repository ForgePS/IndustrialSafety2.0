import { cappedOshaDays, oshaCaseLogYear } from "@forge/contracts";
import { incidentOccurredDate } from "./incident-trend.js";
import { isOshaFormLogCase, type OshaCaseOutcome, type OshaRecordability } from "./osha-helpers.js";

/** One calendar year on the dashboard injury history graph. */
export type InjuryHistoryYear = {
  year: number;
  /** Injury incidents that occurred in the year. */
  injuries: number;
  /** OSHA log cases with days away from work (lost-time cases). */
  lostTimeCases: number;
  /** Total days away on those OSHA cases. */
  daysAway: number;
};

export const INJURY_HISTORY_MAX_YEARS = 10;

export function isInjuryCategory(raw: unknown): boolean {
  const category = String(raw ?? "")
    .trim()
    .toLowerCase();
  return category === "injuries" || category === "injury";
}

/** Year an incident occurred ("Date occurred"), falling back to when it was recorded. */
export function incidentYear(
  payload: Record<string, unknown>,
  createdAt: Date | null,
): number | null {
  const date = incidentOccurredDate(payload, createdAt);
  return date ? Number(date.slice(0, 4)) : null;
}

/**
 * Counts injuries and lost-time cases per year, from the first year with data through
 * `currentYear` (years with no records are 0). Keeps at most the last `maxYears` years.
 */
export function buildInjuryHistory(input: {
  injuryYears: Array<number | null>;
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
      row = { year, injuries: 0, lostTimeCases: 0, daysAway: 0 };
      byYear.set(year, row);
    }
    return row;
  };

  for (const year of input.injuryYears) {
    const row = bucket(year);
    if (row) row.injuries += 1;
  }
  for (const c of input.oshaCases) {
    if (!isOshaFormLogCase(c.recordabilityStatus) || c.caseOutcome !== "DAYS_AWAY") continue;
    // Same rules as the OSHA log: injury year wins, days away count up to 180.
    const row = bucket(oshaCaseLogYear(c));
    if (!row) continue;
    row.lostTimeCases += 1;
    row.daysAway += cappedOshaDays(c.daysAway, null).daysAway;
  }

  if (byYear.size === 0) return [];
  const first = Math.min(...byYear.keys());
  const years: InjuryHistoryYear[] = [];
  for (let year = first; year <= input.currentYear; year++) {
    years.push(byYear.get(year) ?? { year, injuries: 0, lostTimeCases: 0, daysAway: 0 });
  }
  return years;
}
