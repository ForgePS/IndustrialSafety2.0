/**
 * Field Forge-owned browser purge (RG-09).
 * Clears offline prefix keys, drafts, Dexie DB, shell caches, and Field SW.
 * Preserves theme preference.
 */
import {
  deleteCacheNamesByPrefix,
  deleteIndexedDatabases,
  removeStorageKeysByPrefix,
  unregisterServiceWorkersByScriptMatch,
  type ForgeBrowserCleanupReason,
} from "@forge/web-kit";
import { clearAllOfflineData } from "./offline/cache";
import { getOfflineStoreSync } from "./offline/dexie-store";

export const FIELD_FORGE_LOCAL_PREFIXES = [
  "forge.field.offline.v1:",
  "forge.field.sanitation.draft.",
  "forge.field.sanitation.queue",
  "forge.field.report.draft.v1:",
  "forge.field.form.draft.v1:",
  "forge.field.inspection.draft.v1:",
  "forge.field.recent.v1",
  "forge.field.org.v1:",
  "forge.field.dashboard.v1",
  "forge.field.offline.dexie.migrated.v1",
] as const;

export const FIELD_FORGE_SESSION_PREFIXES = [
  "forge.field.loto.checklist.",
  "forge.field.scan-employee:",
  "forge.field.force-tenant-pick",
] as const;

export const FIELD_INDEXED_DB_NAMES = ["forge-field-offline"] as const;
export const FIELD_CACHE_NAME_PREFIXES = ["forge-field-shell"] as const;
export const FIELD_SW_SCRIPT_MARKERS = ["/sw.js"] as const;

function storageOrNull(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

export async function purgeFieldForgeBrowserState(
  reason: ForgeBrowserCleanupReason = "logout",
): Promise<{
  offlineKeys: number;
  localRemoved: number;
  sessionRemoved: number;
  indexedDbDeleted: number;
  cachesDeleted: number;
  swUnregistered: number;
}> {
  let offlineKeys = 0;
  try {
    offlineKeys = clearAllOfflineData(getOfflineStoreSync());
  } catch {
    offlineKeys = 0;
  }

  const localRemoved = removeStorageKeysByPrefix(
    storageOrNull("localStorage"),
    FIELD_FORGE_LOCAL_PREFIXES,
  );
  const sessionRemoved = removeStorageKeysByPrefix(
    storageOrNull("sessionStorage"),
    FIELD_FORGE_SESSION_PREFIXES,
  );

  // Always drop IndexedDB + Forge caches so tenant-switch cannot retain queues.
  const indexedDbDeleted = await deleteIndexedDatabases(FIELD_INDEXED_DB_NAMES);
  const cachesDeleted = await deleteCacheNamesByPrefix(FIELD_CACHE_NAME_PREFIXES);

  // Unregister SW on logout only — tenant switch should not force a full PWA reinstall mid-session.
  const swUnregistered =
    reason === "logout"
      ? await unregisterServiceWorkersByScriptMatch(FIELD_SW_SCRIPT_MARKERS)
      : 0;

  return {
    offlineKeys,
    localRemoved,
    sessionRemoved,
    indexedDbDeleted,
    cachesDeleted,
    swUnregistered,
  };
}
