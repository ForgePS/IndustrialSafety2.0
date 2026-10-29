export type ImportJobFilterState = {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  productKey?: string;
  moduleKey?: string;
  recordCategory?: string;
  sort?: "createdAt" | "updatedAt" | "displayName" | "status";
  sortDir?: "asc" | "desc";
};

export function serializeJobFilters(
  filters: ImportJobFilterState,
): Record<string, string | undefined> {
  return {
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    search: filters.search,
    status: filters.status,
    productKey: filters.productKey,
    moduleKey: filters.moduleKey,
    recordCategory: filters.recordCategory,
    sort: filters.sort ?? "createdAt",
    sortDir: filters.sortDir ?? "desc",
  };
}

export function dashboardStatusBuckets(statuses: string[]): Record<string, number> {
  const counts: Record<string, number> = {
    active: 0,
    awaitingMapping: 0,
    awaitingApproval: 0,
    processing: 0,
    completed: 0,
    completedWithErrors: 0,
    failed: 0,
    quarantined: 0,
    scanFailed: 0,
    rollbackPending: 0,
  };
  for (const status of statuses) {
    if (
      [
        "UPLOADED",
        "SCANNING",
        "READY_FOR_MAPPING",
        "MAPPED",
        "VALIDATING",
        "PREVIEW_READY",
      ].includes(status)
    ) {
      counts.active = (counts.active ?? 0) + 1;
    }
    if (status === "READY_FOR_MAPPING") counts.awaitingMapping = (counts.awaitingMapping ?? 0) + 1;
    if (status === "AWAITING_APPROVAL")
      counts.awaitingApproval = (counts.awaitingApproval ?? 0) + 1;
    if (status === "QUEUED" || status === "PROCESSING")
      counts.processing = (counts.processing ?? 0) + 1;
    if (status === "COMPLETED") counts.completed = (counts.completed ?? 0) + 1;
    if (status === "COMPLETED_WITH_ERRORS") {
      counts.completedWithErrors = (counts.completedWithErrors ?? 0) + 1;
    }
    if (status === "FAILED") counts.failed = (counts.failed ?? 0) + 1;
    if (status === "QUARANTINED") counts.quarantined = (counts.quarantined ?? 0) + 1;
    if (status === "SCAN_FAILED") counts.scanFailed = (counts.scanFailed ?? 0) + 1;
    if (status === "ROLLBACK_PENDING") counts.rollbackPending = (counts.rollbackPending ?? 0) + 1;
  }
  return counts;
}

/** Display labels for overview status bucket keys. */
export const DASHBOARD_BUCKET_LABELS: Record<string, string> = {
  active: "Active",
  awaitingMapping: "Awaiting mapping",
  awaitingApproval: "Awaiting approval",
  processing: "Processing",
  completed: "Completed",
  completedWithErrors: "Completed w/ errors",
  failed: "Failed",
  quarantined: "Quarantined",
  scanFailed: "Scan failed",
  rollbackPending: "Rollback pending",
};
