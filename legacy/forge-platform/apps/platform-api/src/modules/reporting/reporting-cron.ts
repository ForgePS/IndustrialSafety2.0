/**
 * Minimal 5-field cron matcher (minute hour day-of-month month day-of-week).
 * Supports star, N, N-M, lists, and star/step. Evaluates in UTC.
 */

function fieldMatches(field: string, value: number): boolean {
  const trimmed = field.trim();
  if (!trimmed || trimmed === "*") return true;
  if (trimmed.includes(",")) {
    return trimmed.split(",").some((part) => fieldMatches(part, value));
  }
  if (trimmed.startsWith("*/")) {
    const step = Number(trimmed.slice(2));
    return Number.isFinite(step) && step > 0 && value % step === 0;
  }
  if (trimmed.includes("-")) {
    const [rawStart, rawEnd] = trimmed.split("-");
    const start = Number(rawStart);
    const end = Number(rawEnd);
    return Number.isFinite(start) && Number.isFinite(end) && value >= start && value <= end;
  }
  return Number(trimmed) === value;
}

export function isValidCronExpression(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  return parts.length === 5;
}

/** Next run at or after `from` (inclusive on the same minute if it matches). */
export function computeNextCronRun(cronExpression: string, from: Date = new Date()): Date | null {
  if (!isValidCronExpression(cronExpression)) return null;
  const parts = cronExpression.trim().split(/\s+/);
  const minuteF = parts[0]!;
  const hourF = parts[1]!;
  const domF = parts[2]!;
  const monthF = parts[3]!;
  const dowF = parts[4]!;
  const cursor = new Date(from.getTime());
  cursor.setUTCSeconds(0, 0);

  // Scan up to 366 days of minutes (bounded).
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const minute = cursor.getUTCMinutes();
    const hour = cursor.getUTCHours();
    const day = cursor.getUTCDate();
    const month = cursor.getUTCMonth() + 1;
    const dow = cursor.getUTCDay();

    if (
      fieldMatches(minuteF, minute) &&
      fieldMatches(hourF, hour) &&
      fieldMatches(domF, day) &&
      fieldMatches(monthF, month) &&
      fieldMatches(dowF, dow)
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

/** Next run strictly after `from`. */
export function computeNextCronRunAfter(
  cronExpression: string,
  from: Date = new Date(),
): Date | null {
  return computeNextCronRun(cronExpression, new Date(from.getTime() + 60_000));
}
