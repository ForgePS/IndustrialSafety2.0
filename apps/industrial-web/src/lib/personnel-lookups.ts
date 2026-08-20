/**
 * Loads the org catalogs that back the Add Person selects.
 *
 * Sites are exposed on the flat industrial API, but departments and positions
 * only exist on the tenant-scoped controller, so those two need the caller's
 * tenant id. A missing tenant id is treated as "no options" rather than an
 * error: the page still works with free-text assignment fields.
 */
import type { PersonnelLookupSource } from "./personnel-form";
import type { AssignmentOptions } from "./personnel-assignment";
import { EMPTY_ASSIGNMENT_OPTIONS } from "./personnel-assignment";
import { loadIndustrialSiteCatalog } from "./industrial-facility";

export type LookupOption = { id: string; label: string; siteId?: string | null };

export type LookupState = Record<PersonnelLookupSource, LookupOption[]>;

export const EMPTY_LOOKUPS: LookupState = { sites: [], departments: [], positions: [] };

export function lookupPath(source: PersonnelLookupSource, tenantId?: string | null): string | null {
  if (source === "sites") return "/api/v1/industrial/sites";
  if (!tenantId) return null;
  const base = `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial`;
  return source === "departments" ? `${base}/departments` : `${base}/positions`;
}

/**
 * Accepts either a paginated `{ items }` envelope or a bare array, and reads the
 * label from whichever name-ish column the endpoint happens to return. Rows
 * without an id are dropped; archived and inactive rows are filtered out so the
 * form cannot assign somebody to a retired department.
 */
export function normalizeLookupRows(payload: unknown): LookupOption[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { items?: unknown })?.items)
      ? ((payload as { items: unknown[] }).items as unknown[])
      : [];

  const options: LookupOption[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const id = r.id;
    if (typeof id !== "string" || id === "") continue;
    if (r.archivedAt) continue;
    if (typeof r.status === "string" && r.status !== "" && r.status !== "ACTIVE") continue;

    const label =
      [r.name, r.title, r.displayName, r.facilityKey, r.siteKey].find(
        (v) => typeof v === "string" && v.trim() !== "",
      ) ?? id;
    const siteId = typeof r.siteId === "string" && r.siteId !== "" ? r.siteId : null;
    options.push({ id, label: String(label).trim(), siteId });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

async function loadCatalogLookups(
  source: Exclude<PersonnelLookupSource, "sites">,
  tenantId: string | null | undefined,
): Promise<LookupOption[]> {
  const path = lookupPath(source, tenantId);
  if (!path) return [];
  try {
    // Imported lazily so the pure helpers above stay unit-testable without
    // resolving the browser API client.
    const { apiGet } = await import("@forge/web-kit");
    const data = await apiGet<unknown>(path, { query: { page: "1", pageSize: "200" } });
    return normalizeLookupRows(data);
  } catch {
    // A catalog the tenant cannot read should degrade to free text, not break
    // the whole form.
    return [];
  }
}

async function loadSiteLookups(tenantId: string | null | undefined): Promise<LookupOption[]> {
  const options = await loadIndustrialSiteCatalog(tenantId);
  return options.map((option) => ({ id: option.id, label: option.name, siteId: null }));
}

export async function loadPersonnelLookups(
  tenantId: string | null | undefined,
): Promise<LookupState> {
  const [sites, departments, positions] = await Promise.all([
    loadSiteLookups(tenantId),
    loadCatalogLookups("departments", tenantId),
    loadCatalogLookups("positions", tenantId),
  ]);
  return { sites, departments, positions };
}

export async function loadAssignmentOptions(): Promise<AssignmentOptions> {
  try {
    const { apiGet } = await import("@forge/web-kit");
    const data = await apiGet<AssignmentOptions>("/api/v1/industrial/personnel/assignment-options");
    return {
      divisions: Array.isArray(data?.divisions) ? data.divisions : [],
      supervisors: Array.isArray(data?.supervisors) ? data.supervisors : [],
    };
  } catch {
    return EMPTY_ASSIGNMENT_OPTIONS;
  }
}

export function resolveLookupLabel(
  lookups: LookupState,
  source: PersonnelLookupSource,
  id: string,
): string | undefined {
  return lookups[source].find((o) => o.id === id)?.label;
}
