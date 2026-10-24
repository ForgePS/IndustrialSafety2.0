import type { FailureClass, ImportRecordResult, RollbackClassification } from "./adapter.js";
import { classifyJobRollback, emptyRollbackSummary } from "./results.js";
import { terminalExecutionStatus } from "./state.js";
import type { ImportJobStatus } from "../types.js";

export type LockAcquisition = {
  acquired: boolean;
  reason?: "ALREADY_OWNED" | "HELD_BY_OTHER" | "NOT_EXECUTABLE" | "CANCELLED";
};

export function isLockExpired(
  expiresAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!expiresAt) return true;
  const ts = typeof expiresAt === "string" ? Date.parse(expiresAt) : expiresAt.getTime();
  return !Number.isFinite(ts) || ts <= now.getTime();
}

export function nextLockExpiry(ttlMs = 5 * 60_000, now = new Date()): Date {
  return new Date(now.getTime() + ttlMs);
}

export function rowOutcomeToCounters(result: ImportRecordResult): {
  successful: number;
  failed: number;
  skipped: number;
  duplicate: number;
  created: number;
  updated: number;
  unchanged: number;
} {
  switch (result.outcome) {
    case "CREATED":
      return {
        successful: 1,
        failed: 0,
        skipped: 0,
        duplicate: 0,
        created: 1,
        updated: 0,
        unchanged: 0,
      };
    case "UPDATED":
      return {
        successful: 1,
        failed: 0,
        skipped: 0,
        duplicate: 0,
        created: 0,
        updated: 1,
        unchanged: 0,
      };
    case "UNCHANGED":
      return {
        successful: 1,
        failed: 0,
        skipped: 0,
        duplicate: 0,
        created: 0,
        updated: 0,
        unchanged: 1,
      };
    case "SKIPPED":
      return {
        successful: 0,
        failed: 0,
        skipped: 1,
        duplicate: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
      };
    case "DUPLICATE":
      return {
        successful: 0,
        failed: 0,
        skipped: 0,
        duplicate: 1,
        created: 0,
        updated: 0,
        unchanged: 0,
      };
    case "FAILED":
      return {
        successful: 0,
        failed: 1,
        skipped: 0,
        duplicate: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
      };
    default:
      return {
        successful: 0,
        failed: 1,
        skipped: 0,
        duplicate: 0,
        created: 0,
        updated: 0,
        unchanged: 0,
      };
  }
}

export function finalizeJobStatus(input: {
  successful: number;
  failed: number;
  cancelled: number;
  total: number;
  jobFailure?: FailureClass | null;
}): ImportJobStatus {
  if (input.jobFailure === "SECURITY_FAILURE" || input.jobFailure === "NON_RETRIABLE_JOB") {
    return "FAILED";
  }
  return terminalExecutionStatus(input.successful, input.failed, input.cancelled, input.total);
}

export function summarizeRollbackFromResults(classifications: RollbackClassification[]): {
  summary: Record<RollbackClassification, number>;
  jobClassification: RollbackClassification;
} {
  const summary = emptyRollbackSummary();
  for (const c of classifications) {
    summary[c] += 1;
  }
  return { summary, jobClassification: classifyJobRollback(summary) };
}

export function journalIdempotencyKey(input: {
  tenantId: string;
  jobId: string;
  rowId: string;
  adapterKey: string;
}): string {
  return `exec:${input.tenantId}:${input.jobId}:${input.rowId}:${input.adapterKey}`;
}
