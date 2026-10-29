import { describe, expect, it } from "vitest";
import {
  buildFleetReportCsv,
  filterFleetReportRows,
  formatFleetReportCell,
  normalizeFleetReportFields,
} from "./fleet-reports";

describe("fleet-reports", () => {
  const sampleRows = [
    {
      id: "1",
      assetNumber: "100",
      make: "Ford",
      model: "F-150",
      status: "ACTIVE",
      insured: true,
      licensePlate: "ABC123",
    },
    {
      id: "2",
      assetNumber: "200",
      make: "Chevy",
      model: "Silverado",
      status: "REMOVED",
      insured: false,
      licensePlate: "XYZ999",
    },
  ];

  it("normalizes unknown or duplicate field ids", () => {
    expect(normalizeFleetReportFields(["make", "bogus", "make", "vin"])).toEqual(["make", "vin"]);
  });

  it("filters rows by status, insured, and search", () => {
    const activeOnly = filterFleetReportRows(sampleRows, {
      q: "",
      assetType: "",
      status: "ACTIVE",
      insured: "",
      includeRemoved: false,
    });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.assetNumber).toBe("100");

    const insuredOnly = filterFleetReportRows(sampleRows, {
      q: "",
      assetType: "",
      status: "",
      insured: "true",
      includeRemoved: true,
    });
    expect(insuredOnly).toHaveLength(1);

    const byPlate = filterFleetReportRows(sampleRows, {
      q: "xyz",
      assetType: "",
      status: "",
      insured: "",
      includeRemoved: true,
    });
    expect(byPlate).toHaveLength(1);
    expect(byPlate[0]?.licensePlate).toBe("XYZ999");
  });

  it("formats booleans and builds csv", () => {
    expect(formatFleetReportCell(true)).toBe("Yes");
    expect(formatFleetReportCell(false)).toBe("No");
    const csv = buildFleetReportCsv(sampleRows.slice(0, 1), ["assetNumber", "make", "insured"]);
    expect(csv).toContain('"Asset #"');
    expect(csv).toContain('"100"');
    expect(csv).toContain('"Yes"');
  });
});
