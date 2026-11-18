import type { ImportJobStatus } from "./types.js";

/** S2 control-plane transitions. Processing / scan / rollback execution deferred to later sprints. */
export const S2_CONTROL_PLANE_TRANSITIONS: Record<string, ReadonlyArray<ImportJobStatus>> = {
  cancel: [
    "UPLOADED",
    "SCANNING",
    "SCAN_FAILED",
    "QUARANTINED",
    "READY_FOR_MAPPING",
    "MAPPED",
    "AWAITING_APPROVAL",
    "VALIDATION_FAILED",
  ],
  approve: ["AWAITING_APPROVAL"],
  reject: ["AWAITING_APPROVAL"],
  submit_for_approval: ["MAPPED"],
  replace_mappings: ["READY_FOR_MAPPING", "MAPPED"],
  update_metadata: [
    "READY_FOR_MAPPING",
    "MAPPED",
    "UPLOADED",
    "SCANNING",
    "VALIDATION_FAILED",
    "SCAN_FAILED",
  ],
  create: ["READY_FOR_MAPPING"],
  request_validation: ["MAPPED", "VALIDATION_FAILED"],
  request_preview: ["MAPPED", "READY_FOR_PREVIEW", "PREVIEW_READY"],
};

/** S3 upload transitions. Malware owns UPLOADED→SCANNING; format detect runs after CLEAN. */
export const S3_UPLOAD_TRANSITIONS: Record<string, ReadonlyArray<ImportJobStatus>> = {
  upload_complete: ["UPLOADED"],
  /** Format detection after malware CLEAN — job already SCANNING. */
  detection_pass: ["SCANNING"],
  detection_fail: ["SCANNING"],
  cancel_upload: ["UPLOADED", "SCANNING", "SCAN_FAILED", "QUARANTINED"],
};

export const S2_INITIAL_JOB_STATUS: ImportJobStatus = "READY_FOR_MAPPING";
export const S3_INITIAL_UPLOAD_JOB_STATUS: ImportJobStatus = "UPLOADED";

export function assertS2Transition(
  action: keyof typeof S2_CONTROL_PLANE_TRANSITIONS,
  current: ImportJobStatus,
): void {
  const allowed = S2_CONTROL_PLANE_TRANSITIONS[action] ?? [];
  if (!allowed.includes(current)) {
    const error = new Error(`Import job status '${current}' does not allow action '${action}'`);
    (error as Error & { code: string }).code = "IMPORT_INVALID_STATE_TRANSITION";
    throw error;
  }
}

export function assertS3Transition(
  action: keyof typeof S3_UPLOAD_TRANSITIONS,
  current: ImportJobStatus,
): void {
  const allowed = S3_UPLOAD_TRANSITIONS[action] ?? [];
  if (!allowed.includes(current)) {
    const error = new Error(`Import job status '${current}' does not allow action '${action}'`);
    (error as Error & { code: string }).code = "IMPORT_INVALID_STATE_TRANSITION";
    throw error;
  }
}

export function nextStatusForAction(
  action: keyof typeof S2_CONTROL_PLANE_TRANSITIONS,
  current: ImportJobStatus,
): ImportJobStatus {
  assertS2Transition(action, current);
  switch (action) {
    case "create":
      return "READY_FOR_MAPPING";
    case "update_metadata":
      return current;
    case "replace_mappings":
      return "MAPPED";
    case "submit_for_approval":
      return "AWAITING_APPROVAL";
    case "approve":
      return "APPROVED";
    case "reject":
      return "MAPPED";
    case "cancel":
      return "CANCELLED";
    case "request_validation":
      return "READY_FOR_PREVIEW";
    case "request_preview":
      return "PREVIEW_READY";
    default:
      return current;
  }
}

export function nextStatusForS3Action(
  action: keyof typeof S3_UPLOAD_TRANSITIONS,
  current: ImportJobStatus,
): ImportJobStatus {
  assertS3Transition(action, current);
  switch (action) {
    case "upload_complete":
      return "UPLOADED";
    case "detection_pass":
      return "READY_FOR_MAPPING";
    case "detection_fail":
      return "VALIDATION_FAILED";
    case "cancel_upload":
      return "CANCELLED";
    default:
      return current;
  }
}
