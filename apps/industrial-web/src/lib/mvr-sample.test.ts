import { describe, expect, it } from "vitest";
import {
  appendMvrAuditEntry,
  isEligibleForMvrSample,
  mvrSampleSize,
  parseMvrAuditHistory,
  selectMvrSampleIds,
} from "./mvr-sample";

describe("mvr-sample", () => {
  it("sizes the annual pull at about 10% with a floor of one", () => {
    expect(mvrSampleSize(0)).toBe(0);
    expect(mvrSampleSize(1)).toBe(1);
    expect(mvrSampleSize(9)).toBe(1);
    expect(mvrSampleSize(10)).toBe(1);
    expect(mvrSampleSize(11)).toBe(2);
    expect(mvrSampleSize(100)).toBe(10);
  });

  it("excludes removed and suspended drivers", () => {
    expect(isEligibleForMvrSample("on_insurance")).toBe(true);
    expect(isEligibleForMvrSample("pending_mvr")).toBe(true);
    expect(isEligibleForMvrSample("removed")).toBe(false);
    expect(isEligibleForMvrSample("suspended")).toBe(false);
  });

  it("selects a deterministic 10% sample for a year", () => {
    const drivers = Array.from({ length: 20 }, (_, i) => ({
      id: `d${String(i + 1).padStart(2, "0")}`,
      status: "on_insurance",
      sampleYear: null as number | null,
    }));
    const first = selectMvrSampleIds(drivers, 2026);
    const second = selectMvrSampleIds(drivers, 2026);
    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
  });

  it("parses and prepends audit history entries", () => {
    const history = appendMvrAuditEntry(
      [{ year: 2025, auditedAt: "2025-03-01T00:00:00.000Z", auditedByName: "A", driverId: "d1" }],
      {
        year: 2026,
        auditedAt: "2026-08-20T00:00:00.000Z",
        auditedByName: "B",
        driverId: "d2",
        notes: "Clean",
      },
    );
    expect(history[0]?.year).toBe(2026);
    expect(parseMvrAuditHistory(history)).toHaveLength(2);
  });
});
