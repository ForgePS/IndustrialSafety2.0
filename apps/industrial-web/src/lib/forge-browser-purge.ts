/**
 * Industrial Forge-owned browser purge (RG-09).
 * Clears offline queues/caches, drafts, tenant-scoped UI state, and walkthrough
 * session keys. Preserves device prefs (theme, nav open groups).
 */
import {
  removeStorageKeysByPrefix,
  type ForgeBrowserCleanupReason,
} from "@forge/web-kit";

/** localStorage prefixes that carry tenant/user operational data. */
export const INDUSTRIAL_FORGE_LOCAL_PREFIXES = [
  "forge.ind.offline.v1:",
  "forge.sanitation.draft.",
  "forge.photo-markup.draft.v1:",
  "forge:fleet-custom-reports:",
  "forge.industrial.safety-supplies.custom-reports.",
  "forge-ind-active-facility-id:",
  "forge-ind-active-department-id:",
  "forge-ind-dashboard-layout-v1:",
  "forge-ind-scan-employee:",
] as const;

/** sessionStorage prefixes / exact keys for transient Forge sessions. */
export const INDUSTRIAL_FORGE_SESSION_PREFIXES = [
  "forge.customizeDashboard",
  "forge-training-portal-session:",
  "forge-walkthrough-capture",
  "forge-walkthrough-capture-me",
  "forge-walkthrough-studio-session",
  "forge-ind-scan-employee:",
] as const;

function storageOrNull(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind];
  } catch {
    return null;
  }
}

/**
 * Purge Forge-owned industrial client state.
 * @returns counts removed from local + session storage
 */
export function purgeIndustrialForgeBrowserState(
  _reason: ForgeBrowserCleanupReason = "logout",
): { localRemoved: number; sessionRemoved: number } {
  const localRemoved = removeStorageKeysByPrefix(
    storageOrNull("localStorage"),
    INDUSTRIAL_FORGE_LOCAL_PREFIXES,
  );
  const sessionRemoved = removeStorageKeysByPrefix(
    storageOrNull("sessionStorage"),
    INDUSTRIAL_FORGE_SESSION_PREFIXES,
  );
  return { localRemoved, sessionRemoved };
}
