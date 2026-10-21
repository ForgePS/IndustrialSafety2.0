import type { TrainingAssignment, TrainingTeamSummary } from "@/features/training/types";
import type { RosterPerson } from "@/lib/personnel-directory";
import { matchesRosterQuery, rosterLocationLabel } from "@/lib/personnel-directory";

export const UNASSIGNED_KEY = "__unassigned__";

export type AssignmentRosterRow = TrainingTeamSummary["roster"][number];

export type AssignmentRosterFilters = {
  year: string;
  month: string;
  sourceId: string;
  siteId: string;
  divisionName: string;
  departmentName: string;
  groupId: string;
  personnelId: string;
  status: string;
  query: string;
};

export type PersonnelAssignmentMeta = {
  personnelId: string;
  employeeNumber: string;
  displayName: string;
  siteId: string;
  siteLabel: string;
  divisionName: string;
  departmentName: string;
};

export type EnrichedAssignmentPerson = {
  assigneeId: string;
  assignmentId: string;
  assignmentTitle: string;
  personnelId?: string | null;
  employeeNumber?: string | null;
  userLabel: string;
  status: string;
  bestPercent?: number | null;
  assignedAt: string;
  dueAt?: string | null;
  completedAt?: string | null;
  siteId?: string | null;
  siteName?: string | null;
  divisionName?: string | null;
  departmentName?: string | null;
  groupIds?: string[];
  groupNames?: string[];
};

export type AssignmentFilterOptions = {
  years: number[];
  courses: Array<{ sourceId: string; sourceTitle: string }>;
  locations: Array<{ siteId: string; siteName: string }>;
  divisions: Array<{ key: string; label: string }>;
  departments: Array<{ key: string; label: string }>;
  groups: Array<{ groupId: string; groupName: string }>;
  employees: Array<{ personnelId: string; label: string }>;
  statuses: Array<{ value: string; label: string }>;
};

function assignmentYear(dateIso?: string | null): number | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

function assignmentMonthKey(dateIso?: string | null): string | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultAssignmentFilters(): AssignmentRosterFilters {
  return {
    year: String(new Date().getFullYear()),
    month: "",
    sourceId: "",
    siteId: "",
    divisionName: "",
    departmentName: "",
    groupId: "",
    personnelId: "",
    status: "",
    query: "",
  };
}

export function buildPersonnelMetaMap(people: readonly RosterPerson[]): Map<string, PersonnelAssignmentMeta> {
  const map = new Map<string, PersonnelAssignmentMeta>();
  for (const person of people) {
    const meta: PersonnelAssignmentMeta = {
      personnelId: person.id,
      employeeNumber: person.employeeNumber,
      displayName: person.displayName,
      siteId: person.siteId,
      siteLabel: person.siteLabel,
      divisionName: person.divisionName,
      departmentName: person.departmentName,
    };
    map.set(person.id, meta);
    if (person.employeeNumber.trim()) {
      map.set(`emp:${person.employeeNumber.trim()}`, meta);
    }
  }
  return map;
}

export function resolvePersonnelMeta(
  row: AssignmentRosterRow,
  metaMap: Map<string, PersonnelAssignmentMeta>,
): PersonnelAssignmentMeta | null {
  const personnelId = row.personnelId?.trim();
  if (personnelId && metaMap.has(personnelId)) return metaMap.get(personnelId)!;
  const employeeNumber = row.employeeNumber?.trim();
  if (employeeNumber && metaMap.has(`emp:${employeeNumber}`)) {
    return metaMap.get(`emp:${employeeNumber}`)!;
  }
  return null;
}

function locationKey(row: AssignmentRosterRow, meta: PersonnelAssignmentMeta | null): string {
  return row.siteId?.trim() || meta?.siteId.trim() || UNASSIGNED_KEY;
}

