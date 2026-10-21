import { describe, expect, it } from "vitest";
import {
  appendMvrAuditEntry,
  mergeMvrAuditHistories,
  mvrSampleSize,
  selectMvrSampleIds,
} from "./mvr-sample.js";

describe("mvr-sample helpers", () => {
  it("computes 10% sample sizes", () => {
    expect(mvrSampleSize(0)).toBe(0);
    expect(mvrSampleSize(25)).toBe(3);
  });

  it("returns a stable selection for the same year", () => {
    const drivers = [
      { id: "a", status: "on_insurance", sampleYear: null },
      { id: "b", status: "pending_mvr", sampleYear: null },
      { id: "c", status: "removed", sampleYear: null },
      { id: "d", status: "on_insurance", sampleYear: null },
      { id: "e", status: "suspended", sampleYear: null },
      { id: "f", status: "on_insurance", sampleYear: null },
      { id: "g", status: "on_insurance", sampleYear: null },
      { id: "h", status: "on_insurance", sampleYear: null },
      { id: "i", status: "on_insurance", sampleYear: null },
      { id: "j", status: "on_insurance", sampleYear: null },
    ];
    const ids = selectMvrSampleIds(drivers, 2026);
    expect(ids).toHaveLength(1);
    expect(selectMvrSampleIds(drivers, 2026)).toEqual(ids);
    expect(ids.every((id) => id !== "c" && id !== "e")).toBe(true);
  });

  it("prepends audit history", () => {
    const next = appendMvrAuditEntry([], {
      year: 2026,
      auditedAt: "2026-08-20T12:00:00.000Z",
      auditedByName: "Auditor",
      driverId: "d1",
      notes: "",
    });
    expect(next).toHaveLength(1);
    expect(next[0]?.year).toBe(2026);
  });

  it("merges personnel and driver audit histories without duplicates", () => {
    const shared = {
      year: 2026,
      auditedAt: "2026-08-20T12:00:00.000Z",
      auditedByName: "Auditor",
      driverId: "d1",
      notes: "",
    };
    const older = {
      year: 2025,
      auditedAt: "2025-04-01T00:00:00.000Z",
      auditedByName: "Prior",
      driverId: "d1",
      notes: "prior year",
    };
    const merged = mergeMvrAuditHistories([shared], [shared, older]);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.year).toBe(2026);
    expect(merged[1]?.year).toBe(2025);
  });
});
