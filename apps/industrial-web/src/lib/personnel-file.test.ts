import { describe, expect, it } from "vitest";
import {
  buildPersonnelFile,
  formatFileDate,
  personnelSignature,
  stripImportNotes,
} from "./personnel-file";

function groupById(record: Record<string, unknown>, id: string) {
  return buildPersonnelFile(record, (source, lookupId) =>
    source === "sites" && lookupId === "site-1" ? "Stuttgart" : undefined,
  ).find((g) => g.id === id);
}

describe("buildPersonnelFile", () => {
  it("drops sections whose fields are all blank", () => {
    const groups = buildPersonnelFile({ firstName: "Ada", lastName: "Byron" });
    expect(groups.map((g) => g.id)).toEqual(["identity"]);
    expect(groups[0]?.rows).toEqual([
      { label: "First name", value: "Ada", wide: false },
      { label: "Last name", value: "Byron", wide: false },
    ]);
  });

  it("resolves a lookup id through the catalog and prefers stored labels", () => {
    const rows = groupById(
      { siteId: "site-1", departmentId: "dept-9", departmentName: "Packing" },
      "assignment",
    )?.rows;
    expect(rows).toEqual([
      { label: "Location", value: "Stuttgart", wide: false },
      { label: "Department", value: "Packing", wide: false },
    ]);
  });

  it("uses free-text site/department from roster imports when FKs are blank", () => {
    expect(
      groupById({ site: "GREENVILLE", department: "GREENVILLE" }, "assignment")?.rows,
    ).toEqual([
      { label: "Location", value: "GREENVILLE", wide: false },
      { label: "Department", value: "GREENVILLE", wide: false },
    ]);
  });

  it("omits a lookup that resolves to nothing rather than showing the uuid", () => {
    const rows = groupById({ siteId: "site-unknown" }, "assignment");
    expect(rows).toBeUndefined();
  });

  it("shows the driver flag only when set", () => {
    expect(groupById({ isCompanyDriver: true }, "driver")?.rows).toEqual([
      { label: "Company or contract driver", value: "Yes", wide: false },
    ]);
    expect(groupById({ isCompanyDriver: false }, "driver")).toBeUndefined();
  });

  it("prefixes emergency contact columns and marks long text wide", () => {
    expect(groupById({ emergencyContact1Name: "Kay" }, "emergency")?.rows).toEqual([
      { label: "Contact 1 name", value: "Kay", wide: false },
    ]);
    expect(groupById({ notes: "Night shift" }, "notes")?.rows).toEqual([
      { label: "Notes", value: "Night shift", wide: true },
    ]);
  });

  it("keeps the date part of a hire date", () => {
    expect(groupById({ hireDate: "2024-03-04T00:00:00.000Z" }, "assignment")?.rows).toEqual([
      { label: "Hire date", value: "2024-03-04", wide: false },
    ]);
    expect(formatFileDate("not a date")).toBe("not a date");
  });

  it("never renders the signature as a text row", () => {
    expect(buildPersonnelFile({ signatureUrl: "data:image/png;base64,AAA" })).toEqual([]);
  });

  it("drops the notes section when it holds only import provenance", () => {
    expect(groupById({ notes: "Synced from employee roster (roster.xlsx)." }, "notes")).toBeUndefined();
  });
});

describe("stripImportNotes", () => {
  it("removes every sync sentence a repeatedly imported record accumulates", () => {
    const notes =
      "Synced from employee roster (ActiveEmpAllByJobDept6-29-26.xls). Department: STUTTGART " +
      "Synced from employee roster (ActiveEmpAllByJobDept6-29-26.xls). " +
      "Synced from employee roster (active_employees_by_department (7-22-26).csv). " +
      "Department: STUTTGART Synced from employee roster (26-08-01ActiveEmpAllforSafety.xlsx).";
    expect(stripImportNotes(notes)).toBe("");
  });

  it("keeps notes a person actually typed", () => {
    expect(stripImportNotes("Night shift only.")).toBe("Night shift only.");
    expect(
      stripImportNotes("Synced from employee roster (roster.xlsx). Needs respirator fit test."),
    ).toBe("Needs respirator fit test.");
  });
});

describe("personnelSignature", () => {
  it("returns the url when present", () => {
    expect(personnelSignature({ signatureUrl: "data:image/png;base64,AAA" })).toBe(
      "data:image/png;base64,AAA",
    );
    expect(personnelSignature({ signatureUrl: "  " })).toBeNull();
    expect(personnelSignature({})).toBeNull();
  });
});
