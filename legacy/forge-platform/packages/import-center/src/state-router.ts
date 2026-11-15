import type { ImportJobStatus, ImportWorkflowView } from "./types.js";

/**
 * Maps authoritative server job status to the Import Center workspace view.
 * Client must not invent alternate state names.
 */
export function resolveImportWorkflowView(
  status: ImportJobStatus | string | null | undefined,
): ImportWorkflowView {
  switch (status) {
    case "UPLOADED":
      return "upload";
    case "SCANNING":
      return "security";
    case "SCAN_FAILED":
      return "security";
    case "QUARANTINED":
      return "quarantine";
    case "READY_FOR_MAPPING":
      return "mapping";
    case "MAPPED":
      return "validation";
    case "VALIDATING":
      return "validation";
    case "VALIDATION_FAILED":
      return "validation";
    case "READY_FOR_PREVIEW":
    case "PREVIEW_READY":
      return "preview";
    case "AWAITING_APPROVAL":
      return "approval";
    case "APPROVED":
      return "execute";
    case "QUEUED":
    case "PROCESSING":
      return "execution";
    case "COMPLETED":
    case "COMPLETED_WITH_ERRORS":
    case "FAILED":
    case "CANCELLED":
    case "ROLLBACK_PENDING":
    case "ROLLED_BACK":
    case "ROLLBACK_REFUSED":
      return "results";
    default:
      return "upload";
  }
}

export const WORKFLOW_STEP_ORDER: ReadonlyArray<{
  view: ImportWorkflowView;
  label: string;
}> = [
  { view: "new", label: "Details" },
  { view: "upload", label: "Upload" },
  { view: "security", label: "Security" },
  { view: "mapping", label: "Mapping" },
  { view: "validation", label: "Validation" },
  { view: "preview", label: "Preview" },
  { view: "duplicates", label: "Duplicates" },
  { view: "approval", label: "Approval" },
  { view: "execute", label: "Execute" },
  { view: "execution", label: "Monitor" },
  { view: "results", label: "Results" },
];

export function isTerminalImportStatus(status: string): boolean {
  return [
    "COMPLETED",
    "COMPLETED_WITH_ERRORS",
    "FAILED",
    "CANCELLED",
    "ROLLED_BACK",
    "ROLLBACK_REFUSED",
    "QUARANTINED",
  ].includes(status);
}

export function isExecutionActiveStatus(status: string): boolean {
  return status === "QUEUED" || status === "PROCESSING";
}
