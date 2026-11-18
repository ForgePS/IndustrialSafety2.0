import { apiGet, apiSend } from "@forge/web-kit";
import type { SafetyRecord } from "@/lib/safety-workflows";

function asItems<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    return ((payload as { items: T[] }).items ?? []) as T[];
  }
  return [];
}

export const safetyWorkflowApi = {
  async list(apiPath: string, query?: Record<string, string>): Promise<SafetyRecord[]> {
    const result = await apiGet<{ items?: SafetyRecord[] } | SafetyRecord[]>(apiPath, {
      query: { page: "1", pageSize: "100", ...query },
    });
    return asItems<SafetyRecord>(result);
  },

  get: (apiPath: string, id: string) =>
    apiGet<SafetyRecord>(`${apiPath}/${encodeURIComponent(id)}`),

  action: (apiPath: string, id: string, action: string, body: Record<string, unknown> = {}) =>
    apiSend<SafetyRecord>(
      `${apiPath}/${encodeURIComponent(id)}/${encodeURIComponent(action)}`,
      "POST",
      body,
    ),
};
