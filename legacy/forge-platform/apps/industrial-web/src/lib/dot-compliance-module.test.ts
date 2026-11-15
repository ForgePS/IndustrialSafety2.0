import { describe, expect, it } from "vitest";
import {
  buildDotProfileView,
  collapseDotDriverProfiles,
  dotFileHref,
  dotListHref,
  dotRecordCategory,
  dotStatusBadgeClass,
  dotStatusRowClass,
  filterDotRecords,
  isDotRecordOpen,
  isIndustrialRecordUuid,
  mergeDotProfileRecords,
  normalizeDotPersonName,
  parseDotTab,
  sortDotRecords,
  summarizeDotRecords,
} from "./dot-compliance-module";

describe("dot-compliance-module", () => {
  it("infers category from payload and source path", () => {
    expect(dotRecordCategory({ category: "drivers", dqf: true })).toBe("drivers");
    expect(dotRecordCategory({ category: "drivers" })).toBe("other");
    expect(dotRecordCategory({ sourceCollection: "dot-compliance/drivers", dqf: true })).toBe(
      "drivers",
    );
    expect(dotRecordCategory({ sourcePath: "dot-compliance/drivers-dqf/emp-1", dqf: true })).toBe(
      "drivers",
    );
    expect(dotRecordCategory({ sourcePath: "dot-compliance/vehicles/vin-1" })).toBe("vehicles");
    expect(dotRecordCategory({ title: "Pre-trip DVIR Unit 12" })).toBe("dvirs");
    expect(dotRecordCategory({ category: "roadside" })).toBe("roadside");
    expect(dotRecordCategory({ title: "DOT accident — I-40" })).toBe("accidents");
    expect(dotRecordCategory({ sourcePath: "dot-compliance/drug-alcohol/clearinghouse" })).toBe(
      "drug-alcohol",
    );
    expect(dotRecordCategory({ title: "Misc" })).toBe("other");
    expect(
      dotRecordCategory({
        category: "drivers",
        sourceCollection: "companyVehicleDrivers",
        seededFrom: "industrial_fleet_drivers",
      }),
    ).toBe("other");
    expect(
      dotRecordCategory({
        category: "drivers",
        sourceDocumentId: "DRV-2026-0005",
        title: "DON D BAITY",
      }),
    ).toBe("drivers");
  });

  it("computes compliance summary", () => {
    const summary = summarizeDotRecords([
      { status: "OPEN", category: "drivers", dqf: true },
      { status: "CLOSED", category: "vehicles" },
      { status: "ACTIVE", category: "company" },
    ]);
    expect(summary.total).toBe(3);
    expect(summary.open).toBe(2);
    expect(summary.complianceScore).toBe(33);
    expect(summary.byCategory.drivers).toBe(1);
  });

  it("filters by tab, status, and search", () => {
    const rows = [
      { title: "John CDL", status: "OPEN", category: "drivers", dqf: true },
      { title: "Unit 12 DVIR", status: "ACTIVE", category: "dvirs" },
    ];
    expect(filterDotRecords(rows, { tab: "drivers" })).toHaveLength(1);
    expect(filterDotRecords(rows, { tab: "dvirs" })).toHaveLength(1);
    expect(filterDotRecords(rows, { tab: "dashboard", status: "ACTIVE" })).toHaveLength(1);
    expect(filterDotRecords(rows, { tab: "dashboard", q: "cdl" })).toHaveLength(1);
  });

  it("applies personnel-style name sort after filtering", () => {
    const rows = [
      {
        id: "c",
        title: "Cody Alvarez",
        workerName: "Cody Alvarez",
        category: "drivers",
        dqf: true,
        status: "OPEN",
      },
      {
        id: "a",
        title: "aaron Tucker",
        workerName: "aaron Tucker",
        category: "drivers",
        dqf: true,
        status: "OPEN",
      },
      {
        id: "b",
        title: "Bea Nguyen",
        workerName: "Bea Nguyen",
        category: "vehicles",
        status: "OPEN",
      },
    ];
    expect(filterDotRecords(rows, { tab: "drivers", sort: "firstName" }).map((r) => r.id)).toEqual([
      "a",
      "c",
    ]);
    expect(filterDotRecords(rows, { tab: "dashboard", sort: "lastName" }).map((r) => r.id)).toEqual(
      ["c", "b", "a"],
    );
  });

  it("treats closed statuses as not open", () => {
    expect(isDotRecordOpen("CLOSED")).toBe(false);
    expect(isDotRecordOpen("COMPLETED")).toBe(false);
    expect(isDotRecordOpen("OPEN")).toBe(true);
  });

  it("sorts by first and last name like personnel", () => {
    const rows = [
      { id: "c", title: "Cody Alvarez", workerName: "Cody Alvarez" },
      { id: "a", title: "aaron Tucker", workerName: "aaron Tucker" },
      { id: "b", title: "Bea Nguyen", workerName: "Bea Nguyen" },
    ];
    expect(sortDotRecords(rows, "firstName").map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortDotRecords(rows, "lastName").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("uses first/last columns when present, otherwise display name words", () => {
    const rows = [
      { id: "2", firstName: "Zoe", lastName: "Smith", title: "Zoe Smith" },
      { id: "1", firstName: "Abe", lastName: "Smith", title: "Abe Smith" },
    ];
    expect(sortDotRecords(rows, "lastName").map((r) => r.id)).toEqual(["1", "2"]);
    expect(
      sortDotRecords(
        [
          { id: "x", title: "Wanda Zeller" },
          { id: "y", title: "Amos Baker" },
        ],
        "firstName",
      ).map((r) => r.id),
    ).toEqual(["y", "x"]);
  });

  it("builds a DOT file URL like the personnel file", () => {
    expect(dotFileHref("a b/c")).toBe("/modules/dot-compliance/file/?id=a+b%2Fc");
    expect(dotFileHref("drv-1", { focus: "mvrAnnual" })).toBe(
      "/modules/dot-compliance/file/?id=drv-1&focus=mvrAnnual",
    );
    expect(dotListHref("drivers")).toBe("/modules/dot-compliance/?tab=drivers");
    expect(dotListHref("reports")).toBe("/modules/dot-compliance/?tab=reports");
    expect(parseDotTab("reports")).toBe("reports");
  });

  it("treats Last, First and case variants as the same person name", () => {
    expect(normalizeDotPersonName("Smith, John")).toBe(normalizeDotPersonName("JOHN SMITH"));
    expect(normalizeDotPersonName("John  Smith")).toBe("john smith");
  });

  it("combines duplicate driver names into one profile", () => {
    const rows = [
      {
        id: "d2",
        category: "drivers",
        dqf: true,
        workerName: "JOHN SMITH",
        status: "OPEN",
        licenseNumber: "A1",
      },
      {
        id: "d1",
        category: "drivers",
        dqf: true,
        title: "Smith, John",
        workerName: "Smith, John",
        status: "ACTIVE",
        employeeNumber: "88",
      },
      { id: "v1", category: "vehicles", title: "Unit 12", workerName: "John Smith" },
    ];
    const drivers = collapseDotDriverProfiles(rows);
    expect(drivers).toHaveLength(1);
    expect(drivers[0]?.profileRecordCount).toBe(2);
    expect(drivers[0]?.licenseNumber).toBe("A1");
    expect(drivers[0]?.employeeNumber).toBe("88");
    expect(filterDotRecords(rows, { tab: "drivers" })).toHaveLength(1);
    expect(filterDotRecords(rows, { tab: "vehicles" })).toHaveLength(1);

    const summary = summarizeDotRecords(rows);
    expect(summary.byCategory.drivers).toBe(1);
    expect(summary.total).toBe(2);

    const view = buildDotProfileView(rows[1]!, rows);
    expect(view.record.licenseNumber).toBe("A1");
    expect(view.record.employeeNumber).toBe("88");
    expect(view.related.map((r) => r.id)).toEqual(["v1"]);
  });

  it("merges filled fields from older and newer duplicate rows", () => {
    const merged = mergeDotProfileRecords([
      {
        id: "a",
        category: "drivers",
        dqf: true,
        workerName: "Ada Byron",
        licenseNumber: "L1",
        updatedAt: "2024-01-01",
      },
      {
        id: "b",
        category: "drivers",
        dqf: true,
        workerName: "Ada Byron",
        initialMvrDate: "2025-06-01",
        updatedAt: "2025-01-01",
      },
    ]);
    expect(merged.licenseNumber).toBe("L1");
    expect(merged.initialMvrDate).toBe("2025-06-01");
    expect(merged.id).toBe("a");
  });

  it("recognizes uuid record ids for personnel deep links", () => {
    expect(isIndustrialRecordUuid("8fa6a3b8-c476-6225-2f50-040b90520c96")).toBe(true);
    expect(isIndustrialRecordUuid("itM30cWv8P6pUtkL1JDV")).toBe(false);
  });

  it("maps Non-Compliant and Compliant badge tones", () => {
    expect(dotStatusBadgeClass("Non-Compliant")).toBe("bg-label-danger");
    expect(dotStatusBadgeClass("Compliant")).toBe("bg-label-info");
    expect(dotStatusBadgeClass("Expired")).toBe("bg-label-danger");
    expect(dotStatusRowClass("Non-Compliant")).toBe("bg-label-danger");
  });
});
