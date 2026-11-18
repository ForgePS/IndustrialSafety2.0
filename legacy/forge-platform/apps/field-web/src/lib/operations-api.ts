import { apiGet, apiSend } from "@forge/web-kit";
import type {
  EquipmentListItem,
  FleetVehicleItem,
  ForkliftRecord,
  SupplyItem,
  SupplyLocation,
} from "@/lib/operations";

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

export const operationsApi = {
  listEquipment: async (query?: Record<string, string>) => {
    const result = await apiGet<{ items?: EquipmentListItem[] } | EquipmentListItem[]>(
      "/api/v1/industrial/equipment",
      { query: { page: "1", pageSize: "100", ...query } },
    );
    return asItems<EquipmentListItem>(result);
  },

  getEquipment: (id: string) =>
    apiGet<EquipmentListItem>(`/api/v1/industrial/equipment/${encodeURIComponent(id)}`),

  listFleetVehicles: async (query?: Record<string, string>) => {
    const result = await apiGet<{ items?: FleetVehicleItem[] } | FleetVehicleItem[]>(
      "/api/v1/industrial/fleet/vehicles",
      { query: { page: "1", pageSize: "100", ...query } },
    );
    return asItems<FleetVehicleItem>(result);
  },

  getFleetVehicle: (id: string) =>
    apiGet<FleetVehicleItem>(`/api/v1/industrial/fleet/vehicles/${encodeURIComponent(id)}`),

  listVehicleDvirs: async (vehicleId: string, query?: Record<string, string>) => {
    const result = await apiGet<{ items?: Array<Record<string, unknown>> }>(
      `/api/v1/industrial/fleet/vehicles/${encodeURIComponent(vehicleId)}/dvirs`,
      { query: { page: "1", pageSize: "20", ...query } },
    );
    return asItems<Record<string, unknown>>(result);
  },

  listForklifts: async (query?: Record<string, string>) => {
    const result = await apiGet<{ items?: ForkliftRecord[] } | ForkliftRecord[]>(
      "/api/v1/industrial/forklifts",
      { query: { page: "1", pageSize: "100", ...query } },
    );
    return asItems<ForkliftRecord>(result);
  },

  getForklift: (id: string) =>
    apiGet<ForkliftRecord>(`/api/v1/industrial/forklifts/${encodeURIComponent(id)}`),

  submitDvir: (body: Record<string, unknown>) =>
    apiSend<Record<string, unknown>>("/api/v1/industrial/dot", "POST", body),

  createFleetInspection: (body: Record<string, unknown>) =>
    apiSend<Record<string, unknown>>("/api/v1/industrial/fleet/inspections", "POST", body),

  listSupplyItems: async (query?: Record<string, string>) => {
    const result = await apiGet<{ items?: SupplyItem[] } | SupplyItem[]>(
      "/api/v1/industrial/supplies/items",
      { query: { page: "1", pageSize: "100", ...query } },
    );
    return asItems<SupplyItem>(result);
  },

  listSupplyLocations: async (query?: Record<string, string>) => {
    const result = await apiGet<{ items?: SupplyLocation[] } | SupplyLocation[]>(
      "/api/v1/industrial/supplies/locations",
      { query: { page: "1", pageSize: "100", ...query } },
    );
    return asItems<SupplyLocation>(result);
  },

  issueSupply: (body: Record<string, unknown>) =>
    apiSend<Record<string, unknown>>("/api/v1/industrial/supplies/issue", "POST", body),

  createSupplyRequest: (body: Record<string, unknown>) =>
    apiSend<Record<string, unknown>>("/api/v1/industrial/supplies/requests", "POST", body),
};
