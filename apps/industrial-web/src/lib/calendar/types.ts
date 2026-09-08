export type CalendarCategory = {
  id: string;
  name: string;
  color: string;
};

export type CalendarEvent = {
  id: string;
  sourceEventId?: string;
  title: string;
  description?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay?: boolean;
  status?: string;
  taskId?: string | null;
  categoryId?: string | null;
  category?: CalendarCategory | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: string | null;
  recurrenceCount?: number | null;
  isOccurrence?: boolean;
};

export type CalendarWidgetView = "today" | "3-day" | "week" | "month";

export const CALENDAR_WIDGET_VIEWS: readonly CalendarWidgetView[] = [
  "today",
  "3-day",
  "week",
  "month",
] as const;

export function isCalendarWidgetView(value: string | undefined | null): value is CalendarWidgetView {
  return value === "today" || value === "3-day" || value === "week" || value === "month";
}

export function calendarEventHref(event: CalendarEvent): string {
  const id = event.sourceEventId || event.id.split(":")[0] || event.id;
  return `/modules/calendar?eventId=${encodeURIComponent(id)}`;
}

export function calendarCreateHref(date?: Date): string {
  if (!date) return "/modules/calendar?create=1";
  const p = (n: number) => String(n).padStart(2, "0");
  const key = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  return `/modules/calendar?create=1&date=${encodeURIComponent(key)}`;
}
