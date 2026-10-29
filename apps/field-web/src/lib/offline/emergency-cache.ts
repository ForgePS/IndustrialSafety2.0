/**
 * Emergency read-cache helpers (Phase 10).
 */
import { getOfflineCache } from "@/lib/offline";
import type { EmergencyRecord, FieldEmergencyAlert } from "@/lib/emergency";

const RESPONSE_DOMAIN = "industrial.emergency_response";
const SETTINGS_DOMAIN = "industrial.emergency_alerts.settings";
const ALERTS_DOMAIN = "industrial.emergency_alerts";

export type CachedEmergencyBundle = {
  plantNumber: string;
  proceduresByCategory: Record<string, EmergencyRecord[]>;
  alerts: FieldEmergencyAlert[];
  cachedAt: string;
};

export function cacheEmergencyProcedures(
  category: string,
  locationId: string,
  rows: EmergencyRecord[],
): boolean {
  const cache = getOfflineCache();
  if (!cache) return false;
  const key = `${category}:${locationId || "all"}`;
  return cache.set(RESPONSE_DOMAIN, key, rows);
}

export function readCachedEmergencyProcedures(
  category: string,
  locationId: string,
): EmergencyRecord[] | null {
  const cache = getOfflineCache();
  if (!cache) return null;
  const key = `${category}:${locationId || "all"}`;
  return cache.get<EmergencyRecord[]>(RESPONSE_DOMAIN, key);
}

export function cachePlantEmergencyNumber(number: string): boolean {
  const cache = getOfflineCache();
  if (!cache) return false;
  return cache.set(SETTINGS_DOMAIN, "plantNumber", { number });
}

export function readCachedPlantEmergencyNumber(): string {
  const cache = getOfflineCache();
  if (!cache) return "";
  const row = cache.get<{ number?: string }>(SETTINGS_DOMAIN, "plantNumber");
  return String(row?.number ?? "").trim();
}

export function cacheActiveEmergencyAlerts(alerts: FieldEmergencyAlert[]): boolean {
  const cache = getOfflineCache();
  if (!cache) return false;
  return cache.set(ALERTS_DOMAIN, "active", alerts);
}

export function readCachedActiveEmergencyAlerts(): FieldEmergencyAlert[] | null {
  const cache = getOfflineCache();
  if (!cache) return null;
  return cache.get<FieldEmergencyAlert[]>(ALERTS_DOMAIN, "active");
}

export function emergencyCacheAgeLabel(category: string, locationId: string): string | null {
  const cache = getOfflineCache();
  if (!cache) return null;
  const meta = cache.peekMeta(RESPONSE_DOMAIN, `${category}:${locationId || "all"}`);
  if (!meta) return null;
  const ageMin = Math.max(0, Math.round((Date.now() - meta.storedAt) / 60_000));
  if (ageMin < 1) return "Cached just now";
  if (ageMin < 60) return `Cached ${ageMin} min ago`;
  const hours = Math.round(ageMin / 60);
  return `Cached ${hours}h ago`;
}
