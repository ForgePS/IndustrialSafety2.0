import { describe, expect, it } from "vitest";
import {
  buildAssignmentFilterOptions,
  buildPersonnelMetaMap,
  defaultAssignmentFilters,
  filterAssignmentPersonnelRow,
  filterAssignmentRecord,
} from "@/lib/training-assignment-filters";
import { buildCourseAssignmentGroups } from "@/lib/training-assignment-groups";
import type { TrainingAssignment } from "@/features/training/types";
import type { RosterPerson } from "@/lib/personnel-directory";

const people: RosterPerson[] = [
  {
    id: "p1",
    displayName: "Alex Miller",
    firstName: "Alex",
    lastName: "Miller",
    jobTitle: "Operator",
    departmentName: "Mill",
    divisionName: "Production",
    departmentId: "",
    employeeNumber: "EMP-101",
    email: "alex@example.com",
    siteId: "site-a",
    siteLabel: "Stuttgart",
    status: "ACTIVE",
    isCompanyDriver: false,
    isDotDriver: false,
    hasPpeExpiryAlert: false,
  },
  {
    id: "p2",
    displayName: "Jamie Lee",
    firstName: "Jamie",
    lastName: "Lee",
    jobTitle: "Supervisor",
    departmentName: "Safety",
    divisionName: "Corporate",
    departmentId: "",
    employeeNumber: "EMP-202",
    email: "jamie@example.com",
    siteId: "site-b",
    siteLabel: "Jonesboro",
    status: "ACTIVE",
    isCompanyDriver: false,
    isDotDriver: false,
    hasPpeExpiryAlert: false,
  },
];

const assignments: TrainingAssignment[] = [
  {
    id: "a1",
    title: "August safety quiz",
    sourceId: "course-1",
    sourceTitle: "Safety basics",
    passingPercent: 80,
    quizMode: "STANDARD",
    optionCount: 4,
    feedbackEnabled: true,
    status: "ACTIVE",
    assigneeCount: 2,
    completedCount: 1,
    createdAt: "2026-08-15T12:00:00.000Z",
  },
];

const roster = [
  {
    assigneeId: "as1",
    assignmentId: "a1",
    assignmentTitle: "August safety quiz",
    sourceId: "course-1",
    sourceTitle: "Safety basics",
    siteId: "site-a",
    siteName: "Stuttgart",
    groupIds: ["g1"],
    groupNames: ["Plant A"],
    personnelId: "p1",
    employeeNumber: "EMP-101",
    userLabel: "Alex Miller",
    status: "PASSED",
    bestPercent: 90,
    dueAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-08-20T00:00:00.000Z",
  },
  {
    assigneeId: "as2",
    assignmentId: "a1",
    assignmentTitle: "August safety quiz",
    sourceId: "course-1",
    sourceTitle: "Safety basics",
    siteId: "site-b",
    siteName: "Jonesboro",
    groupIds: ["g2"],
    groupNames: ["Safety team"],
    personnelId: "p2",
    employeeNumber: "EMP-202",
    userLabel: "Jamie Lee",
    status: "NOT_STARTED",
    bestPercent: null,
    dueAt: "2026-09-01T00:00:00.000Z",
    completedAt: null,
  },
];

describe("training-assignment-filters", () => {
  it("filters assignments by year, month, and course", () => {
    const filters = {
      ...defaultAssignmentFilters(),
      year: "2026",
      month: "8",
      sourceId: "course-1",
    };
    expect(filterAssignmentRecord(assignments[0]!, filters)).toBe(true);
    expect(filterAssignmentRecord(assignments[0]!, { ...filters, month: "7" })).toBe(false);
  });

  it("filters roster rows by location, division, department, group, employee, and status", () => {
    const metaMap = buildPersonnelMetaMap(people);
    const base = defaultAssignmentFilters();

    expect(filterAssignmentPersonnelRow(roster[0]!, { ...base, siteId: "site-a" }, metaMap)).toBe(
      true,
    );
    expect(filterAssignmentPersonnelRow(roster[0]!, { ...base, siteId: "site-b" }, metaMap)).toBe(
      false,
    );
    expect(
      filterAssignmentPersonnelRow(roster[0]!, { ...base, divisionName: "Production" }, metaMap),
    ).toBe(true);
    expect(
      filterAssignmentPersonnelRow(roster[1]!, { ...base, departmentName: "Safety" }, metaMap),
    ).toBe(true);
    expect(filterAssignmentPersonnelRow(roster[0]!, { ...base, groupId: "g1" }, metaMap)).toBe(
      true,
    );
    expect(filterAssignmentPersonnelRow(roster[0]!, { ...base, personnelId: "p1" }, metaMap)).toBe(
      true,
    );
    expect(filterAssignmentPersonnelRow(roster[0]!, { ...base, status: "PASSED" }, metaMap)).toBe(
      true,
    );
    expect(filterAssignmentPersonnelRow(roster[1]!, { ...base, query: "Jamie" }, metaMap)).toBe(
      true,
    );
  });

  it("builds filter options from assignments and roster", () => {
    const metaMap = buildPersonnelMetaMap(people);
    const options = buildAssignmentFilterOptions({
      assignments,
      roster,
      groups: [{ id: "g1", name: "Plant A" }],
      metaMap,
    });
    expect(options.courses).toHaveLength(1);
    expect(options.locations.length).toBeGreaterThan(0);
    expect(options.divisions.some((entry) => entry.label === "Production")).toBe(true);
    expect(options.departments.some((entry) => entry.label === "Safety")).toBe(true);
    expect(options.employees).toHaveLength(2);
  });

  it("builds grouped assignments with filtered assignees", () => {
    const metaMap = buildPersonnelMetaMap(people);
    const groups = buildCourseAssignmentGroups({
      assignments,
      roster,
      filters: {
        ...defaultAssignmentFilters(),
        year: "2026",
        departmentName: "Mill",
      },
      personnelMeta: metaMap,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.assigneeCount).toBe(1);
    expect(groups[0]?.months[0]?.batches[0]?.personnel[0]?.userLabel).toBe("Alex Miller");
  });
});
