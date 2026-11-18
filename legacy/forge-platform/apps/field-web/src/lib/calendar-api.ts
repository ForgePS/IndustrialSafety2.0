import { apiGet, apiSend } from "@forge/web-kit";
import type { FieldCalendarCategory, FieldCalendarEvent } from "@/lib/calendar/types";

export const CALENDAR_API = "/api/v1/industrial/calendar";

type ListResponse<T> = { items?: T[] };

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as ListResponse<T>).items)) {
    return (payload as ListResponse<T>).items ?? [];
  }
  return [];
}

export type FieldCalendarUpcoming = {
  events: FieldCalendarEvent[];
  reminders: Array<{
    id: string;
    title?: string | null;
    remindAt?: string | null;
    status?: string;
    eventId?: string | null;
    taskId?: string | null;
  }>;
  tasks: Array<{ id: string; title: string; dueDate?: string | null; status?: string }>;
};

export const fieldCalendarApi = {
  listEvents: async (query?: Record<string, string>) => {
    const result = await apiGet<ListResponse<FieldCalendarEvent> | FieldCalendarEvent[]>(
      `${CALENDAR_API}/events`,
      query ? { query } : undefined,
    );
    return asItems<FieldCalendarEvent>(result);
  },

  getEvent: (id: string) =>
    apiGet<FieldCalendarEvent>(`${CALENDAR_API}/events/${encodeURIComponent(id)}`),

  listCategories: async () => {
    const result = await apiGet<ListResponse<FieldCalendarCategory> | FieldCalendarCategory[]>(
      `${CALENDAR_API}/categories`,
    );
    return asItems<FieldCalendarCategory>(result);
  },

  upcoming: (days = 7) =>
    apiGet<FieldCalendarUpcoming>(`${CALENDAR_API}/upcoming`, {
      query: { days: String(days) },
    }),

  createEvent: (body: Record<string, unknown>) =>
    apiSend<FieldCalendarEvent>(`${CALENDAR_API}/events`, "POST", body),

  updateEvent: (id: string, body: Record<string, unknown>) =>
    apiSend<FieldCalendarEvent>(`${CALENDAR_API}/events/${encodeURIComponent(id)}`, "PATCH", body),

  archiveEvent: (id: string) =>
    apiSend<FieldCalendarEvent>(
      `${CALENDAR_API}/events/${encodeURIComponent(id)}/archive`,
      "POST",
      {},
    ),
};
