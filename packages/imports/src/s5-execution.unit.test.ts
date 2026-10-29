import { describe, expect, it } from "vitest";
import {
  assertS5Transition,
  computeProgress,
  computeExecutionRetryDelayMs,
  createImportExecuteMessage,
  finalizeJobStatus,
  ImportAdapterRegistry,
  isLockExpired,
  journalIdempotencyKey,
  nextStatusForS5Action,
  ReferenceImportAdapter,
  resolveBatchSize,
  shouldRetryFailure,
  summarizeRollbackFromResults,
  validateImportExecuteMessage,
} from "./index.js";

describe("S5 execution state", () => {
  it("transitions APPROVED to QUEUED", () => {
    expect(nextStatusForS5Action("execute", "APPROVED")).toBe("QUEUED");
  });

  it("rejects invalid execute transition", () => {
    expect(() => assertS5Transition("execute", "MAPPED")).toThrow(/does not allow/);
  });

  it("finalizes COMPLETED_WITH_ERRORS on partial failure", () => {
    expect(finalizeJobStatus({ successful: 2, failed: 1, cancelled: 0, total: 3 })).toBe(
      "COMPLETED_WITH_ERRORS",
    );
  });
});

describe("S5 queue message", () => {
  it("creates and validates execute message", () => {
    const msg = createImportExecuteMessage({
      jobId: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      requestedBy: "33333333-3333-4333-8333-333333333333",
      correlationId: "corr-1",
      idempotencyKey: "idem-1",
    });
    expect(msg.messageType).toBe("IMPORT_EXECUTE");
    expect(validateImportExecuteMessage(msg).ok).toBe(true);
  });

  it("rejects malformed message", () => {
    const result = validateImportExecuteMessage({ schemaVersion: "9" });
    expect(result.ok).toBe(false);
  });
});

describe("S5 adapter registry + reference adapter", () => {
  it("resolves registered adapter without product conditionals", async () => {
    const registry = new ImportAdapterRegistry();
    const adapter = new ReferenceImportAdapter("reference:generic:record@1");
    registry.register(adapter);
    const resolved = registry.resolve("reference:generic:record@1");
    const result = await resolved.executeRecord(
      { rowId: "r1", sourceRowKey: "1", mapped: { name: "A" } },
      {
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
      },
    );
    expect(result.outcome).toBe("CREATED");
    expect(result.destinationRecordId).toBeTruthy();
  });

  it("is idempotent on duplicate execute", async () => {
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
    const record = { rowId: "r1", sourceRowKey: "1", mapped: { name: "A" } };
    const first = await adapter.executeRecord(record, ctx);
    const second = await adapter.executeRecord(record, ctx);
    expect(first.outcome).toBe("CREATED");
    expect(second.outcome).toBe("UNCHANGED");
    expect(second.destinationRecordId).toBe(first.destinationRecordId);
  });
});

describe("S5 progress retry rollback helpers", () => {
  it("keeps percent under 100 until finalized", () => {
    expect(
      computeProgress({
        totalRows: 10,
        processedRows: 10,
        successfulRows: 10,
        failedRows: 0,
        skippedRows: 0,
        duplicateRows: 0,
        cancelledRows: 0,
        currentBatch: 1,
        totalBatches: 1,
        finalized: false,
      }).percentComplete,
    ).toBe(99);
    expect(
      computeProgress({
        totalRows: 10,
        processedRows: 10,
        successfulRows: 10,
        failedRows: 0,
        skippedRows: 0,
        duplicateRows: 0,
        cancelledRows: 0,
        currentBatch: 1,
        totalBatches: 1,
        finalized: true,
      }).percentComplete,
    ).toBe(100);
  });

  it("bounds retries and delay", () => {
    expect(shouldRetryFailure("RETRIABLE", 2)).toBe(true);
    expect(shouldRetryFailure("RETRIABLE", 3)).toBe(false);
    expect(shouldRetryFailure("NON_RETRIABLE_ROW", 1)).toBe(false);
    expect(computeExecutionRetryDelayMs(1, undefined, () => 0)).toBeGreaterThan(0);
  });

  it("classifies rollback and lock expiry", () => {
    const { jobClassification } = summarizeRollbackFromResults([
      "FULLY_REVERSIBLE",
      "MANUAL_REVIEW_REQUIRED",
    ]);
    expect(jobClassification).toBe("MANUAL_REVIEW_REQUIRED");
    expect(isLockExpired(new Date(Date.now() - 1000))).toBe(true);
    expect(resolveBatchSize(9999)).toBe(500);
    expect(
      journalIdempotencyKey({ tenantId: "t", jobId: "j", rowId: "r", adapterKey: "a" }),
    ).toContain("exec:");
  });
});
