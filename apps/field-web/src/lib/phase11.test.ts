import { describe, expect, it } from "vitest";
import { addDays, startOfDay } from "@/lib/calendar/dates";
import {
  daysForFieldCalendarView,
  filterEventsForLocation,
  rangeForFieldCalendarView,
} from "@/lib/calendar/range";
import type { FieldCalendarEvent } from "@/lib/calendar/types";
import {
  filterRemindersForView,
  isOverdueReminder,
  isUpcomingReminder,
  snoozeRemindAt,
} from "@/lib/reminders/filter";
import type { FieldReminder } from "@/lib/reminders/types";
import { reminderOpenHref } from "@/lib/reminders/types";
import { MY_FORGE_SECTIONS } from "@/lib/my-forge";
import { isFieldFeatureModuleEnabled } from "@/lib/field-modules";

function event(
  partial: Partial<FieldCalendarEvent> & { id: string; title: string },
): FieldCalendarEvent {
  return {
    startsAt: null,
    endsAt: null,
    ...partial,
  };
}

function reminder(
  partial: Partial<FieldReminder> & { id: string; status: string; remindAt: string | null },
): FieldReminder {
  return {
    channel: "IN_APP",
    title: "Reminder",
    ...partial,
  };
}

describe("calendar range", () => {
  it("uses a 14-day agenda window", () => {
    const anchor = new Date(2026, 8, 11, 10, 0, 0);
    const { from, to } = rangeForFieldCalendarView("agenda", anchor);
    expect(startOfDay(from).getTime()).toBe(startOfDay(anchor).getTime());
    expect(daysForFieldCalendarView("agenda", anchor)).toHaveLength(14);
    expect(to.getTime()).toBeGreaterThan(from.getTime());
  });

  it("filters events by Location (site_id)", () => {
    const rows = [
      event({ id: "1", title: "A", siteId: "loc-1", startsAt: "2026-09-11T10:00:00.000Z" }),
      event({ id: "2", title: "B", siteId: "loc-2", startsAt: "2026-09-11T11:00:00.000Z" }),
      event({ id: "3", title: "C", siteId: null, startsAt: "2026-09-11T12:00:00.000Z" }),
    ];
    expect(filterEventsForLocation(rows, "loc-1").map((e) => e.id)).toEqual(["1", "3"]);
    expect(filterEventsForLocation(rows, "").map((e) => e.id)).toEqual(["1", "2", "3"]);
  });
});

describe("reminders filter", () => {
  const now = new Date(2026, 8, 11, 12, 0, 0);

  it("classifies upcoming and overdue", () => {
    const upcoming = reminder({
      id: "u",
      status: "PENDING",
      remindAt: addDays(now, 1).toISOString(),
    });
    const overdue = reminder({
      id: "o",
      status: "PENDING",
      remindAt: addDays(now, -1).toISOString(),
    });
    expect(isUpcomingReminder(upcoming, now)).toBe(true);
    expect(isOverdueReminder(overdue, now)).toBe(true);
    expect(filterRemindersForView([upcoming, overdue], "upcoming", now).map((r) => r.id)).toEqual([
      "u",
    ]);
    expect(filterRemindersForView([upcoming, overdue], "overdue", now).map((r) => r.id)).toEqual([
      "o",
    ]);
  });

  it("builds Field deep links and snooze offsets", () => {
    expect(
      reminderOpenHref(reminder({ id: "1", status: "PENDING", remindAt: null, taskId: "t1" })),
    ).toBe("/tasks/item/t1/");
    expect(
      reminderOpenHref(reminder({ id: "2", status: "PENDING", remindAt: null, eventId: "e1" })),
    ).toBe("/calendar/?eventId=e1");
    const snoozed = snoozeRemindAt(now, 1);
    expect(snoozed.getTime() - now.getTime()).toBe(60 * 60 * 1000);
  });
});

describe("my forge + modules", () => {
  it("gates calendar and reminders feature ids", () => {
    expect(isFieldFeatureModuleEnabled(["CALENDAR"], "calendar")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "calendar")).toBe(false);
    expect(isFieldFeatureModuleEnabled(["REMINDERS"], "more-reminders")).toBe(true);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "more-reminders")).toBe(false);
    expect(isFieldFeatureModuleEnabled(["TRAINING"], "my-forge")).toBe(true);
  });

  it("includes core personal sections", () => {
    const ids = MY_FORGE_SECTIONS.map((s) => s.id);
    expect(ids).toContain("profile");
    expect(ids).toContain("schedule");
    expect(ids).toContain("settings");
  });
});
