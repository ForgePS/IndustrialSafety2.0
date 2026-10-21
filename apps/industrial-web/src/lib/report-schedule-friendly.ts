/**
 * User-facing report schedule helpers.
 * API still stores 5-field cron; users never see it.
 *
 * Times are expressed in US Central and mapped to UTC the same way as the
 * monthly Safety Supplies email (8:00 AM Central → 13:00 UTC / CDT offset).
 */

export type ScheduleFrequency = "daily" | "weekly" | "monthly";

export type FriendlyScheduleDraft = {
  frequency: ScheduleFrequency;
  /** 0–23 in US Central */
  hourCentral: number;
  /** 0=Sun … 6=Sat; used when frequency=weekly */
  weekday: number;
};

export const REPORT_SCHEDULE_TIMEZONE = "America/Chicago";

/** CDT-style offset used by existing monthly schedule (8 AM Central = 13:00 UTC). */
const CENTRAL_TO_UTC_HOUR_OFFSET = 5;

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const DEFAULT_FRIENDLY_SCHEDULE: FriendlyScheduleDraft = {
  frequency: "weekly",
  hourCentral: 8,
  weekday: 1,
};

export function formatCentralHour(hourCentral: number): string {
  const h = ((hourCentral % 24) + 24) % 24;
  const suffix = h >= 12 ? "PM" : "AM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
}

export function centralHourToUtcHour(hourCentral: number): number {
  const h = ((hourCentral % 24) + 24) % 24;
  return (h + CENTRAL_TO_UTC_HOUR_OFFSET) % 24;
}

export function utcHourToCentralHour(utcHour: number): number {
  const h = ((utcHour % 24) + 24) % 24;
  return (h - CENTRAL_TO_UTC_HOUR_OFFSET + 24) % 24;
}

/** Build API cron from friendly controls. */
export function friendlyScheduleToCron(draft: FriendlyScheduleDraft): string {
  const utcHour = centralHourToUtcHour(draft.hourCentral);
  if (draft.frequency === "daily") {
    return `0 ${utcHour} * * *`;
  }
  if (draft.frequency === "weekly") {
    const dow = Math.min(6, Math.max(0, draft.weekday));
    return `0 ${utcHour} * * ${dow}`;
  }
  // Monthly on the 1st
  return `0 ${utcHour} 1 * *`;
}

/** Inverse of `friendlyScheduleToCron`; unrecognized patterns fall back to the default draft. */
export function cronToFriendlySchedule(cronExpression: string): FriendlyScheduleDraft {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return { ...DEFAULT_FRIENDLY_SCHEDULE };
  const [, hourRaw, dom, , dow] = parts;
  const utcHour = Number(hourRaw);
  const hourCentral = Number.isInteger(utcHour)
    ? utcHourToCentralHour(utcHour)
    : DEFAULT_FRIENDLY_SCHEDULE.hourCentral;
  if (dom === "1" && (dow === "*" || dow === "?")) {
    return { frequency: "monthly", hourCentral, weekday: DEFAULT_FRIENDLY_SCHEDULE.weekday };
  }
  if (dom === "*" && /^\d$/.test(dow ?? "")) {
    return { frequency: "weekly", hourCentral, weekday: Math.min(6, Number(dow)) };
  }
  if (dom === "*" && dow === "*") {
    return { frequency: "daily", hourCentral, weekday: DEFAULT_FRIENDLY_SCHEDULE.weekday };
  }
  return { ...DEFAULT_FRIENDLY_SCHEDULE, hourCentral };
}

/** Comma / semicolon / newline separated emails, de-duplicated (case-insensitive). */
export function parseRecipientEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const email = part.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/**
 * Turn a stored cron into plain English when it matches our friendly patterns.
 * Falls back to a short generic line (never shows the raw cron to end users).
 */
export function describeCronExpression(cronExpression: string, timezone?: string | null): string {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return "On a recurring schedule";
  }
  const [, hourRaw, dom, , dow] = parts;
  const utcHour = Number(hourRaw);
  const hourCentral = Number.isFinite(utcHour) ? utcHourToCentralHour(utcHour) : 8;
  const timeLabel = `${formatCentralHour(hourCentral)} US Central`;
  const tzNote =
    timezone && timezone !== "UTC" && timezone !== REPORT_SCHEDULE_TIMEZONE
      ? ` (${timezone})`
      : "";

  if (dom === "1" && (dow === "*" || dow === "?")) {
    return `Monthly on the 1st at ${timeLabel}${tzNote}`;
  }
  if (dom === "*" && dow === "*") {
    return `Every day at ${timeLabel}${tzNote}`;
  }
  if (dom === "*" && /^\d$/.test(dow ?? "")) {
    const day = WEEKDAY_LABELS[Number(dow)] ?? "week";
    return `Every ${day} at ${timeLabel}${tzNote}`;
  }
  if (dom === "*" && dow === "1-5") {
    return `Weekdays at ${timeLabel}${tzNote}`;
  }
  return `Recurring at ${timeLabel}${tzNote}`;
}

export function describeFriendlyDraft(draft: FriendlyScheduleDraft): string {
  return describeCronExpression(friendlyScheduleToCron(draft), REPORT_SCHEDULE_TIMEZONE);
}

export function formatNextRun(iso: string | null | undefined): string {
  if (!iso) return "Not scheduled yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not scheduled yet";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const HOUR_OPTIONS: { value: number; label: string }[] = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: formatCentralHour(h),
}));

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = WEEKDAY_LABELS.map(
  (label, value) => ({ value, label }),
);
