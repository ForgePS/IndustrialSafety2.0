/**
 * Persisted org context for Forge Safety - Field Version.
 *
 * Display terminology (confirmed Phase 0 recommendation):
 *   Location  → industrial_sites / site_id
 *   Division  → division_name (string on departments)
 *   Department → department_id
 *
 * DB column names are not renamed.
 */

export type FieldOrgSelection = {
  locationId: string;
  locationName: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
};

export const EMPTY_ORG_SELECTION: FieldOrgSelection = {
  locationId: "",
  locationName: "",
  divisionName: "",
  departmentId: "",
  departmentName: "",
};

function storageKey(tenantId: string): string {
  return `forge.field.org.v1:${tenantId}`;
}

export function readOrgSelection(tenantId: string): FieldOrgSelection {
  if (typeof window === "undefined" || !tenantId) return { ...EMPTY_ORG_SELECTION };
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return { ...EMPTY_ORG_SELECTION };
    const parsed = JSON.parse(raw) as Partial<FieldOrgSelection>;
    return {
      locationId: typeof parsed.locationId === "string" ? parsed.locationId : "",
      locationName: typeof parsed.locationName === "string" ? parsed.locationName : "",
      divisionName: typeof parsed.divisionName === "string" ? parsed.divisionName : "",
      departmentId: typeof parsed.departmentId === "string" ? parsed.departmentId : "",
      departmentName: typeof parsed.departmentName === "string" ? parsed.departmentName : "",
    };
  } catch {
    return { ...EMPTY_ORG_SELECTION };
  }
}

export function writeOrgSelection(tenantId: string, selection: FieldOrgSelection): void {
  if (typeof window === "undefined" || !tenantId) return;
  localStorage.setItem(storageKey(tenantId), JSON.stringify(selection));
}
