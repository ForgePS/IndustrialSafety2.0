import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const importJobStatusEnum = pgEnum("import_job_status", [
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
]);

export const importRollbackSafetyEnum = pgEnum("import_rollback_safety", [
  "SAFE",
  "CONDITIONAL",
  "UNSAFE",
  "EXPIRED",
]);

export const importProfiles = pgTable(
  "import_profiles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    profileKey: varchar("profile_key", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    productCode: varchar("product_code", { length: 64 }).notNull(),
    moduleCode: varchar("module_code", { length: 64 }).notNull(),
    recordType: varchar("record_type", { length: 120 }).notNull(),
    sourceType: varchar("source_type", { length: 32 }).notNull(),
    configNamespace: varchar("config_namespace", { length: 64 }).notNull().default("import_config"),
    configObjectKey: varchar("config_object_key", { length: 120 }),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    duplicateRulesJson: jsonb("duplicate_rules_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    zipMetadataJson: jsonb("zip_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    apiSourceMetadataJson: jsonb("api_source_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isSnapshot: boolean("is_snapshot").notNull().default(false),
    correlationId: varchar("correlation_id", { length: 64 }),
    sourceHash: varchar("source_hash", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("import_profiles_tenant_key_uidx").on(table.tenantId, table.profileKey),
    index("import_profiles_tenant_product_idx").on(
      table.tenantId,
      table.productCode,
      table.moduleCode,
      table.recordType,
    ),
  ],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productCode: varchar("product_code", { length: 64 }).notNull(),
    moduleCode: varchar("module_code", { length: 64 }).notNull(),
    recordType: varchar("record_type", { length: 120 }).notNull(),
    status: importJobStatusEnum("status").notNull().default("UPLOADED"),
    profileId: uuid("profile_id").references(() => importProfiles.id),
    profileKey: varchar("profile_key", { length: 120 }),
    profileSnapshotJson: jsonb("profile_snapshot_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    format: varchar("format", { length: 32 }),
    displayName: varchar("display_name", { length: 200 }).notNull().default("Import job"),
    description: text("description"),
    sourceType: varchar("source_type", { length: 32 }),
    requestedMode: varchar("requested_mode", { length: 32 }),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    requestId: varchar("request_id", { length: 64 }),
    sourceHash: varchar("source_hash", { length: 128 }),
    rowCountsJson: jsonb("row_counts_json").$type<Record<string, unknown>>().notNull().default({}),
    progressPercent: integer("progress_percent").notNull().default(0),
    currentStage: varchar("current_stage", { length: 64 }),
    errorSummary: text("error_summary"),
    rollbackSafety: importRollbackSafetyEnum("rollback_safety"),
    cancellationRequested: boolean("cancellation_requested").notNull().default(false),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
    cancellationRequestedBy: uuid("cancellation_requested_by").references(() => users.id),
    executionLockOwner: varchar("execution_lock_owner", { length: 128 }),
    executionLockAcquiredAt: timestamp("execution_lock_acquired_at", { withTimezone: true }),
    executionLockHeartbeatAt: timestamp("execution_lock_heartbeat_at", { withTimezone: true }),
    executionLockExpiresAt: timestamp("execution_lock_expires_at", { withTimezone: true }),
    executionAttempt: integer("execution_attempt").notNull().default(0),
    executionIdempotencyKey: varchar("execution_idempotency_key", { length: 255 }),
    adapterKey: varchar("adapter_key", { length: 160 }),
    adapterVersion: varchar("adapter_version", { length: 64 }),
    workerId: varchar("worker_id", { length: 128 }),
    executionStartedAt: timestamp("execution_started_at", { withTimezone: true }),
    lastProgressAt: timestamp("last_progress_at", { withTimezone: true }),
    estimatedCompletionAt: timestamp("estimated_completion_at", { withTimezone: true }),
    mappingSnapshotJson: jsonb("mapping_snapshot_json").$type<unknown[]>().notNull().default([]),
    resultSummaryJson: jsonb("result_summary_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    rollbackClassificationSummaryJson: jsonb("rollback_classification_summary_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    securityHold: boolean("security_hold").notNull().default(false),
    malwareGatePassedAt: timestamp("malware_gate_passed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    index("import_jobs_tenant_status_created_idx").on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
    index("import_jobs_tenant_product_idx").on(
      table.tenantId,
      table.productCode,
      table.moduleCode,
      table.recordType,
    ),
    index("import_jobs_tenant_display_name_idx").on(table.tenantId, table.displayName),
    uniqueIndex("import_jobs_tenant_execution_idempotency_uidx").on(
      table.tenantId,
      table.executionIdempotencyKey,
    ),
  ],
);

export const importFiles = pgTable(
  "import_files",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    parentFileId: uuid("parent_file_id"),
    fileName: varchar("file_name", { length: 500 }).notNull(),
    storedFileName: varchar("stored_file_name", { length: 500 }),
    contentType: varchar("content_type", { length: 200 }),
    format: varchar("format", { length: 32 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }),
    contentHash: varchar("content_hash", { length: 128 }),
    sourceHash: varchar("source_hash", { length: 128 }),
    clientChecksumSha256: varchar("client_checksum_sha256", { length: 128 }),
    s3Bucket: varchar("s3_bucket", { length: 255 }).notNull(),
    s3Key: varchar("s3_key", { length: 1024 }).notNull(),
    scanStatus: varchar("scan_status", { length: 32 }).notNull().default("PENDING"),
    scanDetail: text("scan_detail"),
    malwareVerdict: varchar("malware_verdict", { length: 64 }).notNull().default("NOT_SUBMITTED"),
    malwareVerdictAt: timestamp("malware_verdict_at", { withTimezone: true }),
    currentScanEventId: uuid("current_scan_event_id"),
    quarantineStatus: varchar("quarantine_status", { length: 32 }).notNull().default("NONE"),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
    quarantineObjectKey: varchar("quarantine_object_key", { length: 1024 }),
    scanAttemptCount: integer("scan_attempt_count").notNull().default(0),
    rescanRequired: boolean("rescan_required").notNull().default(false),
    verdictHash: varchar("verdict_hash", { length: 128 }),
    objectVersionId: varchar("object_version_id", { length: 255 }),
    detectedMimeType: varchar("detected_mime_type", { length: 200 }),
    securityHold: boolean("security_hold").notNull().default(false),
    uploadStatus: varchar("upload_status", { length: 32 }).notNull().default("INITIALIZED"),
    validationStatus: varchar("validation_status", { length: 32 }).notNull().default("PENDING"),
    validationDetail: text("validation_detail"),
    encryptionStatus: varchar("encryption_status", { length: 32 }).notNull().default("SSE_KMS"),
    multipartUploadId: varchar("multipart_upload_id", { length: 255 }),
    uploadProgressPercent: integer("upload_progress_percent").notNull().default(0),
    detectedHeadersJson: jsonb("detected_headers_json").$type<unknown>(),
    detectedSheetsJson: jsonb("detected_sheets_json").$type<unknown>(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    index("import_files_tenant_job_idx").on(table.tenantId, table.jobId),
    index("import_files_tenant_scan_idx").on(table.tenantId, table.scanStatus),
    index("import_files_tenant_upload_status_idx").on(
      table.tenantId,
      table.uploadStatus,
      table.createdAt,
    ),
  ],
);

export const importColumnMappings = pgTable(
  "import_column_mappings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    profileId: uuid("profile_id").references(() => importProfiles.id),
    sourceColumn: varchar("source_column", { length: 300 }).notNull(),
    targetField: varchar("target_field", { length: 300 }).notNull(),
    transformJson: jsonb("transform_json").$type<Record<string, unknown>>().notNull().default({}),
    isRequired: boolean("is_required").notNull().default(false),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    ordinal: integer("ordinal").notNull().default(0),
    correlationId: varchar("correlation_id", { length: 64 }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    index("import_column_mappings_tenant_job_idx").on(table.tenantId, table.jobId),
    uniqueIndex("import_column_mappings_job_source_uidx").on(table.jobId, table.sourceColumn),
  ],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    batchNumber: integer("batch_number").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    rowCount: integer("row_count").notNull().default(0),
    committedCount: integer("committed_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    cancelledCount: integer("cancelled_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    workerId: varchar("worker_id", { length: 128 }),
    checkpointJson: jsonb("checkpoint_json").$type<Record<string, unknown>>().notNull().default({}),
    lastProcessedRowId: uuid("last_processed_row_id"),
    durationMs: integer("duration_ms"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    sourceHash: varchar("source_hash", { length: 128 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("import_batches_job_number_uidx").on(table.jobId, table.batchNumber),
    index("import_batches_tenant_job_idx").on(table.tenantId, table.jobId, table.status),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    batchId: uuid("batch_id").references(() => importBatches.id),
    fileId: uuid("file_id").references(() => importFiles.id),
    sourceRowKey: varchar("source_row_key", { length: 200 }).notNull(),
    operationKey: varchar("operation_key", { length: 255 }),
    sourceLine: integer("source_line"),
    sourceSheet: varchar("source_sheet", { length: 200 }),
    status: varchar("status", { length: 32 }).notNull().default("STAGED"),
    rawJson: jsonb("raw_json").$type<Record<string, unknown> | null>(),
    mappedJson: jsonb("mapped_json").$type<Record<string, unknown>>().notNull().default({}),
    containsSensitive: boolean("contains_sensitive").notNull().default(false),
    duplicateAction: varchar("duplicate_action", { length: 32 }),
    targetEntityId: uuid("target_entity_id"),
    destinationRecordId: varchar("destination_record_id", { length: 255 }),
    operationType: varchar("operation_type", { length: 64 }),
    rollbackClassification: varchar("rollback_classification", { length: 64 }),
    rollbackJournalJson: jsonb("rollback_journal_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    commitAttempt: integer("commit_attempt").notNull().default(0),
    adapterKey: varchar("adapter_key", { length: 160 }),
    adapterVersion: varchar("adapter_version", { length: 64 }),
    sourceHash: varchar("source_hash", { length: 128 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("import_rows_job_source_uidx").on(table.jobId, table.sourceRowKey),
    index("import_rows_tenant_job_status_idx").on(table.tenantId, table.jobId, table.status),
  ],
);

export const importRowErrors = pgTable(
  "import_row_errors",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    rowId: uuid("row_id")
      .notNull()
      .references(() => importRows.id),
    severity: varchar("severity", { length: 16 }).notNull().default("ERROR"),
    ruleCode: varchar("rule_code", { length: 120 }).notNull(),
    fieldPath: varchar("field_path", { length: 300 }),
    message: text("message").notNull(),
    detailsJson: jsonb("details_json").$type<Record<string, unknown>>().notNull().default({}),
    retryCount: integer("retry_count").notNull().default(0),
    lastRetryAt: timestamp("last_retry_at", { withTimezone: true }),
    disposition: varchar("disposition", { length: 64 }).notNull().default("OPEN"),
    failureClass: varchar("failure_class", { length: 64 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    index("import_row_errors_tenant_job_idx").on(table.tenantId, table.jobId),
    index("import_row_errors_row_idx").on(table.rowId),
  ],
);

export const importRollbackEvents = pgTable(
  "import_rollback_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    batchId: uuid("batch_id").references(() => importBatches.id),
    status: varchar("status", { length: 32 }).notNull().default("REQUESTED"),
    safetyClass: importRollbackSafetyEnum("safety_class").notNull(),
    classification: varchar("classification", { length: 64 }),
    reason: text("reason"),
    entitiesJson: jsonb("entities_json").$type<unknown[]>().notNull().default([]),
    journalJson: jsonb("journal_json").$type<unknown[]>().notNull().default([]),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [index("import_rollback_events_tenant_job_idx").on(table.tenantId, table.jobId)],
);

export const importExecutionJournal = pgTable(
  "import_execution_journal",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    batchId: uuid("batch_id").references(() => importBatches.id),
    rowId: uuid("row_id").references(() => importRows.id),
    adapterKey: varchar("adapter_key", { length: 160 }).notNull(),
    adapterVersion: varchar("adapter_version", { length: 64 }).notNull(),
    operationType: varchar("operation_type", { length: 64 }).notNull(),
    destinationRecordId: varchar("destination_record_id", { length: 255 }),
    rollbackClassification: varchar("rollback_classification", { length: 64 }).notNull(),
    beforeRefJson: jsonb("before_ref_json").$type<Record<string, unknown>>().notNull().default({}),
    afterRefJson: jsonb("after_ref_json").$type<Record<string, unknown>>().notNull().default({}),
    compensationJson: jsonb("compensation_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    index("import_execution_journal_tenant_job_idx").on(
      table.tenantId,
      table.jobId,
      table.committedAt,
    ),
  ],
);

export const importDuplicateCandidates = pgTable(
  "import_duplicate_candidates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    rowId: uuid("row_id")
      .notNull()
      .references(() => importRows.id),
    matchedEntityId: uuid("matched_entity_id"),
    matchedEntityType: varchar("matched_entity_type", { length: 120 }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    confidenceBand: varchar("confidence_band", { length: 16 }),
    matchAlgorithm: varchar("match_algorithm", { length: 64 }),
    recommendedAction: varchar("recommended_action", { length: 32 }).notNull(),
    resolvedAction: varchar("resolved_action", { length: 32 }),
    matchFieldsJson: jsonb("match_fields_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    matchReasonsJson: jsonb("match_reasons_json").$type<unknown[]>().notNull().default([]),
    mergeCandidateJson: jsonb("merge_candidate_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    reviewStatus: varchar("review_status", { length: 32 }).notNull().default("PENDING"),
    candidateStatus: varchar("candidate_status", { length: 32 }).notNull().default("OPEN"),
    reviewNotes: text("review_notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    correlationId: varchar("correlation_id", { length: 64 }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: updatedAtColumn,
    updatedBy: uuid("updated_by").references(() => users.id),
  },
  (table) => [
    index("import_duplicate_candidates_tenant_job_idx").on(table.tenantId, table.jobId),
    index("import_duplicate_candidates_row_idx").on(table.rowId),
    index("import_duplicate_candidates_tenant_review_idx").on(
      table.tenantId,
      table.reviewStatus,
      table.createdAt,
    ),
  ],
);

export const importProfileVersions = pgTable(
  "import_profile_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => importProfiles.id),
    versionNumber: integer("version_number").notNull(),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull().default({}),
    duplicateRulesJson: jsonb("duplicate_rules_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    zipMetadataJson: jsonb("zip_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    apiSourceMetadataJson: jsonb("api_source_metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    changeSummary: text("change_summary"),
    correlationId: varchar("correlation_id", { length: 64 }),
    createdAt: createdAtColumn,
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => [
    uniqueIndex("import_profile_versions_profile_version_uidx").on(
      table.profileId,
      table.versionNumber,
    ),
    index("import_profile_versions_tenant_profile_idx").on(
      table.tenantId,
      table.profileId,
      table.createdAt,
    ),
  ],
);

export const importFileScanEvents = pgTable(
  "import_file_scan_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id),
    importFileId: uuid("import_file_id")
      .notNull()
      .references(() => importFiles.id),
    attemptNumber: integer("attempt_number").notNull().default(1),
    providerKey: varchar("provider_key", { length: 120 }).notNull(),
    providerVersion: varchar("provider_version", { length: 64 }).notNull(),
    providerScanReference: varchar("provider_scan_reference", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"),
    verdict: varchar("verdict", { length: 64 }).notNull().default("SUBMITTED"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    timedOutAt: timestamp("timed_out_at", { withTimezone: true }),
    fileSha256: varchar("file_sha256", { length: 128 }),
    fileSize: bigint("file_size", { mode: "number" }),
    objectKey: varchar("object_key", { length: 1024 }).notNull(),
    objectVersionId: varchar("object_version_id", { length: 255 }),
    objectEtag: varchar("object_etag", { length: 255 }),
    detectedMimeType: varchar("detected_mime_type", { length: 200 }),
    malwareFamily: varchar("malware_family", { length: 255 }),
    failureCode: varchar("failure_code", { length: 120 }),
    failureMessageSanitized: text("failure_message_sanitized"),
    isCurrent: boolean("is_current").notNull().default(true),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    correlationId: varchar("correlation_id", { length: 64 }),
    createdBy: uuid("created_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("import_file_scan_events_tenant_file_idx").on(
      table.tenantId,
      table.importFileId,
      table.createdAt,
    ),
    index("import_file_scan_events_tenant_job_idx").on(
      table.tenantId,
      table.importJobId,
      table.verdict,
    ),
  ],
);

export const importSecurityArtifacts = pgTable(
  "import_security_artifacts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id),
    artifactType: varchar("artifact_type", { length: 64 }).notNull(),
    classification: varchar("classification", { length: 32 }).notNull().default("MASKED"),
    s3Bucket: varchar("s3_bucket", { length: 255 }).notNull(),
    s3Key: varchar("s3_key", { length: 1024 }).notNull(),
    contentHash: varchar("content_hash", { length: 128 }),
    byteSize: bigint("byte_size", { mode: "number" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retentionDeleteAt: timestamp("retention_delete_at", { withTimezone: true }),
    securityHold: boolean("security_hold").notNull().default(false),
    correlationId: varchar("correlation_id", { length: 64 }),
    createdBy: uuid("created_by").references(() => users.id),
    version: integer("version").notNull().default(1),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("import_security_artifacts_tenant_job_idx").on(
      table.tenantId,
      table.jobId,
      table.createdAt,
    ),
  ],
);
