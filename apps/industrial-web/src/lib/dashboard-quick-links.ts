/**
 * Per-user dashboard quick link pins (module codes), stored in localStorage.
 */

export const DASHBOARD_QUICK_LINKS_STORAGE_KEY = "forge-ind-dashboard-quick-links-v1";

export function dashboardQuickLinksStorageKey(tenantId: string, userId: string): string {
  return `${DASHBOARD_QUICK_LINKS_STORAGE_KEY}:${tenantId}:${userId}`;
}

/** Returns pinned module codes in display order, or null when unset. */
export function readDashboardQuickLinkCodes(tenantId: string, userId: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(dashboardQuickLinksStorageKey(tenantId, userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((code): code is string => typeof code === "string" && code.length > 0);
  } catch {
    return null;
  }
}

export function writeDashboardQuickLinkCodes(
  tenantId: string,
  userId: string,
  codes: string[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      dashboardQuickLinksStorageKey(tenantId, userId),
      JSON.stringify(codes),
    );
  } catch {
    // ignore quota / private mode
  }
}

/** Keep stored order; drop codes that are no longer available. */
export function resolveDashboardQuickLinkCodes(
  stored: string[] | null,
  availableCodes: readonly string[],
): string[] {
  const available = new Set(availableCodes);
  if (!stored) {
    return [...availableCodes];
  }
  const pinned = stored.filter((code) => available.has(code));
  return pinned.length > 0 ? pinned : [...availableCodes];
}

export function addDashboardQuickLinkCode(codes: string[], code: string): string[] {
  if (codes.includes(code)) return codes;
  return [...codes, code];
}

export function removeDashboardQuickLinkCode(codes: string[], code: string): string[] {
  return codes.filter((c) => c !== code);
}
