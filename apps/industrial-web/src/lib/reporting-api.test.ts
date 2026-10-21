import { describe, expect, it } from "vitest";
import { formatReportCell, toReportDateTime, chartSeriesFromResult } from "./reporting-api";

describe("toReportDateTime", () => {
  it("returns undefined for blank input", () => {
    expect(toReportDateTime("")).toBeUndefined();
    expect(toReportDateTime("   ")).toBeUndefined();
  });

  it("converts date-only to start/end ISO datetimes", () => {
    expect(toReportDateTime("2026-09-01", false)).toBe("2026-09-01T00:00:00.000Z");
    expect(toReportDateTime("2026-09-01", true)).toBe("2026-09-01T23:59:59.999Z");
  });

  it("passes through values that already include time", () => {
    expect(toReportDateTime("2026-09-01T12:00:00.000Z")).toBe("2026-09-01T12:00:00.000Z");
  });
});

describe("formatReportCell", () => {
  it("formats primitives and nulls", () => {
    expect(formatReportCell(null)).toBe("—");
    expect(formatReportCell(true)).toBe("Yes");
    expect(formatReportCell(false)).toBe("No");
    expect(formatReportCell(12)).toBe("12");
    expect(formatReportCell({ a: 1 })).toBe('{"a":1}');
  });
});

describe("chartSeriesFromResult", () => {
  it("builds series from status/count rows", () => {
    const series = chartSeriesFromResult({
      executionId: "e1",
      reportKey: "workers_comp.by_status",
      reportName: "By status",
      columns: [
        { key: "status", label: "Status" },
        { key: "count", label: "Count" },
      ],
      rows: [
        { status: "OPEN", count: 3 },
        { status: "CLOSED", count: 1 },
      ],
    });
    expect(series).toEqual([
      { label: "OPEN", value: 3 },
      { label: "CLOSED", value: 1 },
    ]);
  });
});
