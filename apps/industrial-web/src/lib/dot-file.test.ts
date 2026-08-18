import { describe, expect, it } from "vitest";
import { relatedDotRecords, resolveDotFileRecord } from "./dot-compliance-module";
import { buildDotFile, dotFileHeading, formatDotFileValue } from "./dot-file";

describe("dot-file", () => {
  it("formats scalars, dates, and upload lists", () => {
    expect(formatDotFileValue("2026-03-01T00:00:00.000Z")).toBe("2026-03-01");
    expect(formatDotFileValue(true)).toBe("Yes");
    expect(formatDotFileValue([{ uploadedAt: "x" }, { uploadedAt: "y" }])).toBe("2 on file");
    expect(formatDotFileValue({})).toBe("");
  });

  it("builds DQF sections from known fields and leftover details", () => {
    const groups = buildDotFile({
      title: "Ada Byron",
      workerName: "Ada Byron",
      employeeNumber: "1042",
      licenseNumber: "A123",
      licenseState: "AR",
      licenseExpiryDate: "2027-04-01",
      initialMvrDate: "2024-01-15",
      notes: "Needs annual MVR",
      category: "drivers",
      seededFrom: "industrial_fleet_drivers",
    });
    expect(groups.map((g) => g.id)).toEqual(["identity", "license", "mvr", "details"]);
    expect(groups[0]?.rows).toEqual([{ label: "Employee #", value: "1042" }]);
    expect(groups.find((g) => g.id === "details")?.rows).toEqual([
      { label: "Notes", value: "Needs annual MVR", wide: false },
    ]);
  });

  it("uses the worker name as the file heading", () => {
    expect(dotFileHeading({ title: "Unit 12", workerName: "Ada Byron" })).toBe("Ada Byron");
    expect(dotFileHeading({ title: "Unit 12" })).toBe("Unit 12");
  });
});

describe("resolveDotFileRecord", () => {
  const driver = {
    id: "d1",
    category: "drivers",
    workerName: "Ada Byron",
    personnelId: "p1",
  };
  const vehicle = {
    id: "v1",
    category: "vehicles",
    title: "Unit 12",
    workerName: "Ada Byron",
    personnelId: "p1",
  };

  it("opens the Drivers (DQF) file when a name matches a driver record", () => {
    expect(resolveDotFileRecord(vehicle, [vehicle, driver]).id).toBe("d1");
  });

  it("falls back to the clicked record when no driver file exists", () => {
    expect(resolveDotFileRecord(vehicle, [vehicle]).id).toBe("v1");
  });
});

describe("relatedDotRecords", () => {
  it("returns other records for the same person", () => {
    const driver = { id: "d1", category: "drivers", workerName: "Ada Byron" };
    const duplicate = { id: "d2", category: "drivers", workerName: "ADA BYRON" };
    const accident = { id: "a1", category: "accidents", workerName: "Ada Byron" };
    const other = { id: "x1", category: "drivers", workerName: "Bea Nguyen" };
    expect(relatedDotRecords(driver, [driver, duplicate, accident, other]).map((r) => r.id)).toEqual([
      "a1",
    ]);
  });
});
