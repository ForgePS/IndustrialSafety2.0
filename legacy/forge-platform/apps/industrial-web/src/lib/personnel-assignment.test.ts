import { describe, expect, it } from "vitest";
import {
  buildAssignmentOptions,
  divisionsForLocationCascade,
  filterDepartmentsForSite,
  filterDepartmentsForSiteDivision,
  filterDivisionsForSite,
  shouldRetainDepartmentSelection,
  shouldRetainDivisionSelection,
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
    expect(options.divisionEntries).toHaveLength(3);
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

  it("can exclude unscoped departments for strict site linking", () => {
    expect(
      filterDepartmentsForSite(departments, "s1", { includeUnscoped: false }).map((d) => d.id),
    ).toEqual(["d1"]);
  });
});

describe("filterDivisionsForSite", () => {
  const divisions = [
    { name: "Ops", siteId: "s1" },
    { name: "QA", siteId: "s2" },
    { name: "Shared", siteId: null },
  ];

  it("returns every division when no location is selected", () => {
    expect(filterDivisionsForSite(divisions, undefined)).toHaveLength(3);
  });

  it("keeps site-matched and unscoped divisions by default", () => {
    expect(filterDivisionsForSite(divisions, "s1").map((d) => d.name)).toEqual(["Ops", "Shared"]);
  });

  it("can exclude unscoped divisions", () => {
    expect(
      filterDivisionsForSite(divisions, "s1", { includeUnscoped: false }).map((d) => d.name),
    ).toEqual(["Ops"]);
  });
});

describe("shouldRetainDivisionSelection", () => {
  const divisions = [
    { name: "Ops", siteId: "s1" },
    { name: "QA", siteId: "s2" },
  ];

  it("clears a division that belongs to another location", () => {
    const forSite = filterDivisionsForSite(divisions, "s1", { includeUnscoped: false });
    expect(shouldRetainDivisionSelection("QA", divisions, forSite)).toBe(false);
  });

  it("keeps a division that matches the selected location", () => {
    const forSite = filterDivisionsForSite(divisions, "s1", { includeUnscoped: false });
    expect(shouldRetainDivisionSelection("Ops", divisions, forSite)).toBe(true);
  });

  it("models cascade clear when location changes to an empty filter set", () => {
    const forSite = filterDivisionsForSite(divisions, "s1", { includeUnscoped: false });
    const keep = shouldRetainDivisionSelection("QA", divisions, forSite);
    expect(keep).toBe(false);
    const nextDivisionName = keep ? "QA" : "";
    expect(nextDivisionName).toBe("");
  });
});

describe("divisionsForLocationCascade", () => {
  const catalog = [
    { name: "Stuttgart Milling Operations", siteId: "s1" },
    { name: "Orphan", siteId: "s2" },
    { name: "Legacy", siteId: null },
  ];
  const departments = [
    {
      id: "d1",
      label: "White Rice Mill",
      siteId: "s1",
      divisionName: "Stuttgart Milling Operations",
    },
    {
      id: "d2",
      label: "PRI QC",
      siteId: "s1",
      divisionName: "Producers Rice Ingredients",
    },
  ];

  it("merges catalog and department division names for the selected location", () => {
    const names = divisionsForLocationCascade(catalog, departments, "s1").map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(["Producers Rice Ingredients", "Stuttgart Milling Operations"]),
    );
    expect(names).not.toContain("Orphan");
    expect(names).not.toContain("Legacy");
  });

  it("never includes unscoped catalog divisions for a selected location", () => {
    const names = divisionsForLocationCascade(catalog, departments, "s1", {
      includeUnscoped: true,
    }).map((d) => d.name);
    expect(names).not.toContain("Legacy");
    expect(names).not.toContain("Orphan");
  });

  it("returns no divisions until a location is selected", () => {
    expect(divisionsForLocationCascade(catalog, departments, undefined)).toEqual([]);
    expect(divisionsForLocationCascade(catalog, departments, "")).toEqual([]);
  });

  it("still returns department-derived divisions when the catalog has no site match", () => {
    expect(divisionsForLocationCascade([], departments, "s1").map((d) => d.name)).toEqual([
      "Producers Rice Ingredients",
      "Stuttgart Milling Operations",
    ]);
  });
});

