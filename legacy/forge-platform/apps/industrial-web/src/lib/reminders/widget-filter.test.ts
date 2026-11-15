import { describe, expect, it } from "vitest";
import type { WorkspaceReminder } from "./types";
import {
  filterRemindersForWidgetView,
  isOverdueReminder,
  isUpcomingReminder,
  summarizeReminders,
} from "./widget-filter";

function reminder(
  partial: Partial<WorkspaceReminder> & { id: string; remindAt: string },
): WorkspaceReminder {
  return {
    title: "Reminder",
    channel: "IN_APP",
    status: "PENDING",
    ...partial,
  };
}

describe("reminders widget filters", () => {
  const now = new Date(2026, 8, 8, 12, 0, 0);

  const items: WorkspaceReminder[] = [
    reminder({
      id: "1",
      title: "Later today",
      remindAt: new Date(2026, 8, 8, 16, 0).toISOString(),
    }),
    reminder({
      id: "2",
      title: "Tomorrow",
      remindAt: new Date(2026, 8, 9, 9, 0).toISOString(),
    }),
    reminder({
      id: "3",
      title: "Past pending",
      remindAt: new Date(2026, 8, 8, 8, 0).toISOString(),
    }),
    reminder({
      id: "4",
      title: "Sent yesterday",
      status: "SENT",
      remindAt: new Date(2026, 8, 7, 10, 0).toISOString(),
    }),
    reminder({
      id: "5",
      title: "Cancelled",
      status: "CANCELLED",
      remindAt: new Date(2026, 8, 8, 15, 0).toISOString(),
    }),
  ];

  it("classifies upcoming and overdue", () => {
    expect(isUpcomingReminder(items[0]!, now)).toBe(true);
    expect(isUpcomingReminder(items[2]!, now)).toBe(false);
    expect(isOverdueReminder(items[2]!, now)).toBe(true);
    expect(isOverdueReminder(items[3]!, now)).toBe(true);
  });

  it("filters widget views", () => {
    expect(filterRemindersForWidgetView(items, "today", now).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterRemindersForWidgetView(items, "upcoming", now).map((r) => r.id)).toEqual([
      "1",
      "2",
    ]);
    expect(filterRemindersForWidgetView(items, "sent", now).map((r) => r.id)).toEqual(["4"]);
    expect(filterRemindersForWidgetView(items, "overdue", now).map((r) => r.id)).toEqual([
      "3",
      "4",
    ]);
  });

  it("summarizes counts", () => {
    const summary = summarizeReminders(items, now);
    expect(summary.today).toBe(2);
    expect(summary.upcoming).toBe(2);
    expect(summary.overdue).toBe(2);
    expect(summary.sent).toBe(1);
  });
});
