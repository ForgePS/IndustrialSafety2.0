import { describe, expect, it } from "vitest";
import { relatedDotRecords, resolveDotFileRecord } from "./dot-compliance-module";
import {
  buildDotFile,
  dotFileDraftFromRecord,
  dotFileEditSections,
  dotFileHeading,
  dotFilePatchFromDraft,
  formatDotFileValue,
} from "./dot-file";

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
    expect(groups[0]?.rows).toEqual([{ label: "EMPLOYEE #", value: "1042" }]);
    expect(groups.find((g) => g.id === "details")?.rows).toEqual([
      { label: "Notes", value: "Needs annual MVR", wide: false },
    ]);
  });

  it("uses the worker name as the file heading", () => {
    expect(dotFileHeading({ title: "Unit 12", workerName: "Ada Byron" })).toBe("Ada Byron");
    expect(dotFileHeading({ title: "Unit 12" })).toBe("Unit 12");
  });

  it("builds editable DQF sections and round-trips draft patches", () => {
    const record = {
      title: "Ada Byron",
      workerName: "Ada Byron",
      employeeNumber: "1042",
      licenseNumber: "A123",
      licenseState: "AR",
      licenseExpiryDate: "2027-04-01",
      notes: "Needs annual MVR",
      category: "drivers",
    };
    const sections = dotFileEditSections(record);
    expect(sections.map((section) => section.id)).toEqual([
      "record",
      "identity",
      "license",
      "medical",
      "mvr",
      "vehicle",
    ]);
    const draft = dotFileDraftFromRecord(record, sections);
    expect(draft.employeeNumber).toBe("1042");
    expect(draft.licenseExpiryDate).toBe("2027-04-01");
    draft.notes = "Updated notes";
    const patch = dotFilePatchFromDraft(draft, sections);
    expect(patch.notes).toBe("Updated notes");
    expect(patch.driverName).toBe("Ada Byron");
    expect(patch.personnelName).toBe("Ada Byron");
  });

  it("builds DVIR summary sections for DOT file reports", () => {
    const groups = buildDotFile({
      category: "dvirs",
      recordType: "DVIR",
      inspectionDate: "2026-03-01",
      workerName: "Ada Byron",
      items: [
        { id: "brakes", label: "Brakes", answer: "NO", notes: "Soft pedal" },
        { id: "lights", label: "Lights", answer: "YES", notes: "" },
      ],
      driverSignedAt: "2026-03-01T12:00:00.000Z",
    });
    expect(groups.map((g) => g.id)).toEqual(["dvir-summary", "dvir-signatures"]);
    const summary = groups[0]?.rows ?? [];
    expect(summary).toEqual(
      expect.arrayContaining([
        { label: "Inspection date", value: "2026-03-01" },
        { label: "DRIVER", value: "Ada Byron" },
        { label: "Defects", value: "Yes" },
        {
          label: "Defect summary",
          value: "Brakes: Soft pedal",
          wide: true,
        },
      ]),
    );
  });

  it("does not expose editable DVIR sections in DOT file editor", () => {
    const record = {
      category: "dvirs",
      recordType: "DVIR",
      tripType: "PRE_TRIP",
      inspectionDate: "2026-03-01",
      truckNumber: "12",
      workerName: "Ada Byron",
      conditionSatisfactory: true,
    };
    expect(dotFileEditSections(record)).toEqual([]);
  });

  it("uses a select for vehicle asset type when editing", () => {
    const sections = dotFileEditSections({ category: "vehicles", title: "Unit 12" });
    const vehicle = sections.find((section) => section.id === "vehicle");
    const assetType = vehicle?.fields.find((field) => field.key === "assetType");
    expect(assetType?.input).toBe("select");
    expect(assetType?.options).toContain("FLEET_VEHICLE");
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
    expect(
      relatedDotRecords(driver, [driver, duplicate, accident, other]).map((r) => r.id),
    ).toEqual(["a1"]);
  });
});
