import type { TrainingAssignment, TrainingTeamSummary } from "@/features/training/types";
import {
  assignmentMatchesQueryOnly,
  enrichPersonnelAssignmentRow,
  filterAssignmentPersonnelRow,
  filterAssignmentRecord,
  type AssignmentRosterFilters,
  type PersonnelAssignmentMeta,
} from "@/lib/training-assignment-filters";

export type PersonnelAssignmentRow = {
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

export type AssignmentBatch = {
  assignment: TrainingAssignment;
  personnel: PersonnelAssignmentRow[];
};

export type MonthAssignmentGroup = {
  monthKey: string;
  monthLabel: string;
  batches: AssignmentBatch[];
};

export type CourseAssignmentGroup = {
  sourceId: string;
  sourceTitle: string;
  months: MonthAssignmentGroup[];
  assignmentCount: number;
  assigneeCount: number;
};

export function assignmentYear(dateIso?: string | null): number | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
}

export function assignmentMonthKey(dateIso?: string | null): string | null {
  if (!dateIso) return null;
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatAssignmentDate(dateIso?: string | null): string {
  if (!dateIso) return "—";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function collectAssignmentYears(assignments: TrainingAssignment[]): number[] {
  const years = new Set<number>();
  for (const assignment of assignments) {
    const year = assignmentYear(assignment.createdAt);
    if (year) years.add(year);
  }
  const currentYear = new Date().getFullYear();
  years.add(currentYear);
  return [...years].sort((a, b) => b - a);
}

export function buildCourseAssignmentGroups(input: {
  assignments: TrainingAssignment[];
  roster: TrainingTeamSummary["roster"];
  filters: AssignmentRosterFilters;
  personnelMeta?: Map<string, PersonnelAssignmentMeta>;
}): CourseAssignmentGroup[] {
  const { assignments, roster, filters, personnelMeta = new Map() } = input;
  const rosterByAssignment = new Map<string, TrainingTeamSummary["roster"]>();
  for (const row of roster) {
    const list = rosterByAssignment.get(row.assignmentId) ?? [];
    list.push(row);
    rosterByAssignment.set(row.assignmentId, list);
  }

  const filteredAssignments = assignments.filter((assignment) => filterAssignmentRecord(assignment, filters));
  const byCourse = new Map<string, TrainingAssignment[]>();
  for (const assignment of filteredAssignments) {
    const list = byCourse.get(assignment.sourceId) ?? [];
    list.push(assignment);
    byCourse.set(assignment.sourceId, list);
  }

  const groups: CourseAssignmentGroup[] = [];
  for (const [sourceId, courseAssignments] of byCourse) {
    const sourceTitle = courseAssignments[0]?.sourceTitle ?? "Training";
    const byMonth = new Map<string, TrainingAssignment[]>();
    for (const assignment of courseAssignments) {
      const monthKey = assignmentMonthKey(assignment.createdAt);
      if (!monthKey) continue;
      const list = byMonth.get(monthKey) ?? [];
      list.push(assignment);
      byMonth.set(monthKey, list);
    }

    const months: MonthAssignmentGroup[] = [...byMonth.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([monthKey, monthAssignments]) => {
        const batches = monthAssignments
          .sort(
            (left, right) =>
              new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime(),
          )
          .map((assignment) => {
            const createdAt = assignment.createdAt ?? "";
            const rosterRows = rosterByAssignment.get(assignment.id) ?? [];
            const personnel = rosterRows
              .filter((row) => filterAssignmentPersonnelRow(row, filters, personnelMeta))
              .map((row) => enrichPersonnelAssignmentRow(row, createdAt, personnelMeta))
              .sort((left, right) => {
                const dateDiff =
                  new Date(left.assignedAt).getTime() - new Date(right.assignedAt).getTime();
                if (dateDiff !== 0) return dateDiff;
                return left.userLabel.localeCompare(right.userLabel);
              });
            return { assignment, personnel };
          })
          .filter((batch) => {
            if (batch.personnel.length) return true;
            return assignmentMatchesQueryOnly(batch.assignment, filters);
          });

        return {
          monthKey,
          monthLabel: formatMonthLabel(monthKey),
          batches,
        };
      })
      .filter((month) => month.batches.length > 0);

    if (!months.length) continue;

    const assignmentCount = months.reduce(
      (sum, month) => sum + month.batches.length,
      0,
    );
    const assigneeCount = months.reduce(
      (sum, month) =>
        sum +
        month.batches.reduce((batchSum, batch) => batchSum + batch.personnel.length, 0),
      0,
    );

    groups.push({
      sourceId,
      sourceTitle,
      months,
      assignmentCount,
      assigneeCount,
    });
  }

  return groups.sort((left, right) => left.sourceTitle.localeCompare(right.sourceTitle));
}

export function countVisibleAssignments(groups: CourseAssignmentGroup[]): number {
  return groups.reduce(
    (sum, course) => sum + course.months.reduce((monthSum, month) => monthSum + month.batches.length, 0),
    0,
  );
}
