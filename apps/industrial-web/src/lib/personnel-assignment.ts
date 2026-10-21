/**
 * Assignment helpers for the Add Person form: division options, department
 * filtering by location, and supervisor auto-fill from Division → Location →
 * Department. Pure so the page and unit tests share one rule.
 */

export type SupervisorMode = {
  divisionName: string;
  siteId: string | null;
  departmentId: string | null;
  supervisorName: string;
  count: number;
};

export type DivisionOption = { name: string; siteId: string | null };

export type AssignmentOptions = {
  /** Distinct division names (legacy / filter chips). */
  divisions: string[];
  /** Site-scoped division catalog entries. */
  divisionEntries: DivisionOption[];
  supervisors: SupervisorMode[];
};

export const EMPTY_ASSIGNMENT_OPTIONS: AssignmentOptions = {
  divisions: [],
  divisionEntries: [],
  supervisors: [],
};

/** Most common supervisor for the exact Division + Location + Department triad. */
export function suggestSupervisor(
  modes: readonly SupervisorMode[],
  divisionName: string,
  siteId: string,
  departmentId: string,
): string | null {
  const division = divisionName.trim().toLowerCase();
  if (!division || !siteId || !departmentId) return null;

  const matches = modes
    .filter(
      (m) =>
        m.supervisorName.trim() !== "" &&
        m.divisionName.trim().toLowerCase() === division &&
        m.siteId === siteId &&
        m.departmentId === departmentId,
    )
    .sort(
      (a, b) =>
        b.count - a.count || a.supervisorName.localeCompare(b.supervisorName),
    );

  return matches[0]?.supervisorName ?? null;
}

/**
 * Aggregate roster-like rows into assignment options. Used by the API; the
 * shape matches what the form expects so a client-side fallback can use the
 * same function against a loaded roster if needed.
 */
