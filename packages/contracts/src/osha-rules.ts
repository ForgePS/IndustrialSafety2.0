/**
 * OSHA recordkeeping rules shared by the API and the Industrial web app,
 * so the server and the printed Forms 300 / 300A apply the same math.
 */

/** OSHA 1904.7(b)(3)(vii): employers may stop counting days away + restricted at 180. */
export const OSHA_MAX_COUNTED_DAYS = 180;

/** Cap a case's days away and job-transfer days so their combined count is at most 180. */
export function cappedOshaDays(
  daysAway: number | null,
  restrictedDays: number | null,
): { daysAway: number; restrictedDays: number } {
  const away = Math.min(Math.max(daysAway ?? 0, 0), OSHA_MAX_COUNTED_DAYS);
  const restricted = Math.min(Math.max(restrictedDays ?? 0, 0), OSHA_MAX_COUNTED_DAYS - away);
  return { daysAway: away, restrictedDays: restricted };
}

/** The log year for a case: the injury year wins, the stored calendar year is the fallback. */
export function oshaCaseLogYear(c: {
  calendarYear: number | null;
  injuryDate?: string | null;
}): number | null {
  const fromDate =
    c.injuryDate && /^\d{4}/.test(c.injuryDate) ? Number(c.injuryDate.slice(0, 4)) : null;
  return fromDate ?? c.calendarYear ?? null;
}

/**
 * Key for "which Form 300 log is this case on" — the establishment name, normalized.
 * The web groups logs by this name, so server numbering must use the same key.
 */
export function oshaLogEstablishmentKey(establishment: string | null | undefined): string {
  return (establishment ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Trailing number in a case number ("7", "2026-007", "A-12"), or null. */
export function oshaCaseNumberSequence(caseNumber: unknown): number | null {
  const text =
    typeof caseNumber === "string" ? caseNumber : caseNumber == null ? "" : String(caseNumber);
  const match = /(\d+)\s*$/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

/**
 * Next Form 300 case number for one establishment's log in one year.
 * Pass archived cases too so a number is never reused.
 */
export function nextOshaCaseNumber(
  existing: Array<{ logKey: string; year: number | null; caseNumber: unknown }>,
  logKey: string,
  year: number | null,
): string {
  let max = 0;
  for (const row of existing) {
    if (row.logKey !== logKey || (row.year ?? null) !== (year ?? null)) continue;
    const seq = oshaCaseNumberSequence(row.caseNumber);
    if (seq != null && seq > max) max = seq;
  }
  return String(max + 1);
}
