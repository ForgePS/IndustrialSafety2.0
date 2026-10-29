import { describe, expect, it } from "vitest";
import { addDays, startOfDay, startOfWeek } from "./dates";
import {
  countEventsForDay,
  eventsForDay,
  rangeForCalendarWidgetView,
  threeDayDays,
} from "./widget-range";
import type { CalendarEvent } from "./types";

describe("rangeForCalendarWidgetView", () => {
  const anchor = startOfDay(new Date(2026, 8, 8)); // Tue Sep 8 2026

  it("today spans one day", () => {
    const { from, to } = rangeForCalendarWidgetView("today", anchor);
    expect(from.getDate()).toBe(8);
    expect(to.getDate()).toBe(8);
    expect(to.getHours()).toBe(23);
  });

  it("3-day spans today through +2", () => {
    const { from, to } = rangeForCalendarWidgetView("3-day", anchor);
    expect(from.getDate()).toBe(8);
    expect(to.getDate()).toBe(10);
    expect(threeDayDays(anchor)).toHaveLength(3);
  });

  it("week spans Sunday through Saturday", () => {
    const { from, to } = rangeForCalendarWidgetView("week", anchor);
    expect(from.getDay()).toBe(0);
    expect(to.getDay()).toBe(6);
    expect(from.getTime()).toBe(startOfWeek(anchor).getTime());
  });
});

describe("eventsForDay", () => {
  const day = startOfDay(new Date(2026, 8, 8));
  const events: CalendarEvent[] = [
    {
      id: "1",
      title: "Morning",
      startsAt: new Date(2026, 8, 8, 9, 0).toISOString(),
      endsAt: new Date(2026, 8, 8, 10, 0).toISOString(),
    },
    {
      id: "2",
      title: "Tomorrow",
      startsAt: addDays(day, 1).toISOString(),
      endsAt: addDays(day, 1).toISOString(),
    },
  ];

  it("filters and sorts events on a day", () => {
    expect(eventsForDay(events, day).map((e) => e.id)).toEqual(["1"]);
    expect(countEventsForDay(events, day)).toBe(1);
  });
});