function locationLabel(row: AssignmentRosterRow, meta: PersonnelAssignmentMeta | null): string {
  const fromRow = row.siteName?.trim();
  if (fromRow) return fromRow;
  if (meta) {
    return rosterLocationLabel({
      id: meta.personnelId,
      displayName: meta.displayName,
      firstName: "",
      lastName: "",
      jobTitle: "",
      departmentName: meta.departmentName,
      divisionName: meta.divisionName,
      departmentId: "",
      employeeNumber: meta.employeeNumber,
      email: "",
      siteId: meta.siteId,
      siteLabel: meta.siteLabel,
      status: "ACTIVE",
      isCompanyDriver: false,
      isDotDriver: false,
      hasPpeExpiryAlert: false,
    });
  }
  return "Unassigned";
}

function orgKey(value?: string | null): string {
  const normalized = value?.trim();
  return normalized || UNASSIGNED_KEY;
}

function orgLabel(value?: string | null, fallback = "Unassigned"): string {
  return value?.trim() || fallback;
}

function matchesTextQuery(text: string, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return text.toLowerCase().includes(normalized);
}

function rosterPersonFromMeta(meta: PersonnelAssignmentMeta): RosterPerson {
  return {
    id: meta.personnelId,
    displayName: meta.displayName,
    firstName: "",
    lastName: "",
    jobTitle: "",
    departmentName: meta.departmentName,
    divisionName: meta.divisionName,
    departmentId: "",
    employeeNumber: meta.employeeNumber,
    email: "",
    siteId: meta.siteId,
    siteLabel: meta.siteLabel,
    status: "ACTIVE",
    isCompanyDriver: false,
    isDotDriver: false,
    hasPpeExpiryAlert: false,
  };
}

export function enrichPersonnelAssignmentRow(
  row: AssignmentRosterRow,
  assignmentCreatedAt: string,
  metaMap: Map<string, PersonnelAssignmentMeta>,
): EnrichedAssignmentPerson {
  const meta = resolvePersonnelMeta(row, metaMap);
  return {
    assigneeId: row.assigneeId,
    assignmentId: row.assignmentId,
    assignmentTitle: row.assignmentTitle,
    personnelId: row.personnelId ?? meta?.personnelId ?? null,
    employeeNumber: row.employeeNumber ?? meta?.employeeNumber ?? null,
    userLabel: row.userLabel,
    status: row.status,
    bestPercent: row.bestPercent ?? null,
    assignedAt: assignmentCreatedAt,
    dueAt: row.dueAt ?? null,
    completedAt: row.completedAt ?? null,
    siteId: locationKey(row, meta),
    siteName: locationLabel(row, meta),
    divisionName: meta?.divisionName.trim() || null,
    departmentName: meta?.departmentName.trim() || null,
    groupIds: row.groupIds ?? [],
    groupNames: row.groupNames ?? [],
  };
}

export function filterAssignmentPersonnelRow(
  row: AssignmentRosterRow,
  filters: AssignmentRosterFilters,
  metaMap: Map<string, PersonnelAssignmentMeta>,
): boolean {
  const meta = resolvePersonnelMeta(row, metaMap);

  if (filters.siteId && locationKey(row, meta) !== filters.siteId) return false;
  if (filters.divisionName && orgKey(meta?.divisionName) !== filters.divisionName) return false;
  if (filters.departmentName && orgKey(meta?.departmentName) !== filters.departmentName) return false;
  if (filters.groupId && !(row.groupIds ?? []).includes(filters.groupId)) return false;
  if (filters.personnelId && row.personnelId !== filters.personnelId) return false;
  if (filters.status && row.status.toUpperCase() !== filters.status.toUpperCase()) return false;

  const query = filters.query.trim();
  if (query) {
    const assignmentHaystack = `${row.assignmentTitle} ${row.sourceTitle ?? ""}`;
    if (matchesTextQuery(assignmentHaystack, query)) return true;
    if (matchesTextQuery(`${row.userLabel} ${row.employeeNumber ?? ""}`, query)) return true;
    if (meta && matchesRosterQuery(rosterPersonFromMeta(meta), query, row.siteName ?? undefined)) {
      return true;
    }
    return false;
  }

  return true;
}

