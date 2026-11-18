export {
  IMPORT_FORMATS,
  IMPORT_JOB_STATUSES,
  IMPORT_ROLLBACK_SAFETY,
  IMPORT_PERMISSIONS,
  DUPLICATE_ACTIONS,
  VALIDATION_RULE_KINDS,
  notImplemented,
  type ImportFormat,
  type ImportJobStatus,
  type ImportRollbackSafety,
  type ImportPermissionCode,
  type DuplicateAction,
  type ValidationRuleKind,
  type ProductModuleRef,
  type ImportNotImplementedError,
} from "./types.js";

export {
  hasImportPermission,
  assertImportPermission,
  importPermissionForAction,
  listImportPermissions,
  tenantAdminImportPermissions,
} from "./authorization.js";

export {
  IMPORT_AUDIT_EVENT_TYPES,
  assertImportAuditSafe,
  createImportAuditEvent,
  type ImportAuditEventType,
  type ImportAuditOutcome,
  type ImportAuditEvent,
} from "./audit.js";

export {
  S2_CONTROL_PLANE_TRANSITIONS,
  S3_UPLOAD_TRANSITIONS,
  S2_INITIAL_JOB_STATUS,
  S3_INITIAL_UPLOAD_JOB_STATUS,
  assertS2Transition,
  assertS3Transition,
  nextStatusForAction,
  nextStatusForS3Action,
} from "./state-machine.js";

export {
  S5_EXECUTION_TRANSITIONS,
  assertS5Transition,
  nextStatusForS5Action,
  terminalExecutionStatus,
} from "./execution/state.js";

export {
  IMPORT_EXECUTE_MESSAGE_TYPE,
  IMPORT_EXECUTE_SCHEMA_VERSION,
  importExecuteMessageSchema,
  createImportExecuteMessage,
  parseImportExecuteMessage,
  validateImportExecuteMessage,
  type ImportExecuteMessage,
  type MessageValidationResult,
} from "./execution/messages.js";

export {
  FAILURE_CLASSES,
  ROLLBACK_CLASSIFICATIONS,
  adapterRegistryKey,
  resolveImportAdapterKey,
  AUTHORIZED_IMPORT_ADAPTER_KEYS,
  REFERENCE_IMPORT_ADAPTER_KEY,
  ImportAdapterRegistry,
  type FailureClass,
  type RollbackClassification,
  type NormalizedImportRecord,
  type AdapterExecutionContext,
  type AdapterBatchContext,
  type ImportRecordResult,
  type CompensationResult,
  type ImportRollbackJournalEntry,
  type AdapterRollbackContext,
  type ImportRecordAdapter,
} from "./execution/adapter.js";

export { ReferenceImportAdapter } from "./execution/reference-adapter.js";

export {
  emptyRowCounts,
  computeProgress,
  resolveBatchSize,
  DEFAULT_EXECUTION_BATCH_SIZE,
  MAX_EXECUTION_BATCH_SIZE,
  MIN_EXECUTION_BATCH_SIZE,
  type RowCountSnapshot,
  type ProgressInput,
  type ProgressView,
} from "./execution/progress.js";

export {
  DEFAULT_RETRY_POLICY,
  shouldRetryFailure,
  computeExecutionRetryDelayMs,
  classifyErrorMessage,
  type RetryPolicy,
} from "./execution/retry.js";

export {
  emptyRollbackSummary,
  buildExecutionResultSummary,
  aggregateRollbackClassification,
  classifyJobRollback,
  type ExecutionResultSummary,
} from "./execution/results.js";

export {
  executeImportJobSchema,
  cancelExecutionSchema,
  rollbackRequestSchema,
  retryRowErrorSchema,
  type ExecuteImportJobInput,
  type CancelExecutionInput,
  type RollbackRequestInput,
  type RetryRowErrorInput,
} from "./execution/dto.js";

export {
  isLockExpired,
  nextLockExpiry,
  rowOutcomeToCounters,
  finalizeJobStatus,
  summarizeRollbackFromResults,
  journalIdempotencyKey,
  type LockAcquisition,
} from "./execution/engine.js";

