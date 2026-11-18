import { createHash, randomUUID } from "node:crypto";
import type {
  AdapterBatchContext,
  AdapterExecutionContext,
  ImportRecordAdapter,
  ImportRecordResult,
  NormalizedImportRecord,
  RollbackClassification,
} from "./adapter.js";

/** Neutral reference adapter for S5 tests and development. No product tables. */
export class ReferenceImportAdapter implements ImportRecordAdapter {
  readonly key: string;
  readonly version = "1";
  private readonly committed = new Map<string, string>();

  constructor(key = "reference:generic:record@1") {
    this.key = key;
  }

  async validateExecutionContext(context: AdapterExecutionContext): Promise<void> {
    if (!context.tenantId || !context.jobId) {
      const error = new Error("Invalid execution context");
      (error as Error & { failureClass: string }).failureClass = "NON_RETRIABLE_JOB";
      throw error;
    }
  }

  async prepareBatch(context: AdapterBatchContext): Promise<AdapterBatchContext> {
    return context;
  }

  async executeRecord(
    record: NormalizedImportRecord,
    context: AdapterExecutionContext,
  ): Promise<ImportRecordResult> {
    const idempotency = `${context.tenantId}:${context.jobId}:${record.sourceRowKey}`;
    const existing = this.committed.get(idempotency);
    if (existing) {
      return {
        outcome: "UNCHANGED",
        destinationRecordId: existing,
        operationType: "UPSERT",
        rollbackClassification: "FULLY_REVERSIBLE",
        afterRef: { destinationRecordId: existing },
      };
    }

    if (record.mapped?.__fail === true) {
      return {
        outcome: "FAILED",
        operationType: "UPSERT",
        rollbackClassification: "NOT_REVERSIBLE",
        failureClass: "NON_RETRIABLE_ROW",
        errorCode: "REFERENCE_ADAPTER_REJECTED",
        errorMessage: "Reference adapter rejected row",
      };
    }

    if (record.mapped?.__duplicate === true) {
      return {
        outcome: "DUPLICATE",
        destinationRecordId: String(record.mapped.existingId ?? "dup"),
        operationType: "SKIP",
        rollbackClassification: "NOT_REVERSIBLE",
      };
    }

    const destinationRecordId = randomUUID();
    this.committed.set(idempotency, destinationRecordId);
    const contentHash = createHash("sha256")
      .update(JSON.stringify(record.mapped))
      .digest("hex")
      .slice(0, 32);

    return {
      outcome: "CREATED",
      destinationRecordId,
      operationType: "CREATE",
      rollbackClassification: "FULLY_REVERSIBLE",
      beforeRef: {},
      afterRef: { destinationRecordId, contentHash },
      compensation: { action: "DELETE", destinationRecordId },
    };
  }

  classifyRollback(result: ImportRecordResult): RollbackClassification {
    return result.rollbackClassification;
  }

  /** Test helper — clear in-memory commits. */
  reset(): void {
    this.committed.clear();
  }
}
