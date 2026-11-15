// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeIdleSignOutNotice,
  isIdleTimedOut,
  markIdleSignOutNotice,
  readLastActivityAt,
  recordUserActivity,
} from "./idle-timeout.js";

const HOUR = 60 * 60_000;

describe("idle-timeout", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shares last activity through localStorage", () => {
    expect(readLastActivityAt()).toBeNull();
    recordUserActivity(1_700_000_000_000);
    expect(readLastActivityAt()).toBe(1_700_000_000_000);
  });

  it("ignores corrupt activity values", () => {
    localStorage.setItem("forge-last-activity-at", "not-a-number");
    expect(readLastActivityAt()).toBeNull();
  });

  it("times out only after the full idle window", () => {
    const last = 1_700_000_000_000;
    expect(isIdleTimedOut(last, HOUR, last + HOUR - 1)).toBe(false);
    expect(isIdleTimedOut(last, HOUR, last + HOUR)).toBe(true);
    expect(isIdleTimedOut(null, HOUR, last + 5 * HOUR)).toBe(false);
    expect(isIdleTimedOut(last, 0, last + 5 * HOUR)).toBe(false);
  });

  it("shows the sign-out notice once", () => {
    expect(consumeIdleSignOutNotice()).toBe(false);
    markIdleSignOutNotice();
    expect(consumeIdleSignOutNotice()).toBe(true);
    expect(consumeIdleSignOutNotice()).toBe(false);
  });
});
