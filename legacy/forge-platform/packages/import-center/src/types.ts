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

export type ImportPermission = (typeof IMPORT_PERMISSIONS)[number];

export type ImportJobStatus =
  | "UPLOADED"
  | "SCANNING"
  | "SCAN_FAILED"
  | "QUARANTINED"
  | "READY_FOR_MAPPING"
  | "MAPPED"
  | "VALIDATING"
  | "VALIDATION_FAILED"
  | "READY_FOR_PREVIEW"
  | "PREVIEW_READY"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED"
  | "CANCELLED"
  | "ROLLBACK_PENDING"
  | "ROLLED_BACK"
  | "ROLLBACK_REFUSED";

export type MalwareVerdict =
  | "NOT_SUBMITTED"
  | "SUBMITTED"
  | "SCANNING"
  | "CLEAN"
  | "INFECTED"
  | "SUSPICIOUS"
  | "SCAN_FAILED"
  | "SCAN_TIMEOUT"
  | "UNSUPPORTED"
  | "QUARANTINED"
  | "RESCAN_REQUIRED"
  | "OVERRIDE_APPROVED"
  | "OVERRIDE_DENIED";

export type ImportWorkflowView =
  | "dashboard"
  | "new"
  | "upload"
  | "security"
  | "quarantine"
  | "mapping"
  | "validation"
  | "preview"
  | "duplicates"
  | "approval"
  | "execute"
  | "execution"
  | "results"
  | "profiles"
  | "templates";

export type ImportJobSummary = {
  id: string;
  displayName: string;
  status: ImportJobStatus | string;
  productKey: string;
  moduleKey: string;
  recordCategory: string;
  format?: string | null;
  progressPercent?: number | null;
  currentStage?: string | null;
  errorSummary?: string | null;
  securityHold?: boolean;
  malwareGatePassedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  file?: {
    id: string;
    fileName: string;
    malwareVerdict?: MalwareVerdict | string;
    quarantineStatus?: string;
    scanStatus?: string;
    uploadStatus?: string;
    byteSize?: number | null;
    contentHash?: string | null;
  } | null;
};

export type ImportMappingRow = {
  id?: string;
  sourceColumn: string;
  targetField: string;
  transform?: Record<string, unknown> | null;
  isRequired?: boolean;
  isSensitive?: boolean;
  ordinal?: number;
};

export type ImportProfileSummary = {
  id: string;
  profileKey: string;
  displayName: string;
  productKey: string;
  moduleKey: string;
  recordCategory: string;
  sourceType?: string;
  archivedAt?: string | null;
};

export type ImportDuplicateCandidate = {
  id: string;
  jobId: string;
  confidence: number;
  confidenceBand?: string;
  matchAlgorithm?: string;
  recommendedAction?: string;
  reviewStatus?: string;
  matchFields?: unknown;
  matchReasons?: unknown;
};

export type ImportRowError = {
  id: string;
  jobId: string;
  rowId?: string;
  severity?: string;
  ruleCode?: string;
  fieldPath?: string | null;
  message: string;
  failureClass?: string | null;
  disposition?: string;
  retryCount?: number;
};

export type ImportExecutionStatus = {
  jobId: string;
  status: string;
  progressPercent?: number;
  currentStage?: string | null;
  rowCounts?: Record<string, number> | null;
  lastProgressAt?: string | null;
  executionStartedAt?: string | null;
  cancellationRequested?: boolean;
};

export type ProtectedDownloadResponse = {
  artifactId: string;
  artifactType: string;
  classification: string;
  downloadUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
  contentType: string;
};

export type SafeApiError = {
  message: string;
  code?: string;
  correlationId?: string;
  status?: number;
};
