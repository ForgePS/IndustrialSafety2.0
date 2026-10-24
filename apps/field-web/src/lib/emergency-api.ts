import { apiGet, apiSend } from "@forge/web-kit";
import type {
  EmergencyAlertSettings,
  EmergencyRecord,
  FieldEmergencyAcknowledgment,
  FieldEmergencyAlert,
} from "@/lib/emergency";

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

export type FieldEmergencyAckResult = {
  alert: FieldEmergencyAlert;
  acknowledgment: FieldEmergencyAcknowledgment;
  alreadyAcknowledged?: boolean;
};

export const emergencyApi = {
  listProcedures: async (category: string, query?: Record<string, string>) => {
    const result = await apiGet<{ items?: EmergencyRecord[] } | EmergencyRecord[]>(
      `/api/v1/industrial/emergency-response/${encodeURIComponent(category)}`,
      { query: { page: "1", pageSize: "100", ...query } },
    );
    return asItems<EmergencyRecord>(result);
  },

  listActiveAlerts: async () => {
    const result = await apiGet<{ items?: FieldEmergencyAlert[] } | FieldEmergencyAlert[]>(
      "/api/v1/industrial/emergency-alerts",
      { query: { status: "ACTIVE", limit: "50" } },
    );
    return asItems<FieldEmergencyAlert>(result);
  },

  getAlert: (id: string) =>
    apiGet<FieldEmergencyAlert>(`/api/v1/industrial/emergency-alerts/${encodeURIComponent(id)}`),

  acknowledge: (id: string, body?: { locationId?: string; responseText?: string }) =>
    apiSend<FieldEmergencyAckResult>(
      `/api/v1/industrial/emergency-alerts/${encodeURIComponent(id)}/acknowledge`,
      "POST",
      body ?? {},
    ),

  getSettings: () => apiGet<EmergencyAlertSettings>("/api/v1/industrial/emergency-alerts/settings"),

  dashboard: () =>
    apiGet<{
      activeAlerts?: number;
      acknowledgmentsPending?: number;
      recent?: FieldEmergencyAlert[];
    }>("/api/v1/industrial/emergency-alerts/dashboard"),
};
