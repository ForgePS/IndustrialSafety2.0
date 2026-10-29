export type TeamActivityRow = {
  assigneeId: string;
  assignmentId: string;
  assignmentTitle: string;
  sourceId?: string | null;
  sourceTitle: string;
  siteId?: string | null;
  siteName?: string | null;
  groupIds?: string[];
  groupNames?: string[];
  userId?: string | null;
  personnelId?: string | null;
  employeeNumber?: string | null;
  userLabel: string;
  status: string;
  bestPercent?: number | null;
  dueAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type TeamRosterFilters = {
  year: string;
  month: string;
  sourceId: string;
  siteId: string;
  groupId: string;
  personnelId: string;
};

export type TeamRosterFilterOptions = {
  years: number[];
  courses: Array<{ sourceId: string; sourceTitle: string }>;
  locations: Array<{ siteId: string; siteName: string }>;
  groups: Array<{ groupId: string; groupName: string }>;
  employees: Array<{ personnelId: string; label: string }>;
};

export type CourseActivityGroup = {
  sourceId: string;
  sourceTitle: string;
  rows: TeamActivityRow[];
  latestActivityMs: number;
  completedCount: number;
  inProgressCount: number;
};

function activityTimestamp(row: TeamActivityRow): number {
  for (const value of [row.completedAt, row.updatedAt, row.dueAt]) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function rowActivityDate(row: TeamActivityRow): Date | null {
  for (const value of [row.completedAt, row.updatedAt, row.dueAt]) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function locationKey(row: TeamActivityRow): string {
  return row.siteId?.trim() || "__unassigned__";
}

function locationLabel(row: TeamActivityRow): string {
  return row.siteName?.trim() || "Unassigned";
}

export function filterTeamRoster(
  rows: TeamActivityRow[],
  filters: TeamRosterFilters,
): TeamActivityRow[] {
  const year = filters.year.trim() ? Number(filters.year) : null;
  const month = filters.month.trim() ? Number(filters.month) : null;

  return rows.filter((row) => {
    if (filters.sourceId && (row.sourceId ?? "") !== filters.sourceId) return false;
    if (filters.siteId && locationKey(row) !== filters.siteId) return false;
    if (filters.groupId && !(row.groupIds ?? []).includes(filters.groupId)) return false;
    if (filters.personnelId && row.personnelId !== filters.personnelId) return false;

    const activity = rowActivityDate(row);
    if (year != null && Number.isFinite(year)) {
      if (!activity || activity.getFullYear() !== year) return false;
    }
    if (month != null && Number.isFinite(month)) {
      if (!activity || activity.getMonth() + 1 !== month) return false;
    }
    return true;
  });
}

export function buildTeamRosterFilterOptions(
  rows: TeamActivityRow[],
  groups: Array<{ id: string; name: string }>,
): TeamRosterFilterOptions {
  const years = new Set<number>();
  const courses = new Map<string, string>();
  const locations = new Map<string, string>();
  const employees = new Map<string, string>();

  for (const row of rows) {
    const activity = rowActivityDate(row);
    if (activity) years.add(activity.getFullYear());

    const sourceId = row.sourceId?.trim() || row.sourceTitle.trim();
    if (sourceId) courses.set(sourceId, row.sourceTitle.trim() || "Training");

    locations.set(locationKey(row), locationLabel(row));

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
    groups: groups
      .map((group) => ({ groupId: group.id, groupName: group.name }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName)),
    employees: [...employees.entries()]
      .map(([personnelId, label]) => ({ personnelId, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function groupTeamActivityByCourse(roster: TeamActivityRow[]): CourseActivityGroup[] {
  const map = new Map<string, CourseActivityGroup>();
  for (const row of roster) {
    const sourceId = row.sourceId?.trim() || row.sourceTitle.trim() || "unknown";
    const sourceTitle = row.sourceTitle.trim() || "Training";
    const existing = map.get(sourceId);
    if (existing) {
      existing.rows.push(row);
    } else {
      map.set(sourceId, {
        sourceId,
        sourceTitle,
        rows: [row],
        latestActivityMs: 0,
        completedCount: 0,
        inProgressCount: 0,
      });
    }
  }

  for (const group of map.values()) {
    group.rows.sort((a, b) => activityTimestamp(b) - activityTimestamp(a));
    group.latestActivityMs = group.rows.reduce(
      (max, row) => Math.max(max, activityTimestamp(row)),
      0,
    );
    group.completedCount = group.rows.filter((row) => row.status === "PASSED").length;
    group.inProgressCount = group.rows.filter((row) => row.status === "IN_PROGRESS").length;
  }

  return [...map.values()].sort((a, b) => b.latestActivityMs - a.latestActivityMs);
}

export function formatTeamActivityWhen(row: TeamActivityRow): string {
  const value = row.completedAt ?? row.updatedAt ?? row.dueAt;
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatTeamLocation(row: TeamActivityRow): string {
  return locationLabel(row);
}

export function formatTeamGroups(row: TeamActivityRow): string {
  const names = (row.groupNames ?? []).filter(Boolean);
  return names.length ? names.join(", ") : "—";
}
