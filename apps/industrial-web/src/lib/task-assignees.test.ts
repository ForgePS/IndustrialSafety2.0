import { describe, expect, it } from "vitest";
import {
  filterTaskAssigneePersonnel,
  isSafetyOrEhsOrgAssignment,
  isSafetyOrEhsOrgLabel,
  isSafetyOrEhsStaffPerson,
  safetyOrEhsDepartmentIds,
} from "./task-assignees";

describe("task-assignees", () => {
  it("matches Safety and EHS labels without Food Safety", () => {
    expect(isSafetyOrEhsOrgLabel("Safety")).toBe(true);
    expect(isSafetyOrEhsOrgLabel("EHS")).toBe(true);
    expect(isSafetyOrEhsOrgLabel("Greenville MS EHS")).toBe(true);
    expect(isSafetyOrEhsOrgLabel("Safety Department")).toBe(true);
    expect(isSafetyOrEhsOrgLabel("Food Safety")).toBe(false);
    expect(isSafetyOrEhsOrgLabel("PRI Food Safety")).toBe(false);
    expect(isSafetyOrEhsOrgLabel("Milling")).toBe(false);
  });

  it("checks department, division, or job title on a person", () => {
    expect(isSafetyOrEhsOrgAssignment({ departmentName: "Safety", divisionName: "" })).toBe(true);
    expect(isSafetyOrEhsOrgAssignment({ departmentName: "", divisionName: "Safety" })).toBe(true);
    expect(
      isSafetyOrEhsOrgAssignment({ departmentName: "Greenville MS EHS", divisionName: "Greenville MS" }),
    ).toBe(true);
    expect(
      isSafetyOrEhsOrgAssignment({ departmentName: "Food Safety", divisionName: "Stuttgart Milling Operations" }),
    ).toBe(false);
    expect(
      isSafetyOrEhsOrgAssignment({
        departmentName: "Parboil Mill",
        divisionName: "",
        jobTitle: "Safety Coordinator",
      }),
    ).toBe(true);
    expect(
      isSafetyOrEhsOrgAssignment({
        departmentName: "Parboil Mill",
        divisionName: "",
        jobTitle: "Food Safety Technician",
      }),
    ).toBe(false);
  });

  it("matches people whose departmentId maps to a Safety/EHS catalog row", () => {
    const ehsIds = safetyOrEhsDepartmentIds([
      { id: "dept-ehs", label: "Greenville MS EHS" },
      { id: "dept-mill", label: "Parboil Mill" },
      { id: "dept-food", label: "Food Safety" },
    ]);
    expect(ehsIds.has("dept-ehs")).toBe(true);
    expect(ehsIds.has("dept-mill")).toBe(false);
    expect(ehsIds.has("dept-food")).toBe(false);
    expect(
      isSafetyOrEhsStaffPerson(
        { departmentName: "", divisionName: "", departmentId: "dept-ehs" },
        ehsIds,
      ),
    ).toBe(true);
    expect(
      isSafetyOrEhsStaffPerson(
        { departmentName: "", divisionName: "", departmentId: "dept-mill" },
        ehsIds,
      ),
    ).toBe(false);
  });

  it("filters Producers Rice assignees and can keep a current assignee", () => {
    const people = [
      { id: "1", displayName: "Sam Safety", departmentName: "Safety" },
      { id: "2", displayName: "Eddie EHS", departmentName: "Greenville MS EHS" },
      { id: "3", displayName: "Mill Tech", departmentName: "Parboil Mill" },
      { id: "4", displayName: "Food QC", departmentName: "Food Safety" },
      { id: "5", displayName: "FK Only", departmentName: "", departmentId: "dept-ehs" },
    ];
    const ehsDepartmentIds = new Set(["dept-ehs"]);

    expect(filterTaskAssigneePersonnel(people, { restrictToSafetyOrEhs: false })).toHaveLength(5);
    expect(
      filterTaskAssigneePersonnel(people, {
        restrictToSafetyOrEhs: true,
        ehsDepartmentIds,
      }).map((p) => p.id),
    ).toEqual(["1", "2", "5"]);
    expect(
      filterTaskAssigneePersonnel(people, {
        restrictToSafetyOrEhs: true,
        alwaysIncludeIds: ["3"],
        ehsDepartmentIds,
      }).map((p) => p.id),
    ).toEqual(["1", "2", "3", "5"]);
  });
});
