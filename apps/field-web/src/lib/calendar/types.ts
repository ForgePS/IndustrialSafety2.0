export type FieldCalendarCategory = {
  id: string;
  name: string;
  color: string;
};

export type FieldCalendarEvent = {
  id: string;
  sourceEventId?: string;
  title: string;
  description?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay?: boolean;
  status?: string;
  siteId?: string | null;
  taskId?: string | null;
  categoryId?: string | null;
  category?: FieldCalendarCategory | null;
  isOccurrence?: boolean;
};

/** Mobile calendar views — Agenda is the Field default. */
export type FieldCalendarView = "agenda" | "3-day" | "week" | "month";

export const FIELD_CALENDAR_VIEWS: readonly FieldCalendarView[] = [
  "agenda",
  "3-day",
  "week",
  "month",
] as const;

export function isFieldCalendarView(value: string | undefined | null): value is FieldCalendarView {
  return value === "agenda" || value === "3-day" || value === "week" || value === "month";
}

export function calendarEventHref(event: FieldCalendarEvent): string {
  const id = event.sourceEventId || event.id.split(":")[0] || event.id;
  return `/calendar/?eventId=${encodeURIComponent(id)}`;
}

export function eventDisplayWhen(event: FieldCalendarEvent): string {
  if (event.allDay) return "All day";
  const start = event.startsAt
    ? new Date(event.startsAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const end = event.endsAt
    ? new Date(event.endsAt).toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  if (start && end) return `${start} – ${end}`;
  return start || "—";
}
