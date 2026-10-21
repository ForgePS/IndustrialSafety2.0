/**
 * Cross-tab user-inactivity tracking for browser sessions.
 *
 * The last user interaction is kept in localStorage so activity in any tab keeps every
 * tab signed in, and a browser reopened after the timeout is signed out on bootstrap.
 * Background token refresh is not activity — only real input events count.
 */

const LAST_ACTIVITY_KEY = "forge-last-activity-at";
const IDLE_SIGNOUT_NOTICE_KEY = "forge-idle-signout-notice";

/** Minimum gap between localStorage writes while the user is active. */
export const IDLE_ACTIVITY_WRITE_THROTTLE_MS = 15_000;

/** Input events that count as user activity. */
export const IDLE_ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "scroll",
  "touchstart",
] as const;

export function readLastActivityAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function recordUserActivity(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // ignore quota / private mode
  }
}

export function isIdleTimedOut(
  lastActivityAt: number | null,
  timeoutMs: number,
  now: number = Date.now(),
): boolean {
  if (lastActivityAt == null || !(timeoutMs > 0)) return false;
  return now - lastActivityAt >= timeoutMs;
}

export function markIdleSignOutNotice(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(IDLE_SIGNOUT_NOTICE_KEY, "1");
  } catch {
    // ignore
  }
}

/** True once after an inactivity sign-out; clears the flag. */
export function consumeIdleSignOutNotice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flagged = localStorage.getItem(IDLE_SIGNOUT_NOTICE_KEY) === "1";
    if (flagged) localStorage.removeItem(IDLE_SIGNOUT_NOTICE_KEY);
    return flagged;
  } catch {
    return false;
  }
}
