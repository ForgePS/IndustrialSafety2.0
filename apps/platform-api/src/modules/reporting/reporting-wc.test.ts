import { describe, expect, it } from "vitest";
import {
  aggregateReportRows,
  projectReportFields,
  resolveRelativeDateRange,
} from "./reporting-adapters.js";
import { getReportDataset, listReportDatasets } from "./reporting-registry.js";
import { builtinByKey, BUILTIN_REPORTS } from "./reporting-catalog.js";

describe("resolveRelativeDateRange", () => {
  it("resolves last_7_days", () => {
    const now = new Date("2026-09-08T15:00:00.000Z");
    const resolved = resolveRelativeDateRange({ relativeDateRange: "last_7_days", limit: 10 }, now);
    expect(resolved.dateFrom).toBe("2026-09-02T00:00:00.000Z");
    expect(resolved.dateTo).toBe("2026-09-08T23:59:59.999Z");
    expect(resolved.relativeDateRange).toBeUndefined();
  });

  it("resolves prior_month", () => {
    const now = new Date("2026-09-08T15:00:00.000Z");
    const resolved = resolveRelativeDateRange({ relativeDateRange: "prior_month" }, now);
    expect(resolved.dateFrom).toBe("2026-08-01T00:00:00.000Z");
    expect(resolved.dateTo?.startsWith("2026-08-31")).toBe(true);
  });
});

describe("projectReportFields / aggregateReportRows", () => {
  const columns = [
    { key: "status", label: "Status" },
    { key: "workerName", label: "Employee" },
    { key: "count", label: "Count" },
  ];
  const rows = [
    { status: "OPEN", workerName: "A", count: 1 },
    { status: "OPEN", workerName: "B", count: 1 },
    { status: "CLOSED", workerName: "C", count: 1 },
  ];

  it("projects selected fields", () => {
    const projected = projectReportFields(columns, rows, ["status", "workerName"]);
    expect(projected.columns.map((c) => c.key)).toEqual(["status", "workerName"]);
    expect(projected.rows[0]).toEqual({ status: "OPEN", workerName: "A" });
  });

  it("aggregates counts by group", () => {
    const aggregated = aggregateReportRows(columns, rows, "status", "count");
    expect(aggregated.columns.map((c) => c.key)).toEqual(["status", "count"]);
    expect(aggregated.rows).toEqual([
      { status: "OPEN", count: 2 },
      { status: "CLOSED", count: 1 },
    ]);
  });
});

describe("reporting registry", () => {
  it("includes workers comp datasets", () => {
    const items = listReportDatasets();
    expect(items.some((d) => d.key === "workers_comp.open_cases")).toBe(true);
    expect(getReportDataset("workers_comp.medical_encounters")?.fields.length).toBeGreaterThan(3);
  });

  it("includes LOTO datasets", () => {
    expect(listReportDatasets().some((d) => d.key === "loto.procedures_inventory")).toBe(true);
    expect(getReportDataset("loto.open_lockouts")?.fields.length).toBeGreaterThan(3);
    expect(builtinByKey("loto.energy_type_coverage")?.category).toBe("LOTO");
  });

  it("catalog includes WorkersComp category", () => {
    expect(BUILTIN_REPORTS.some((r) => r.category === "WorkersComp")).toBe(true);
    expect(builtinByKey("workers_comp.by_status")?.name).toContain("Status");
  });

  it("includes the Workers' Comp weekly status report", () => {
    expect(builtinByKey("workers_comp.weekly_status")?.modulePermission).toBe(
      "industrial.workers_comp.view",
    );
    expect(getReportDataset("workers_comp.weekly_status")?.fields.map((f) => f.key)).toContain(
      "weeklyNotes",
    );
  });
});
