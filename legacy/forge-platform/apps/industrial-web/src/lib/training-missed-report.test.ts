import { describe, expect, it } from "vitest";
import {
  buildMissedTrainingCsv,
  buildMissedTrainingReport,
  daysLate,
  daysLateLabel,
  dueDay,
  groupByDepartment,
  type MissedReportRosterRow,
} from "./training-missed-report";

const row = (over: Partial<MissedReportRosterRow>): MissedReportRosterRow => ({
  assignmentId: "a1",
  assignmentTitle: "Forklift",
  personnelId: "p1",
  employeeNumber: "100",
  userLabel: "SMITH, JANE",
  status: "NOT_STARTED",
  dueAt: "2026-11-01T00:00:00.000Z",
  assignedAt: "2026-10-15T15:00:00.000Z",
  ...over,
});

// Local noon on Nov 10, 2026.
const now = new Date(2026, 10, 10, 12);

describe("daysLate", () => {
  it("is 0 on the due date and 1 the day after", () => {
    expect(daysLate("2026-11-10", "2026-11-10")).toBe(0);
    expect(daysLate("2026-11-09", "2026-11-10")).toBe(1);
    expect(daysLate("2026-10-31", "2026-11-10")).toBe(10);
  });
  it("labels singular and plural", () => {
    expect(daysLateLabel(1)).toBe("1 day late");
    expect(daysLateLabel(3)).toBe("3 days late");
  });
});

describe("dueDay", () => {
  it("uses the date that was picked (stored as midnight UTC)", () => {
    expect(dueDay("2026-11-09T00:00:00.000Z")).toBe("2026-11-09");
    expect(dueDay("2026-11-09")).toBe("2026-11-09");
    expect(dueDay(null)).toBeNull();
  });
});

describe("buildMissedTrainingReport", () => {
  it("keeps only not-started training past its due date", () => {
    const report = buildMissedTrainingReport(
      [
        row({ assignmentId: "late" }),
        row({ assignmentId: "today", dueAt: "2026-11-10T00:00:00.000Z" }),
        row({ assignmentId: "started", status: "IN_PROGRESS" }),
        row({ assignmentId: "passed", status: "PASSED" }),
        row({ assignmentId: "nodue", dueAt: null }),
      ],
      now,
    );
    expect(report).toHaveLength(1);
    expect(report[0]!.trainings.map((t) => t.assignmentId)).toEqual(["late"]);
    expect(report[0]!.trainings[0]).toMatchObject({
      assignedOn: "2026-10-15",
      dueOn: "2026-11-01",
      daysLate: 9,
    });
  });

  it("groups by person, sorts people by name and trainings by most late", () => {
    const report = buildMissedTrainingReport(
      [
        row({ assignmentId: "a", assignmentTitle: "HazCom", dueAt: "2026-11-08T00:00:00.000Z" }),
        row({ assignmentId: "b", assignmentTitle: "LOTO", dueAt: "2026-10-01T00:00:00.000Z" }),
        row({
          assignmentId: "c",
          personnelId: "p2",
          employeeNumber: "200",
          userLabel: "ADAMS, BO",
        }),
      ],
      now,
    );
    expect(report.map((p) => p.name)).toEqual(["ADAMS, BO", "SMITH, JANE"]);
    expect(report[1]!.trainings.map((t) => t.title)).toEqual(["LOTO", "HazCom"]);
  });

  it("exports one CSV line per missed training", () => {
    const csv = buildMissedTrainingCsv(
      buildMissedTrainingReport([row({ departmentName: "Shipping" })], now),
    );
    expect(csv.split("\n")).toEqual([
      "Department,Name,Employee #,Location,Training,Assigned,Due by,Days late",
      'Shipping,"SMITH, JANE",100,,Forklift,2026-10-15,2026-11-01,9',
    ]);
  });
});

describe("groupByDepartment", () => {
  it("sorts departments A-Z with people who have none last", () => {
    const people = buildMissedTrainingReport(
      [
        row({ personnelId: "p1", userLabel: "SMITH, JANE", departmentName: "Shipping" }),
        row({ personnelId: "p2", userLabel: "ADAMS, BO", departmentName: "Production" }),
        row({ personnelId: "p3", userLabel: "COLE, AL", departmentName: null }),
        row({ personnelId: "p4", userLabel: "BAKER, CY", departmentName: "Shipping" }),
      ],
      now,
    );
    const groups = groupByDepartment(people);
    expect(groups.map((g) => g.name)).toEqual(["Production", "Shipping", "No department"]);
    expect(groups[1]!.people.map((p) => p.name)).toEqual(["BAKER, CY", "SMITH, JANE"]);
  });
});
