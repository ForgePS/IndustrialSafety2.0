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

export type AssignmentOptions = {
  divisions: string[];
  supervisors: SupervisorMode[];
};

export const EMPTY_ASSIGNMENT_OPTIONS: AssignmentOptions = {
  divisions: [],
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
    supervisors: [...counts.values()],
  };
}

export type DepartmentOption = { id: string; label: string; siteId?: string | null };

/** Departments for the selected location; unscoped departments stay available. */
export function filterDepartmentsForSite(
  departments: readonly DepartmentOption[],
  siteId: string | undefined,
): DepartmentOption[] {
  if (!siteId) return [...departments];
  return departments.filter((d) => !d.siteId || d.siteId === siteId);
}
