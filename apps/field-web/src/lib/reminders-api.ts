import { apiGet, apiSend } from "@forge/web-kit";
import type { FieldReminder } from "@/lib/reminders/types";

export const REMINDERS_API = "/api/v1/industrial/reminders";

type ListResponse<T> = { items?: T[] };

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as ListResponse<T>).items)) {
    return (payload as ListResponse<T>).items ?? [];
  }
  return [];
}

export const fieldRemindersApi = {
  list: async (query?: Record<string, string>) => {
    const result = await apiGet<ListResponse<FieldReminder> | FieldReminder[]>(
      REMINDERS_API,
      query ? { query } : undefined,
    );
    return asItems<FieldReminder>(result);
  },

  create: (body: Record<string, unknown>) =>
    apiSend<FieldReminder>(REMINDERS_API, "POST", body),

  update: (id: string, body: Record<string, unknown>) =>
    apiSend<FieldReminder>(`${REMINDERS_API}/${encodeURIComponent(id)}`, "PATCH", body),

  cancel: (id: string) =>
    apiSend<FieldReminder>(`${REMINDERS_API}/${encodeURIComponent(id)}/cancel`, "POST", {}),

  snooze: (id: string, remindAt: Date) =>
    apiSend<FieldReminder>(`${REMINDERS_API}/${encodeURIComponent(id)}`, "PATCH", {
      remindAt: remindAt.toISOString(),
    }),
};
