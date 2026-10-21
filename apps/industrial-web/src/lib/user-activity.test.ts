import { describe, expect, it } from "vitest";
import {
  filterUserActivityRows,
  formatActivityRelative,
  formatAuditActionLabel,
  isUserOnlineFromActivity,
  sortUserActivityRows,
  type UserActivityRow,
} from "./user-activity";

function row(partial: Partial<UserActivityRow>): UserActivityRow {
  return {
    userId: "u1",
    membershipId: "m1",
    displayName: "Alex Admin",
    email: "alex@example.com",
    membershipStatus: "ACTIVE",
    roles: ["Admin"],
    lastLoginAt: null,
    lastActivityAt: null,
    online: false,
    ...partial,
  };
}

describe("user activity helpers", () => {
  it("detects online presence within the activity window", () => {
    const now = Date.parse("2026-09-04T20:00:00.000Z");
    expect(isUserOnlineFromActivity("2026-09-04T19:58:00.000Z", now)).toBe(true);
    expect(isUserOnlineFromActivity("2026-09-04T19:50:00.000Z", now)).toBe(false);
    expect(isUserOnlineFromActivity(null, now)).toBe(false);
  });

  it("formats relative activity times", () => {
    const now = Date.parse("2026-09-04T20:00:00.000Z");
    expect(formatActivityRelative("2026-09-04T19:59:30.000Z", now)).toBe("Just now");
    expect(formatActivityRelative("2026-09-04T19:45:00.000Z", now)).toBe("15 min ago");
    expect(formatActivityRelative(null, now)).toBe("Never");
  });

  it("formats audit action labels", () => {
    expect(formatAuditActionLabel("membership.roles.set")).toBe("Changed member roles");
    expect(formatAuditActionLabel("custom.thing.done")).toBe("Custom Thing Done");
  });

  it("sorts by most recent activity and filters by search", () => {
    const rows = [
      row({
        membershipId: "a",
        displayName: "Older",
        lastActivityAt: "2026-09-01T12:00:00.000Z",
      }),
      row({
        membershipId: "b",
        displayName: "Newer",
        email: "newer@example.com",
        lastActivityAt: "2026-09-04T12:00:00.000Z",
      }),
    ];
    expect(sortUserActivityRows(rows).map((r) => r.membershipId)).toEqual(["b", "a"]);
    expect(filterUserActivityRows(rows, "newer").map((r) => r.membershipId)).toEqual(["b"]);
  });
});