export { IMPORT_EXECUTION_ASL, IMPORT_EXECUTION_SFN_STATUS } from "./execution/step-functions.js";

export {
  MALWARE_VERDICTS,
  ACCEPTABLE_MALWARE_VERDICTS,
  isAcceptableMalwareVerdict,
  isQuarantineVerdict,
  isFailClosedVerdict,
  DEFAULT_SCAN_TIMEOUT_MS,
  DEFAULT_SCAN_POLL_INTERVAL_MS,
  DEFAULT_MAX_SCAN_ATTEMPTS,
  DEFAULT_MAX_RESCANS,
  EICAR_SHA256,
  type MalwareVerdict,
  type AcceptableMalwareVerdict,
  type MalwareScanSubmission,
  type MalwareScanSubmissionResult,
  type MalwareScanVerdictResult,
  type ImportMalwareScanner,
} from "./security/malware.js";

export { ReferenceMalwareScanner, contentSha256 } from "./security/reference-scanner.js";

export {
  REFERENCE_MALWARE_PROVIDER_KEY,
  AWS_GUARDDUTY_MALWARE_PROVIDER_KEY,
  PRODUCTION_LIKE_APP_ENVS,
  isProductionLikeAppEnv,
  isReferenceMalwareProvider,
  isProductionGradeMalwareProvider,
  resolveImportMalwareProviderKey,
  assertScannerAllowedForEnvironment,
  STUCK_JOB_THRESHOLDS_MS,
  isStuckImportJob,
  S8_BATCH_RECOMMENDATION,
  type StuckImportJobState,
} from "./security/production-guards.js";

export {
  S6_MALWARE_TRANSITIONS,
  assertS6MalwareTransition,
  nextStatusForS6MalwareAction,
  jobStatusForVerdict,
  assertMalwareGate,
  type MalwareGateResult,
} from "./security/gate.js";

export {
  SENSITIVE_CLASSIFICATIONS,
  NEVER_UNMASK,
  classifyFieldName,
  requiresMasking,
  maskValue,
  sanitizeObject,
  defaultImportSensitiveDataMasker,
  redactLogFields,
  type SensitiveClassification,
  type MaskingPolicy,
  type MaskingContext,
  type ImportSensitiveDataMasker,
} from "./security/masking.js";

export {
  IMPORT_MALWARE_SCAN_MESSAGE_TYPE,
  IMPORT_MALWARE_SCAN_SCHEMA_VERSION,
  createImportMalwareScanMessage,
  validateImportMalwareScanMessage,
  rescanImportFileSchema,
  downloadArtifactSchema,
  type ImportMalwareScanMessage,
  type RescanImportFileInput,
  type DownloadArtifactInput,
} from "./security/messages.js";

export {
  DEFAULT_RETENTION_POLICY,
  isRetentionEligible,
  retentionDeleteAt,
  type RetentionPolicy,
  type RetentionCandidate,
} from "./security/retention.js";

export {
  IMPORT_ERROR_CODES,
  IMPORT_NOT_AVAILABLE_UNTIL_S3,
  IMPORT_NOT_AVAILABLE_UNTIL_S5,
  IMPORT_NOT_AVAILABLE_UNTIL_S6,
  type ImportErrorCode,
} from "./errors.js";

export {
  createImportJobSchema,
  patchImportJobSchema,
  putMappingsSchema,
  mappingItemSchema,
  createImportProfileSchema,
  patchImportProfileSchema,
  listJobsQuerySchema,
  listProfilesQuerySchema,
  type CreateImportJobInput,
  type PatchImportJobInput,
  type PutMappingsInput,
  type CreateImportProfileInput,
  type PatchImportProfileInput,
  type ListJobsQuery,
  type ListProfilesQuery,
} from "./dto.js";

