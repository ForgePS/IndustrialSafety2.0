import { describe, expect, it } from "vitest";
import {
  buildAssignmentOptions,
  filterDepartmentsForSite,
  suggestSupervisor,
} from "./personnel-assignment";

describe("buildAssignmentOptions", () => {
  it("collects distinct sorted divisions", () => {
    const options = buildAssignmentOptions([
      { divisionName: "Milling" },
      { divisionName: "Packing" },
      { divisionName: "milling" },
      { divisionName: "  " },
      { divisionName: null },
    ]);
    // Distinct is case-preserving; localeCompare order is environment-dependent,
    // so assert membership + length rather than a fixed order.
    expect(options.divisions).toHaveLength(3);
    expect(options.divisions).toEqual(expect.arrayContaining(["Milling", "Packing", "milling"]));
  });

  it("aggregates supervisor counts for complete triads only", () => {
    const options = buildAssignmentOptions([
      {
        divisionName: "Milling",
        siteId: "s1",
        departmentId: "d1",
        supervisorName: "Sam",
      },
      {
        divisionName: "Milling",
        siteId: "s1",
        departmentId: "d1",
        supervisorName: "Sam",
      },
      {
        divisionName: "Milling",
        siteId: "s1",
        departmentId: "d1",
        supervisorName: "Pat",
      },
      // Incomplete triad — ignored for supervisor modes.
      { divisionName: "Milling", siteId: "s1", supervisorName: "Nobody" },
    ]);
    expect(options.supervisors).toHaveLength(2);
    const sam = options.supervisors.find((s) => s.supervisorName === "Sam");
    expect(sam?.count).toBe(2);
  });
});

describe("suggestSupervisor", () => {
  const modes = [
    {
      divisionName: "Milling",
      siteId: "s1",
      departmentId: "d1",
      supervisorName: "Sam",
      count: 5,
    },
    {
      divisionName: "Milling",
      siteId: "s1",
      departmentId: "d1",
      supervisorName: "Pat",
      count: 2,
    },
    {
      divisionName: "Packing",
      siteId: "s1",
      departmentId: "d1",
      supervisorName: "Lee",
      count: 9,
    },
  ];

  it("returns the most common supervisor for the exact triad", () => {
    expect(suggestSupervisor(modes, "Milling", "s1", "d1")).toBe("Sam");
  });

  it("is case-insensitive on division", () => {
    expect(suggestSupervisor(modes, "milling", "s1", "d1")).toBe("Sam");
  });

  it("returns null when any leg of the triad is missing", () => {
    expect(suggestSupervisor(modes, "", "s1", "d1")).toBeNull();
    expect(suggestSupervisor(modes, "Milling", "", "d1")).toBeNull();
    expect(suggestSupervisor(modes, "Milling", "s1", "")).toBeNull();
  });

  it("returns null when no mode matches", () => {
    expect(suggestSupervisor(modes, "Milling", "s9", "d1")).toBeNull();
  });
});

describe("filterDepartmentsForSite", () => {
  const departments = [
    { id: "d1", label: "Milling", siteId: "s1" },
    { id: "d2", label: "Packing", siteId: "s2" },
    { id: "d3", label: "Shared", siteId: null },
  ];

  it("returns every department when no location is selected", () => {
    expect(filterDepartmentsForSite(departments, undefined)).toHaveLength(3);
  });

  it("keeps site-matched and unscoped departments", () => {
    expect(filterDepartmentsForSite(departments, "s1").map((d) => d.id)).toEqual(["d1", "d3"]);
  });
});