export function buildAssignmentOptions(
  rows: ReadonlyArray<{
    divisionName?: string | null;
    siteId?: string | null;
    departmentId?: string | null;
    supervisorName?: string | null;
  }>,
): AssignmentOptions {
  const divisions = new Set<string>();
  const counts = new Map<string, SupervisorMode>();

  for (const row of rows) {
    const divisionName = typeof row.divisionName === "string" ? row.divisionName.trim() : "";
    if (divisionName !== "") divisions.add(divisionName);

    const supervisorName =
      typeof row.supervisorName === "string" ? row.supervisorName.trim() : "";
    if (divisionName === "" || supervisorName === "") continue;

    const siteId = typeof row.siteId === "string" && row.siteId !== "" ? row.siteId : null;
    const departmentId =
      typeof row.departmentId === "string" && row.departmentId !== "" ? row.departmentId : null;
    if (!siteId || !departmentId) continue;

    const key = `${divisionName.toLowerCase()}|${siteId}|${departmentId}|${supervisorName.toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { divisionName, siteId, departmentId, supervisorName, count: 1 });
    }
  }

  return {
    divisions: [...divisions].sort((a, b) => a.localeCompare(b)),
    divisionEntries: [...divisions]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, siteId: null as string | null })),
    supervisors: [...counts.values()],
  };
}

export type DepartmentOption = {
  id: string;
  label: string;
  siteId?: string | null;
  divisionName?: string | null;
  contactPersonnelId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

/** Departments for the selected location (and optional division). */
export function filterDepartmentsForSite(
  departments: readonly DepartmentOption[],
  siteId: string | undefined,
  options?: { includeUnscoped?: boolean; divisionName?: string },
): DepartmentOption[] {
  if (!siteId) return [...departments];
  const includeUnscoped = options?.includeUnscoped !== false;
  const divisionName = options?.divisionName?.trim() ?? "";
  const divisionLower = divisionName.toLowerCase();
  return departments.filter((d) => {
    const siteOk = d.siteId === siteId || (includeUnscoped && !d.siteId);
    if (!siteOk) return false;
    if (!divisionLower) return true;
    const deptDivision = (d.divisionName ?? "").trim().toLowerCase();
    if (deptDivision === divisionLower) return true;
    // Unscoped division link: keep only when includeUnscoped and no division set.
    return includeUnscoped && !deptDivision;
  });
}

/**
 * Departments for Location → Division cascade.
 * Requires both site and division; empty division yields no departments.
 */
export function filterDepartmentsForSiteDivision(
  departments: readonly DepartmentOption[],
  siteId: string | undefined,
  divisionName: string | undefined,
  options?: { includeUnscoped?: boolean },
): DepartmentOption[] {
  const site = siteId?.trim() ?? "";
  const division = divisionName?.trim() ?? "";
  if (!site || !division) return [];
  const includeUnscoped = options?.includeUnscoped === true;
  const divisionLower = division.toLowerCase();
  return departments.filter((d) => {
    const siteOk = d.siteId === site || (includeUnscoped && !d.siteId);
    if (!siteOk) return false;
    const deptDivision = (d.divisionName ?? "").trim().toLowerCase();
    return deptDivision === divisionLower;
  });
}

/** Divisions for the selected location. */
export function filterDivisionsForSite(
  divisions: readonly DivisionOption[],
  siteId: string | undefined,
  options?: { includeUnscoped?: boolean },
): DivisionOption[] {
  if (!siteId) return [...divisions];
  const includeUnscoped = options?.includeUnscoped !== false;
  return divisions.filter(
    (d) => d.siteId === siteId || (includeUnscoped && !d.siteId),
  );
}

/**
 * Build Location → Division options from site-scoped catalog entries and/or
 * department.divisionName values for the selected location.
 *
 * When a location is selected, unscoped catalog rows are never included —
 * only divisions linked to that site (catalog siteId or department.divisionName).
 */
export function divisionsForLocationCascade(
  divisionEntries: readonly DivisionOption[],
  departments: readonly DepartmentOption[],
  siteId: string | undefined,
  _options?: { includeUnscoped?: boolean },
): DivisionOption[] {
  const site = siteId?.trim() ?? "";
  if (!site) {
    return [];
  }

  // Location cascade is always site-strict: ignore includeUnscoped so global
  // (siteId null) division catalog rows do not appear under every location.
  const fromCatalog = filterDivisionsForSite(divisionEntries, site, {
    includeUnscoped: false,
  });
  const byName = new Map<string, DivisionOption>();
  for (const entry of fromCatalog) {
    const key = entry.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, { name: entry.name.trim(), siteId: entry.siteId ?? site });
  }

  for (const dept of departments) {
    if (dept.siteId !== site) continue;
    const name = (dept.divisionName ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, { name, siteId: site });
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether the form should keep the current department selection.
 * An empty catalog means lookups are still loading (or unavailable) — never
 * treat that as "invalid" or the selection is wiped before the user can save.
 * Orphaned FKs (id not in catalog) are kept so imported rows survive edits.
 */
export function shouldRetainDepartmentSelection(
  departmentId: string,
  catalog: readonly DepartmentOption[],
  departmentsForSite: readonly DepartmentOption[],
): boolean {
  if (!departmentId) return true;
  if (catalog.length === 0) return true;
  const inCatalog = catalog.some((d) => d.id === departmentId);
  if (!inCatalog) return true;
  return departmentsForSite.some((d) => d.id === departmentId);
}

/** Whether the form should keep the current division selection for a site. */
export function shouldRetainDivisionSelection(
  divisionName: string,
  catalog: readonly DivisionOption[],
  divisionsForSite: readonly DivisionOption[],
): boolean {
  const name = divisionName.trim();
  if (!name) return true;
  if (catalog.length === 0) return true;
  const lower = name.toLowerCase();
  const inCatalog = catalog.some((d) => d.name.toLowerCase() === lower);
  if (!inCatalog) return true;
  return divisionsForSite.some((d) => d.name.toLowerCase() === lower);
}