export {
  initImportUploadSchema,
  completeImportUploadSchema,
  importUploadPartsSchema,
  MULTIPART_THRESHOLD_BYTES,
  DEFAULT_PART_SIZE_BYTES,
  MAX_IMPORT_UPLOAD_BYTES,
  PRESIGN_EXPIRES_SECONDS,
  ALLOWED_IMPORT_CONTENT_TYPES,
  type InitImportUploadInput,
  type CompleteImportUploadInput,
  type ImportUploadPartsInput,
} from "./upload-dto.js";

export {
  IMPORT_UPLOAD_DETECT_MESSAGE_TYPE,
  createImportUploadDetectMessage,
  type ImportUploadDetectMessage,
} from "./messages.js";

export { detectImportFormat, type FormatDetectionResult } from "./formats/detect.js";

export {
  IMPORT_TEMPLATES,
  listImportTemplates,
  getImportTemplate,
  type ImportTemplateMeta,
  type ImportTemplateField,
} from "./templates.js";

export type {
  DetectedFileMeta,
  TargetFieldSchema,
  TargetSchema,
  ColumnMapping,
  StagedRow,
  ValidationIssue,
  RowValidationResult,
  DuplicateCandidate,
  PreviewSummary,
  ProgressSnapshot,
  ExecuteBatchResult,
  RollbackResult,
  FileDetector,
  SchemaLoader,
  ColumnMapper,
  Transformer,
  Validator,
  DuplicateDetector,
  PreviewGenerator,
  ImportExecutor,
  RollbackHandler,
  ProgressReporter,
} from "./interfaces.js";

export { StubFileDetector, StructureFileDetector } from "./formats/detector.js";
export { StubValidator } from "./validation/validator.js";
export { StubDuplicateDetector, ConfigurableDuplicateDetector } from "./duplicates/detector.js";
export {
  detectDuplicates,
  buildMergeCandidate,
  bandForConfidence,
  actionForBand,
  levenshtein,
  DEFAULT_DUPLICATE_RULES,
  MATCH_ALGORITHMS,
  CONFIDENCE_BANDS,
  DUPLICATE_REVIEW_STATUSES,
  type MatchAlgorithm,
  type ConfidenceBand,
  type DuplicateReviewStatus,
  type DuplicateFieldRule,
  type DuplicateRulesConfig,
  type ExistingRecord,
  type IncomingRecord,
  type MatchReason,
  type FieldConflict,
  type MergeCandidate,
  type ScoredDuplicate,
} from "./duplicates/engine.js";
export {
  validateZipMigrationBundle,
  isUnsafeZipEntryPath,
  parseZipManifest,
  type ZipManifest,
  type ZipManifestEntry,
  type ZipInventoryItem,
  type ZipValidationResult,
} from "./formats/zip.js";
export {
  validateApiImportSourceConfig,
  computeRetryDelayMs,
  buildApiPageRequest,
  extractRecordsFromApiPayload,
  type ApiAuthConfig,
  type ApiPaginationConfig,
  type ApiRetryConfig,
  type ApiRateLimitConfig,
  type ApiImportSourceConfig,
  type ApiImportValidationResult,
  type ApiFetchPageRequest,
} from "./api/source.js";
export {
  duplicateRulesSchema,
  stageImportRowsSchema,
  detectDuplicatesSchema,
  listDuplicatesQuerySchema,
  reviewDuplicateSchema,
  resolveDuplicateSchema,
  validateZipSchema,
  validateApiSourceSchema,
  patchImportProfileS4Schema,
  type StageImportRowsInput,
  type DetectDuplicatesInput,
  type ListDuplicatesQuery,
  type ReviewDuplicateInput,
  type ResolveDuplicateInput,
  type PatchImportProfileS4Input,
} from "./s4-dto.js";
export { StubColumnMapper, StubPreviewGenerator, StubProgressReporter } from "./pipeline/stubs.js";
export {
  AliasColumnMapper,
  COLUMN_ALIAS_GROUPS,
  mappingStatus,
  resolveAliasTarget,
} from "./pipeline/column-mapper.js";
export { SchemaRowValidator, summarizeValidation } from "./validation/schema-validator.js";
export {
  StubSchemaLoader,
  StubTransformer,
  StubImportExecutor,
  StubRollbackHandler,
} from "./pipeline/execute.js";
