export type SiteCount = { label: string; count: number };

/**
 * Group inspection list rows by site label for the dashboard card.
 * Prefers a human site name from the payload; falls back to siteId lookup.
 */
export function aggregateInspectionsBySite(
  items: unknown[],
  siteNamesById: Map<string, string> = new Map(),
): SiteCount[] {
  const counts = new Map<string, number>();

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const label = siteLabelForInspection(row, siteNamesById);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function siteLabelForInspection(
  row: Record<string, unknown>,
  siteNamesById: Map<string, string>,
): string {
  for (const key of ["siteName", "site", "facilityName", "location", "facility"] as const) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  const siteId = typeof row.siteId === "string" ? row.siteId.trim() : "";
  if (siteId) {
    return siteNamesById.get(siteId) ?? `Site ${siteId.slice(0, 8)}`;
  }
  return "Unassigned site";
}
