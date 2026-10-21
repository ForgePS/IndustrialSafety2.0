/**
 * Loads the org catalogs that back the Add Person selects.
 *
 * Sites are exposed on the flat industrial API, but departments and positions
 * only exist on the tenant-scoped controller, so those two need the caller's
 * tenant id. A missing tenant id is treated as "no options" rather than an
 * error: the page still works with free-text assignment fields.
 */
import type { PersonnelLookupSource } from "./personnel-form";
import type { AssignmentOptions, DivisionOption } from "./personnel-assignment";
import { EMPTY_ASSIGNMENT_OPTIONS } from "./personnel-assignment";
import { loadIndustrialSiteCatalog } from "./industrial-facility";

export type LookupOption = {
  id: string;
  label: string;
  siteId?: string | null;
  divisionName?: string | null;
  contactPersonnelId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

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
    const payload =
      r.sourcePayload && typeof r.sourcePayload === "object" && !Array.isArray(r.sourcePayload)
        ? (r.sourcePayload as Record<string, unknown>)
        : r.source_payload &&
            typeof r.source_payload === "object" &&
            !Array.isArray(r.source_payload)
          ? (r.source_payload as Record<string, unknown>)
          : null;
    const divisionFromPayload =
      payload && typeof payload.division === "string"
        ? payload.division.trim()
        : payload && typeof payload.divisionName === "string"
          ? payload.divisionName.trim()
          : "";
    const divisionName =
      typeof r.divisionName === "string" && r.divisionName.trim() !== ""
        ? r.divisionName.trim()
        : divisionFromPayload || null;
    const contactName =
      typeof r.contactName === "string" && r.contactName.trim() !== ""
        ? r.contactName.trim()
        : null;
    const contactEmail =
      typeof r.contactEmail === "string" && r.contactEmail.trim() !== ""
        ? r.contactEmail.trim()
        : null;
    const contactPersonnelId =
      typeof r.contactPersonnelId === "string" && r.contactPersonnelId !== ""
        ? r.contactPersonnelId
        : null;
    options.push({
      id,
      label: String(label).trim(),
      siteId,
      divisionName,
      contactPersonnelId,
      contactName,
      contactEmail,
    });
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
    const data = await apiGet<{
      divisions?: string[];
      divisionEntries?: Array<{ name: string; siteId?: string | null }>;
      supervisors?: AssignmentOptions["supervisors"];
    }>("/api/v1/industrial/personnel/assignment-options");
    const divisionEntries = Array.isArray(data?.divisionEntries)
      ? data.divisionEntries.map((entry) => ({
          name: String(entry.name ?? "").trim(),
          siteId:
            typeof entry.siteId === "string" && entry.siteId.trim() !== ""
              ? entry.siteId.trim()
              : null,
        })).filter((entry) => entry.name !== "")
      : Array.isArray(data?.divisions)
        ? data.divisions
            .map((name) => String(name).trim())
            .filter(Boolean)
            .map((name) => ({ name, siteId: null as string | null }))
        : [];
    const divisions = Array.from(new Set(divisionEntries.map((entry) => entry.name))).sort((a, b) =>
      a.localeCompare(b),
    );
    return {
      divisions,
      divisionEntries,
      supervisors: Array.isArray(data?.supervisors) ? data.supervisors : [],
    };
  } catch {
    return EMPTY_ASSIGNMENT_OPTIONS;
  }
}

export type OrgFilterCatalogs = {
  sites: LookupOption[];
  departments: LookupOption[];
  divisions: string[];
  divisionEntries: DivisionOption[];
};

export const EMPTY_ORG_FILTER_CATALOGS: OrgFilterCatalogs = {
  sites: [],
  departments: [],
  divisions: [],
  divisionEntries: [],
};

/**
 * Locations / departments / divisions for filter dropdowns.
 * Always sourced from admin Settings → Dropdown lists catalogs (not roster distincts).
 */
export async function loadOrgFilterCatalogs(
  tenantId?: string | null,
): Promise<OrgFilterCatalogs> {
  const { apiGet } = await import("@forge/web-kit");

  const [sites, departments, assignment] = await Promise.all([
    loadSiteLookups(tenantId),
    (async () => {
      try {
        const data = await apiGet<unknown>("/api/v1/industrial/departments", {
          query: { page: "1", pageSize: "200" },
        });
        return normalizeLookupRows(data);
      } catch {
        return loadCatalogLookups("departments", tenantId);
      }
    })(),
    loadAssignmentOptions(),
  ]);

  return {
    sites,
    departments,
    divisions: assignment.divisions,
    divisionEntries: assignment.divisionEntries,
  };
}

export function resolveLookupLabel(
  lookups: LookupState,
  source: PersonnelLookupSource,
  id: string,
): string | undefined {
  return lookups[source].find((o) => o.id === id)?.label;
}

export type PersonnelOrgLookupKind = "division" | "department" | "position";

export type CreatedOrgLookupRow = { id?: string; name?: string };

/** Creates a division catalog entry or department/position row via the tenant org API. */
export async function createPersonnelOrgLookup(
  tenantId: string,
  kind: PersonnelOrgLookupKind,
  name: string,
  extras?: { siteId?: string; departmentId?: string },
): Promise<CreatedOrgLookupRow> {
  const { apiSend } = await import("@forge/web-kit");
  const body: Record<string, string> = { kind, name };
  if (extras?.siteId) body.siteId = extras.siteId;
  if (extras?.departmentId) body.departmentId = extras.departmentId;
  const data = await apiSend<CreatedOrgLookupRow>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}/industrial/org-lookups/create-missing`,
    "POST",
    body,
  );
  return data ?? {};
}
