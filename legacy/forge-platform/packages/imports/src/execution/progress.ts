export type RowCountSnapshot = {
  total: number;
  pending: number;
  processing: number;
  successful: number;
  failed: number;
  skipped: number;
  duplicate: number;
  retried: number;
  cancelled: number;
};

export type ProgressInput = {
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  duplicateRows: number;
  cancelledRows: number;
  currentBatch: number;
  totalBatches: number;
  finalized: boolean;
};

export type ProgressView = {
  totalRows: number;
  processedRows: number;
  successfulRows: number;
  failedRows: number;
  skippedRows: number;
  duplicateRows: number;
  cancelledRows: number;
  percentComplete: number;
  currentBatch: number;
  totalBatches: number;
};

export function emptyRowCounts(total = 0): RowCountSnapshot {
  return {
    total,
    pending: total,
    processing: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    duplicate: 0,
    retried: 0,
    cancelled: 0,
  };
}

export function computeProgress(input: ProgressInput): ProgressView {
  const totalRows = Math.max(0, input.totalRows);
  const processedRows = Math.min(
    totalRows,
    Math.max(
      0,
      input.successfulRows +
        input.failedRows +
        input.skippedRows +
        input.duplicateRows +
        input.cancelledRows,
    ),
  );
  let percentComplete = 0;
  if (totalRows === 0 && input.finalized) {
    percentComplete = 100;
  } else if (totalRows > 0) {
    percentComplete = Math.min(99, Math.floor((processedRows / totalRows) * 100));
    if (input.finalized && processedRows >= totalRows) {
      percentComplete = 100;
    }
  }
  return {
    totalRows,
    processedRows,
    successfulRows: input.successfulRows,
    failedRows: input.failedRows,
    skippedRows: input.skippedRows,
    duplicateRows: input.duplicateRows,
    cancelledRows: input.cancelledRows,
    percentComplete,
    currentBatch: Math.max(0, input.currentBatch),
    totalBatches: Math.max(0, input.totalBatches),
  };
}

export const DEFAULT_EXECUTION_BATCH_SIZE = 50;
export const MAX_EXECUTION_BATCH_SIZE = 500;
export const MIN_EXECUTION_BATCH_SIZE = 1;

export function resolveBatchSize(requested?: number): number {
  if (requested == null || Number.isNaN(requested)) return DEFAULT_EXECUTION_BATCH_SIZE;
  return Math.min(
    MAX_EXECUTION_BATCH_SIZE,
    Math.max(MIN_EXECUTION_BATCH_SIZE, Math.floor(requested)),
  );
}
