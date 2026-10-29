import { describe, expect, it } from "vitest";
import { filterTeamRoster, groupTeamActivityByCourse } from "./training-team-activity";

describe("groupTeamActivityByCourse", () => {
  it("groups roster rows by course and sorts by recent activity", () => {
    const groups = groupTeamActivityByCourse([
      {
        assigneeId: "a1",
        assignmentId: "as1",
        assignmentTitle: "Forklift A",
        sourceId: "course-a",
        sourceTitle: "Forklift safety",
        userLabel: "Jane",
        status: "PASSED",
        completedAt: "2026-08-01T12:00:00.000Z",
      },
      {
        assigneeId: "a2",
        assignmentId: "as2",
        assignmentTitle: "LOTO B",
        sourceId: "course-b",
        sourceTitle: "LOTO",
        userLabel: "John",
        status: "IN_PROGRESS",
        updatedAt: "2026-08-20T12:00:00.000Z",
      },
      {
        assigneeId: "a3",
        assignmentId: "as3",
        assignmentTitle: "Forklift C",
        sourceId: "course-a",
        sourceTitle: "Forklift safety",
        userLabel: "Sam",
        status: "NOT_STARTED",
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.sourceTitle).toBe("LOTO");
    expect(groups[1]?.sourceTitle).toBe("Forklift safety");
    expect(groups[1]?.rows).toHaveLength(2);
    expect(groups[1]?.completedCount).toBe(1);
    expect(groups[1]?.inProgressCount).toBe(0);
  });
});

describe("filterTeamRoster", () => {
  const rows = [
    {
      assigneeId: "a1",
      assignmentId: "as1",
      assignmentTitle: "Forklift A",
      sourceId: "course-a",
      sourceTitle: "Forklift safety",
      siteId: "site-1",
      siteName: "Stuttgart",
      groupIds: ["g1"],
      groupNames: ["Day shift"],
      personnelId: "p1",
      userLabel: "Jane",
      status: "PASSED",
      completedAt: "2026-08-01T12:00:00.000Z",
    },
    {
      assigneeId: "a2",
      assignmentId: "as2",
      assignmentTitle: "LOTO B",
      sourceId: "course-b",
      sourceTitle: "LOTO",
      siteId: "site-2",
      siteName: "Jonesboro",
      personnelId: "p2",
      userLabel: "John",
      status: "IN_PROGRESS",
      updatedAt: "2025-12-01T12:00:00.000Z",
    },
  ];

  it("filters by year, course, location, group, and employee", () => {
    expect(
      filterTeamRoster(rows, {
        year: "2026",
        month: "",
        sourceId: "",
        siteId: "",
        groupId: "",
        personnelId: "",
      }),
    ).toHaveLength(1);
    expect(
      filterTeamRoster(rows, {
        year: "2026",
        month: "8",
        sourceId: "course-a",
        siteId: "site-1",
        groupId: "g1",
        personnelId: "p1",
      }),
    ).toHaveLength(1);
  });
});
