/** Company-wide view in the header Facility selector. */
export const ALL_FACILITIES_ID = "all";

export type IndustrialFacilityOption = {
  id: string;
  name: string;
};

export function facilityStorageKey(tenantId: string): string {
  return `forge-ind-active-facility-id:${tenantId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const obj = asRecord(payload);
  if (!obj) return [];
  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;
  return [];
}

/** Normalize sites or facilities catalog rows into selector options. */
export function normalizeFacilityOptions(payload: unknown): IndustrialFacilityOption[] {
  const options: IndustrialFacilityOption[] = [];
  const seen = new Set<string>();
  for (const row of rowsFromPayload(payload)) {
    const rec = asRecord(row);
    if (!rec) continue;
    if (rec.archivedAt) continue;
    if (typeof rec.status === "string" && rec.status !== "" && rec.status.toUpperCase() !== "ACTIVE") {
      continue;
    }
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const name = [rec.name, rec.displayName, rec.facilityKey, rec.siteKey, rec.title].find(
      (value) => typeof value === "string" && value.trim() !== "",
    );
    seen.add(id);
    options.push({ id, name: String(name ?? id).trim() });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export function pickActiveFacilityId(
  options: IndustrialFacilityOption[],
  stored: string | null | undefined,
): string {
  if (stored === ALL_FACILITIES_ID && options.length > 1) return ALL_FACILITIES_ID;
  if (stored && options.some((option) => option.id === stored)) return stored;
  if (options.length === 1) return options[0]!.id;
  return ALL_FACILITIES_ID;
}

/** Query extras for industrial list/dashboard endpoints. */
export function facilityListQuery(
  facilityId: string | null | undefined,
): Record<string, string | undefined> {
  if (!facilityId || facilityId === ALL_FACILITIES_ID) return {};
  return { siteId: facilityId, facilityId };
}

export function matchesFacilitySelection(
  row: { siteId?: string | null; siteLabel?: string | null },
  facilityId: string | null | undefined,
  options: IndustrialFacilityOption[],
): boolean {
  if (!facilityId || facilityId === ALL_FACILITIES_ID) return true;
  if (row.siteId && row.siteId === facilityId) return true;
  const name = options.find((option) => option.id === facilityId)?.name.trim().toLowerCase();
  if (!name) return false;
  const label = String(row.siteLabel ?? "").trim().toLowerCase();
  return label === name || (label !== "" && label.includes(name));
}

/** Match a roster location label (e.g. GREENVILLE) to a facility/site catalog row. */
export function matchSiteIdByLabel(
  options: readonly { id: string; name?: string; label?: string }[],
  label: string | undefined,
): string | undefined {
  const needle = String(label ?? "").trim().toLowerCase();
  if (!needle) return undefined;

  const names = options.map((option) => ({
    id: option.id,
    name: String(option.name ?? option.label ?? option.id).trim(),
  }));

  const exact = names.find((option) => option.name.toLowerCase() === needle);
  if (exact) return exact.id;

  return names.find((option) => {
    const hay = option.name.toLowerCase();
    return hay.includes(needle) || needle.includes(hay);
  })?.id;
}

/**
 * Location catalog for Industrial: tenant industrial sites, then flat sites,
 * then SaaS facilities. Facilities and sites share the same selector shape.
 */
export async function loadIndustrialSiteCatalog(
  tenantId: string | null | undefined,
): Promise<IndustrialFacilityOption[]> {
  if (tenantId) {
    try {
      const { apiGet } = await import("@forge/web-kit");
      const rows = await apiGet<unknown>(
        `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial/sites`,
      );
      const fromTenantSites = normalizeFacilityOptions(rows);
      if (fromTenantSites.length > 0) return fromTenantSites;
    } catch {
      // Fall through to the paginated industrial sites list.
    }
  }

  try {
    const { apiGet } = await import("@forge/web-kit");
    const rows = await apiGet<unknown>("/api/v1/industrial/sites", {
      query: { page: "1", pageSize: "200" },
    });
    const fromSites = normalizeFacilityOptions(rows);
    if (fromSites.length > 0) return fromSites;
  } catch {
    // Fall through to the SaaS facilities catalog.
  }

  if (!tenantId) return [];

  try {
    const { apiGet } = await import("@forge/web-kit");
    const rows = await apiGet<unknown>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/facilities`);
    return normalizeFacilityOptions(rows);
  } catch {
    return [];
  }
}
