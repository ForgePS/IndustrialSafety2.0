import {
  addDays,
  endOfDay,
  eventOverlapsDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "./dates";
import type { CalendarEvent, CalendarWidgetView } from "./types";

export function rangeForCalendarWidgetView(
  view: CalendarWidgetView,
  anchor: Date = new Date(),
): { from: Date; to: Date } {
  const day = startOfDay(anchor);
  if (view === "today") {
    return { from: day, to: endOfDay(day) };
  }
  if (view === "3-day") {
    return { from: day, to: endOfDay(addDays(day, 2)) };
  }
  if (view === "week") {
    const start = startOfWeek(day);
    return { from: start, to: endOfDay(addDays(start, 6)) };
  }
  const monthStart = startOfMonth(day);
  const gridStart = startOfWeek(monthStart);
  return { from: gridStart, to: endOfDay(addDays(gridStart, 41)) };
}

export function monthGridDays(anchor: Date = new Date()): Date[] {
  const cells: Date[] = [];
  let cursor = startOfWeek(startOfMonth(anchor));
  for (let i = 0; i < 42; i += 1) {
    cells.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return cells;
}

export function weekDays(anchor: Date = new Date()): Date[] {
  const start = startOfWeek(startOfDay(anchor));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function threeDayDays(anchor: Date = new Date()): Date[] {
  const start = startOfDay(anchor);
  return [start, addDays(start, 1), addDays(start, 2)];
}

export function eventsForDay(events: readonly CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((ev) => eventOverlapsDay(ev.startsAt, ev.endsAt, day))
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}

export function countEventsForDay(events: readonly CalendarEvent[], day: Date): number {
  return events.filter((ev) => eventOverlapsDay(ev.startsAt, ev.endsAt, day)).length;
}

export function groupEventsByDay(
  events: readonly CalendarEvent[],
  days: readonly Date[],
): Array<{ day: Date; events: CalendarEvent[] }> {
  return days.map((day) => ({ day, events: eventsForDay(events, day) }));
}
