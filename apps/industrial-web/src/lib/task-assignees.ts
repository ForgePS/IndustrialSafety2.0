/**
 * Task assignee helpers — Producers Rice Mill restricts the Assign-to list
 * to people in Safety or EHS (department or division), not Food Safety.
 */

export type TaskAssigneePerson = {
  id: string;
  displayName?: string | null;
  employeeNumber?: string | null;
  departmentName?: string | null;
  divisionName?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
};

/** True when a department/division/title label is Safety or EHS (not Food Safety). */
export function isSafetyOrEhsOrgLabel(raw?: string | null): boolean {
  const name = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!name) return false;
  if (name === "safety" || name === "ehs") return true;
  // Food Safety / PRI Food Safety are QC, not EHS.
  if (/\bfood\s+safety\b/.test(name)) return false;
  if (/\behs\b/.test(name)) return true;
  if (/\bsafety\b/.test(name)) return true;
  return false;
}

export function isSafetyOrEhsOrgAssignment(
  person: Pick<TaskAssigneePerson, "departmentName" | "divisionName" | "jobTitle">,
): boolean {
  return (
    isSafetyOrEhsOrgLabel(person.departmentName) ||
    isSafetyOrEhsOrgLabel(person.divisionName) ||
    isSafetyOrEhsOrgLabel(person.jobTitle)
  );
}

/**
 * Safety/EHS roster match: org labels / job title, or a departmentId whose
 * catalog name is Safety/EHS (covers list rows that only store the FK).
 */
export function isSafetyOrEhsStaffPerson(
  person: Pick<
    TaskAssigneePerson,
    "departmentName" | "divisionName" | "jobTitle" | "departmentId"
  >,
  ehsDepartmentIds?: ReadonlySet<string>,
): boolean {
  if (isSafetyOrEhsOrgAssignment(person)) return true;
  const departmentId = String(person.departmentId ?? "").trim();
  return Boolean(departmentId && ehsDepartmentIds?.has(departmentId));
}

/** Department catalog ids whose labels match Safety/EHS. */
export function safetyOrEhsDepartmentIds(
  departments: ReadonlyArray<{ id: string; label: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const dept of departments) {
    const id = String(dept.id ?? "").trim();
    if (!id) continue;
    if (isSafetyOrEhsOrgLabel(dept.label)) ids.add(id);
  }
  return ids;
}

/**
 * For Producers Rice Mill, keep only Safety/EHS assignees. Optionally keep
 * specific ids (e.g. a task's current assignee) so reassign dropdowns stay valid.
 */
export function filterTaskAssigneePersonnel<T extends TaskAssigneePerson>(
  people: readonly T[],
  opts: {
    restrictToSafetyOrEhs: boolean;
    alwaysIncludeIds?: Iterable<string>;
    ehsDepartmentIds?: ReadonlySet<string>;
  },
): T[] {
  if (!opts.restrictToSafetyOrEhs) return [...people];
  const keep = new Set(
    [...(opts.alwaysIncludeIds ?? [])].map((id) => String(id ?? "").trim()).filter(Boolean),
  );
  return people.filter(
    (person) =>
      keep.has(person.id) || isSafetyOrEhsStaffPerson(person, opts.ehsDepartmentIds),
  );
}