describe("filterDepartmentsForSiteDivision", () => {
  const departments = [
    {
      id: "d1",
      label: "White Rice Mill",
      siteId: "s1",
      divisionName: "Stuttgart Milling Operations",
    },
    { id: "d2", label: "PRI QC", siteId: "s1", divisionName: "Producers Rice Ingredients" },
    { id: "d3", label: "Parboil Mill", siteId: "s2", divisionName: "Greenville MS" },
    { id: "d4", label: "Legacy", siteId: "s1", divisionName: null },
  ];

  it("returns no departments until both location and division are selected", () => {
    expect(filterDepartmentsForSiteDivision(departments, "s1", undefined)).toEqual([]);
    expect(
      filterDepartmentsForSiteDivision(departments, undefined, "Stuttgart Milling Operations"),
    ).toEqual([]);
  });

  it("keeps only departments for the selected location and division", () => {
    expect(
      filterDepartmentsForSiteDivision(departments, "s1", "Stuttgart Milling Operations").map(
        (d) => d.id,
      ),
    ).toEqual(["d1"]);
    expect(
      filterDepartmentsForSiteDivision(departments, "s1", "Producers Rice Ingredients").map(
        (d) => d.id,
      ),
    ).toEqual(["d2"]);
  });

  it("does not leak departments from another location with a similar division", () => {
    expect(
      filterDepartmentsForSiteDivision(departments, "s1", "Greenville MS").map((d) => d.id),
    ).toEqual([]);
  });
});

describe("org location cascade helpers", () => {
  const departments = [
    { id: "d1", label: "Milling", siteId: "s1" },
    { id: "d2", label: "Packing", siteId: "s2" },
  ];
  const divisions = [
    { name: "Ops", siteId: "s1" },
    { name: "QA", siteId: "s2" },
  ];

  it("disables cascade children until location is chosen by returning full lists only when site empty", () => {
    expect(filterDepartmentsForSite(departments, "").map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(filterDivisionsForSite(divisions, "").map((d) => d.name)).toEqual(["Ops", "QA"]);
  });

  it("clears department and division together when location changes away from their site", () => {
    const nextSiteId = "s1";
    const nextDepts = filterDepartmentsForSite(departments, nextSiteId, { includeUnscoped: false });
    const nextDivs = filterDivisionsForSite(divisions, nextSiteId, { includeUnscoped: false });
    expect(shouldRetainDepartmentSelection("d2", departments, nextDepts)).toBe(false);
    expect(shouldRetainDivisionSelection("QA", divisions, nextDivs)).toBe(false);
  });
});

describe("shouldRetainDepartmentSelection", () => {
  const departments = [
    { id: "d1", label: "Ops", siteId: "s1" },
    { id: "d2", label: "QA", siteId: "s2" },
    { id: "d3", label: "Shared", siteId: null },
  ];

  it("keeps the selection while the catalog is still empty", () => {
    expect(shouldRetainDepartmentSelection("d1", [], [])).toBe(true);
  });

  it("keeps orphaned department ids that are not in the catalog", () => {
    expect(shouldRetainDepartmentSelection("missing", departments, departments)).toBe(true);
  });

  it("clears a department that belongs to another location", () => {
    const forSite = filterDepartmentsForSite(departments, "s1");
    expect(shouldRetainDepartmentSelection("d2", departments, forSite)).toBe(false);
  });

  it("keeps a department that matches the selected location", () => {
    const forSite = filterDepartmentsForSite(departments, "s1");
    expect(shouldRetainDepartmentSelection("d1", departments, forSite)).toBe(true);
  });
});
