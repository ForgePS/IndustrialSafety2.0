import { parseOccurredDateTime } from "./osha-helpers.js";

/** "YYYY-MM-DD" an incident occurred ("Date occurred"), falling back to when it was recorded. */
export function incidentOccurredDate(
  payload: Record<string, unknown>,
  createdAt: Date | null,
): string | null {
  const occurred = parseOccurredDateTime(payload.dateOccurred ?? payload.occurredAt).date;
  if (occurred) return occurred;
  return createdAt ? createdAt.toISOString().slice(0, 10) : null;
}

const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Incidents per month by the date they occurred, for every month from `start` through `end`
 * (months with no incidents are 0, so the chart keeps an even time axis).
 */
export function monthlyIncidentTrend(
  occurredDates: Array<string | null>,
  start: Date,
  end: Date,
): Array<{ month: string; count: number }> {
  const counts = new Map<string, number>();
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = monthKey(end);
  for (let guard = 0; guard < 240; guard++) {
    const key = monthKey(cursor);
    counts.set(key, 0);
    if (key === last) break;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const from = start.toISOString().slice(0, 10);
  const to = end.toISOString().slice(0, 10);
  for (const date of occurredDates) {
    if (!date || date < from || date > to) continue;
    const key = date.slice(0, 7);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return [...counts].map(([month, count]) => ({ month, count }));
}
