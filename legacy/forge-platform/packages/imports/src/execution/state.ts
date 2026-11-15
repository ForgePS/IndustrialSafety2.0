import type { ImportJobStatus } from "../types.js";

/** S5 execution-plane transitions. Invalid transitions throw IMPORT_INVALID_STATE_TRANSITION. */
export const S5_EXECUTION_TRANSITIONS: Record<string, ReadonlyArray<ImportJobStatus>> = {
  execute: ["APPROVED"],
  start_processing: ["QUEUED"],
  complete: ["PROCESSING"],
  complete_with_errors: ["PROCESSING"],
  fail: ["PROCESSING", "QUEUED"],
  cancel_queued: ["QUEUED"],
  cancel_processing: ["PROCESSING"],
  request_rollback: ["COMPLETED", "COMPLETED_WITH_ERRORS"],
  refuse_rollback: ["ROLLBACK_PENDING"],
};

export function assertS5Transition(
  action: keyof typeof S5_EXECUTION_TRANSITIONS,
  current: ImportJobStatus,
): void {
  const allowed = S5_EXECUTION_TRANSITIONS[action] ?? [];
  if (!allowed.includes(current)) {
    const error = new Error(`Import job status '${current}' does not allow action '${action}'`);
    (error as Error & { code: string }).code = "IMPORT_INVALID_STATE_TRANSITION";
    throw error;
  }
}

export function nextStatusForS5Action(
  action: keyof typeof S5_EXECUTION_TRANSITIONS,
  current: ImportJobStatus,
): ImportJobStatus {
  assertS5Transition(action, current);
  switch (action) {
    case "execute":
      return "QUEUED";
    case "start_processing":
      return "PROCESSING";
    case "complete":
      return "COMPLETED";
    case "complete_with_errors":
      return "COMPLETED_WITH_ERRORS";
    case "fail":
      return "FAILED";
    case "cancel_queued":
    case "cancel_processing":
      return "CANCELLED";
    case "request_rollback":
      return "ROLLBACK_PENDING";
    case "refuse_rollback":
      return "ROLLBACK_REFUSED";
    default:
      return current;
  }
}

export function terminalExecutionStatus(
  successful: number,
  failed: number,
  cancelled: number,
  total: number,
): ImportJobStatus {
  if (cancelled > 0 && successful === 0 && failed === 0) return "CANCELLED";
  if (failed > 0 && successful === 0 && successful + failed + cancelled >= total) return "FAILED";
  if (failed > 0 || cancelled > 0) return "COMPLETED_WITH_ERRORS";
  return "COMPLETED";
}
