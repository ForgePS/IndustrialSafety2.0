import { describe, expect, it } from "vitest";
import {
  cronToFriendlySchedule,
  DEFAULT_FRIENDLY_SCHEDULE,
  parseRecipientEmails,
  describeCronExpression,
  friendlyScheduleToCron,
  formatCentralHour,
  formatNextRun,
} from "./report-schedule-friendly";

describe("report-schedule-friendly", () => {
  it("maps weekly Monday 8 AM Central to the same UTC pattern as product default", () => {
    expect(
      friendlyScheduleToCron({
        frequency: "weekly",
        hourCentral: 8,
        weekday: 1,
      }),
    ).toBe("0 13 * * 1");
  });

  it("maps monthly 1st 8 AM Central like Safety Supplies", () => {
    expect(
      friendlyScheduleToCron({
        frequency: "monthly",
        hourCentral: 8,
        weekday: 1,
      }),
    ).toBe("0 13 1 * *");
  });

  it("describes common crons in plain English", () => {
    expect(describeCronExpression("0 13 1 * *")).toBe("Monthly on the 1st at 8:00 AM US Central");
    expect(describeCronExpression("0 13 * * 1")).toBe("Every Monday at 8:00 AM US Central");
    expect(describeCronExpression("0 13 * * *")).toBe("Every day at 8:00 AM US Central");
  });

  it("formats hours and next run for people", () => {
    expect(formatCentralHour(0)).toBe("12:00 AM");
    expect(formatCentralHour(8)).toBe("8:00 AM");
    expect(formatCentralHour(15)).toBe("3:00 PM");
    expect(formatNextRun(null)).toBe("Not scheduled yet");
    expect(formatNextRun("not-a-date")).toBe("Not scheduled yet");
  });

  it("round-trips stored crons back into the edit form", () => {
    expect(cronToFriendlySchedule("0 12 * * 5")).toEqual({
      frequency: "weekly",
      hourCentral: 7,
      weekday: 5,
    });
    expect(cronToFriendlySchedule("0 13 1 * *")).toMatchObject({
      frequency: "monthly",
      hourCentral: 8,
    });
    expect(cronToFriendlySchedule("0 3 * * *")).toMatchObject({
      frequency: "daily",
      hourCentral: 22,
    });
    expect(cronToFriendlySchedule("bad")).toEqual(DEFAULT_FRIENDLY_SCHEDULE);
    const draft = { frequency: "weekly" as const, hourCentral: 15, weekday: 2 };
    expect(cronToFriendlySchedule(friendlyScheduleToCron(draft))).toEqual(draft);
  });

  it("parses multiple recipient emails", () => {
    expect(parseRecipientEmails("a@x.com, b@x.com\nA@x.com; not-an-email")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("default draft is weekly Monday morning", () => {
    expect(DEFAULT_FRIENDLY_SCHEDULE).toEqual({
      frequency: "weekly",
      hourCentral: 8,
      weekday: 1,
    });
  });
});
