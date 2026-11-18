import { describe, expect, it } from "vitest";
import { ReferenceImportAdapter } from "./index.js";

describe("S5 performance smoke (reference adapter)", () => {
  it("processes 500 synthetic records within development bound", async () => {
    const adapter = new ReferenceImportAdapter();
    const ctx = {
      tenantId: "t",
      jobId: "j",
      batchId: "b",
      correlationId: "c",
      productCode: "reference",
      moduleCode: "generic",
      recordType: "record",
      mappingSnapshot: [],
      workerId: "w",
      attempt: 1,
    };
    const started = Date.now();
    for (let i = 0; i < 500; i += 1) {
      const result = await adapter.executeRecord(
        { rowId: `r${i}`, sourceRowKey: String(i), mapped: { n: i } },
        ctx,
      );
      expect(result.outcome).toBe("CREATED");
    }
    const elapsedMs = Date.now() - started;
    const rowsPerSecond = 500 / (elapsedMs / 1000);
    expect(elapsedMs).toBeLessThan(15_000);
    expect(rowsPerSecond).toBeGreaterThan(20);
  });

  it("processes 5_000 synthetic records without adapter regression", async () => {
    const adapter = new ReferenceImportAdapter();
    const ctx = {
      tenantId: "t",
      jobId: "j",
      batchId: "b",
      correlationId: "c",
      productCode: "reference",
      moduleCode: "generic",
      recordType: "record",
      mappingSnapshot: [],
      workerId: "w",
      attempt: 1,
    };
    const started = Date.now();
    for (let i = 0; i < 5_000; i += 1) {
      const result = await adapter.executeRecord(
        { rowId: `r${i}`, sourceRowKey: String(i), mapped: { n: i } },
        ctx,
      );
      expect(result.outcome).toBe("CREATED");
    }
    const elapsedMs = Date.now() - started;
    const rowsPerSecond = 5_000 / (elapsedMs / 1000);
    // In-process bound only — not Aurora evidence.
    expect(elapsedMs).toBeLessThan(60_000);
    expect(rowsPerSecond).toBeGreaterThan(50);
  }, 90_000);
});
