/**
 * Pure helpers for Print Manager Phase 7 analytics aggregations.
 */

export function computePrintFailureRate(totalJobs: number, failedJobs: number): number {
  if (totalJobs <= 0) return 0;
  return Math.round((Math.max(0, failedJobs) / totalJobs) * 10000) / 100;
}

export function computePrintRetryRate(totalJobs: number, retriedJobs: number): number {
  if (totalJobs <= 0) return 0;
  return Math.round((Math.max(0, retriedJobs) / totalJobs) * 10000) / 100;
}

export function averageMs(samples: Array<number | null | undefined>): number | null {
  const vals = samples.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0,
  );
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function dayBucketUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function monthBucketUtc(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Default analytics window: last 30 days UTC through now. */
export function defaultAnalyticsRange(now = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 30);
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

export function parseAnalyticsRange(input: {
  from?: string | undefined;
  to?: string | undefined;
}): { from: Date; to: Date } {
  const fallback = defaultAnalyticsRange();
  const from = input.from ? new Date(input.from) : fallback.from;
  const to = input.to ? new Date(input.to) : fallback.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return fallback;
  }
  if (from.getTime() > to.getTime()) {
    return { from: to, to: from };
  }
  return { from, to };
}
