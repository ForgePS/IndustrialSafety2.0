import {
  addDays,
  endOfDay,
  endOfMonth,
  eventOverlapsDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/calendar/dates";
import type { FieldCalendarEvent, FieldCalendarView } from "@/lib/calendar/types";

export function rangeForFieldCalendarView(
  view: FieldCalendarView,
  anchor: Date = new Date(),
): { from: Date; to: Date } {
  const day = startOfDay(anchor);
  if (view === "agenda") {
    return { from: day, to: endOfDay(addDays(day, 13)) };
  }
  if (view === "3-day") {
    return { from: day, to: endOfDay(addDays(day, 2)) };
  }
  if (view === "week") {
    const start = startOfWeek(day);
    return { from: start, to: endOfDay(addDays(start, 6)) };
  }
  return { from: startOfMonth(day), to: endOfMonth(day) };
}

export function daysForFieldCalendarView(view: FieldCalendarView, anchor: Date = new Date()): Date[] {
  const { from, to } = rangeForFieldCalendarView(view, anchor);
  const days: Date[] = [];
  let cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function eventsForDay(
  events: readonly FieldCalendarEvent[],
  day: Date,
): FieldCalendarEvent[] {
  return events
    .filter((ev) => eventOverlapsDay(ev.startsAt, ev.endsAt, day))
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}

export function groupEventsByDay(
  events: readonly FieldCalendarEvent[],
  days: readonly Date[],
): Array<{ day: Date; events: FieldCalendarEvent[] }> {
  return days.map((day) => ({ day, events: eventsForDay(events, day) }));
}

/** Location = site_id. Events with no siteId stay visible for all Locations. */
export function filterEventsForLocation(
  events: readonly FieldCalendarEvent[],
  locationId: string | null | undefined,
): FieldCalendarEvent[] {
  const siteId = String(locationId ?? "").trim();
  if (!siteId) return [...events];
  return events.filter((ev) => {
    const eventSite = String(ev.siteId ?? "").trim();
    if (!eventSite) return true;
    return eventSite === siteId;
  });
}
