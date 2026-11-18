/**
 * Shared Universal Import Engine — product-agnostic types and stage interfaces.
 * Product-specific commit adapters are registered outside this package.
 */

export const IMPORT_FORMATS = ["csv", "xlsx", "json", "zip", "api"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const IMPORT_JOB_STATUSES = [
  "UPLOADED",
  "SCANNING",
  "SCAN_FAILED",
  "READY_FOR_MAPPING",
  "MAPPED",
  "VALIDATING",
  "VALIDATION_FAILED",
  "READY_FOR_PREVIEW",
  "PREVIEW_READY",
  "AWAITING_APPROVAL",
  "APPROVED",
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
  "ROLLBACK_PENDING",
  "ROLLED_BACK",
  "ROLLBACK_REFUSED",
  "CANCELLED",
  "QUARANTINED",
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_ROLLBACK_SAFETY = ["SAFE", "CONDITIONAL", "UNSAFE", "EXPIRED"] as const;
export type ImportRollbackSafety = (typeof IMPORT_ROLLBACK_SAFETY)[number];

export const IMPORT_PERMISSIONS = [
  "import.view",
  "import.upload",
  "import.map",
  "import.validate",
  "import.preview",
  "import.approve",
  "import.execute",
  "import.rollback",
  "import.profile.manage",
  "import.template.manage",
  "import.error.reprocess",
  "import.sensitive",
] as const;
export type ImportPermissionCode = (typeof IMPORT_PERMISSIONS)[number];

export const DUPLICATE_ACTIONS = ["CREATE", "UPDATE", "SKIP", "REJECT", "MERGE_REVIEW"] as const;
export type DuplicateAction = (typeof DUPLICATE_ACTIONS)[number];

export const VALIDATION_RULE_KINDS = [
  "required",
  "type",
  "date",
  "email",
  "phone",
  "identifier",
  "dropdown",
  "relationship",
  "foreign_key",
  "workflow",
  "permission",
  "tenant",
  "cross_tenant",
] as const;
export type ValidationRuleKind = (typeof VALIDATION_RULE_KINDS)[number];

/** Product/module/record binding — no product business logic in this package. */
export type ProductModuleRef = {
  productCode: string;
  moduleCode: string;
  recordType: string;
};

export type ImportNotImplementedError = {
  code: "NOT_IMPLEMENTED";
  message: string;
};

export function notImplemented(feature: string): never {
  const error = new Error(`Import engine stub: ${feature} is NOT_IMPLEMENTED`);
  (error as Error & { code: string }).code = "NOT_IMPLEMENTED";
  throw error;
}