export function filterAssignmentRecord(
  assignment: TrainingAssignment,
  filters: AssignmentRosterFilters,
): boolean {
  const year = filters.year.trim() ? Number(filters.year) : null;
  const month = filters.month.trim() ? Number(filters.month) : null;
  const createdYear = assignmentYear(assignment.createdAt);
  const createdMonthKey = assignmentMonthKey(assignment.createdAt);

  if (year != null && Number.isFinite(year) && createdYear !== year) return false;
  if (month != null && Number.isFinite(month)) {
    const expected = `${year ?? createdYear}-${String(month).padStart(2, "0")}`;
    if (createdMonthKey !== expected) return false;
  }
  if (filters.sourceId && assignment.sourceId !== filters.sourceId) return false;
  return true;
}

export function assignmentMatchesQueryOnly(
  assignment: TrainingAssignment,
  filters: AssignmentRosterFilters,
): boolean {
  const query = filters.query.trim();
  if (!query) return false;
  return matchesTextQuery(`${assignment.title} ${assignment.sourceTitle}`, query);
}

export function filterAssignmentRosterForOptions(
  roster: AssignmentRosterRow[],
  filters: AssignmentRosterFilters,
  metaMap: Map<string, PersonnelAssignmentMeta>,
): AssignmentRosterRow[] {
  return roster.filter((row) => filterAssignmentPersonnelRow(row, filters, metaMap));
}

export function buildAssignmentFilterOptions(input: {
  assignments: TrainingAssignment[];
  roster: AssignmentRosterRow[];
  groups: Array<{ id: string; name: string }>;
  metaMap: Map<string, PersonnelAssignmentMeta>;
}): AssignmentFilterOptions {
  const { assignments, roster, groups, metaMap } = input;
  const years = new Set<number>();
  const courses = new Map<string, string>();
  const locations = new Map<string, string>();
  const divisions = new Map<string, string>();
  const departments = new Map<string, string>();
  const employees = new Map<string, string>();
  const statuses = new Map<string, string>();

  for (const assignment of assignments) {
    const year = assignmentYear(assignment.createdAt);
    if (year) years.add(year);
    courses.set(assignment.sourceId, assignment.sourceTitle.trim() || "Training");
  }

  for (const row of roster) {
    const meta = resolvePersonnelMeta(row, metaMap);
    locations.set(locationKey(row, meta), locationLabel(row, meta));
    divisions.set(orgKey(meta?.divisionName), orgLabel(meta?.divisionName, "No division"));
    departments.set(orgKey(meta?.departmentName), orgLabel(meta?.departmentName, "No department"));
    statuses.set(row.status.toUpperCase(), row.status.replace(/_/g, " "));
    if (row.personnelId) {
      const label = row.employeeNumber
        ? `#${row.employeeNumber} · ${row.userLabel}`
        : row.userLabel;
      employees.set(row.personnelId, label);
    }
  }

  years.add(new Date().getFullYear());

  return {
    years: [...years].sort((a, b) => b - a),
    courses: [...courses.entries()]
      .map(([sourceId, sourceTitle]) => ({ sourceId, sourceTitle }))
      .sort((a, b) => a.sourceTitle.localeCompare(b.sourceTitle)),
    locations: [...locations.entries()]
      .map(([siteId, siteName]) => ({ siteId, siteName }))
      .sort((a, b) => a.siteName.localeCompare(b.siteName)),
    divisions: [...divisions.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    departments: [...departments.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    groups: groups
      .map((group) => ({ groupId: group.id, groupName: group.name }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName)),
    employees: [...employees.entries()]
      .map(([personnelId, label]) => ({ personnelId, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    statuses: [...statuses.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
