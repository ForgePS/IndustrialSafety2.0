import type { RollbackClassification } from "./adapter.js";

export type ExecutionResultSummary = {
  jobId: string;
  tenantId: string;
  productKey: string;
  moduleKey: string;
  recordType: string;
  adapterKey: string;
  adapterVersion: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  duplicateRows: number;
  retriedRows: number;
  cancelledRows: number;
  createdRecords: number;
  updatedRecords: number;
  unchangedRecords: number;
  rollbackClassificationSummary: Record<RollbackClassification, number>;
  errorReportRef: string | null;
  correlationId: string;
  executionImageVersion: string | null;
};

export function emptyRollbackSummary(): Record<RollbackClassification, number> {
  return {
    FULLY_REVERSIBLE: 0,
    COMPENSATING_ACTION: 0,
    MANUAL_REVIEW_REQUIRED: 0,
    NOT_REVERSIBLE: 0,
  };
}

export function buildExecutionResultSummary(
  input: Omit<ExecutionResultSummary, "durationMs"> & { durationMs?: number | null },
): ExecutionResultSummary {
  const started = input.startedAt ? Date.parse(input.startedAt) : NaN;
  const completed = input.completedAt ? Date.parse(input.completedAt) : NaN;
  const durationMs =
    input.durationMs ??
    (Number.isFinite(started) && Number.isFinite(completed)
      ? Math.max(0, completed - started)
      : null);
  return {
    ...input,
    durationMs,
  };
}

export function aggregateRollbackClassification(
  current: Record<RollbackClassification, number>,
  next: RollbackClassification,
): Record<RollbackClassification, number> {
  return { ...current, [next]: (current[next] ?? 0) + 1 };
}

export function classifyJobRollback(
  summary: Record<RollbackClassification, number>,
): RollbackClassification {
  if ((summary.NOT_REVERSIBLE ?? 0) > 0) return "NOT_REVERSIBLE";
  if ((summary.MANUAL_REVIEW_REQUIRED ?? 0) > 0) return "MANUAL_REVIEW_REQUIRED";
  if ((summary.COMPENSATING_ACTION ?? 0) > 0) return "COMPENSATING_ACTION";
  return "FULLY_REVERSIBLE";
}
