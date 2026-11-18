/**
 * Universal Import audit / domain event envelope (S1 definitions).
 * Payloads must never include raw sensitive row data.
 */

export const IMPORT_AUDIT_EVENT_TYPES = [
  "ImportJobCreated",
  "ImportJobUpdated",
  "ImportJobCancelled",
  "ImportFileRegistered",
  "ImportUploadInitialized",
  "ImportUploadCompleted",
  "ImportUploadCancelled",
  "ImportUploadAborted",
  "ImportFormatDetectionStarted",
  "ImportFormatDetectionPassed",
  "ImportFormatDetectionFailed",
  "ImportDuplicatesDetected",
  "ImportDuplicateReviewed",
  "ImportDuplicateApproved",
  "ImportDuplicateRejected",
  "ImportRowsStaged",
  "ImportZipValidated",
  "ImportApiSourceValidated",
  "ImportProfileCreated",
  "ImportProfileUpdated",
  "ImportProfileArchived",
  "ImportProfileRestored",
  "ImportMappingsUpdated",
  "ImportValidationRequested",
  "ImportPreviewRequested",
  "ImportSubmittedForApproval",
  "ImportValidationStarted",
  "ImportValidationCompleted",
  "ImportPreviewGenerated",
  "ImportApproved",
  "ImportRejected",
  "ImportExecutionQueued",
  "ImportExecutionStarted",
  "ImportExecutionCompleted",
  "ImportExecutionCompletedWithErrors",
  "ImportExecutionFailed",
  "ImportScanSubmitted",
  "ImportScanStarted",
  "ImportScanCompleted",
  "ImportScanClean",
  "ImportScanInfected",
  "ImportScanSuspicious",
  "ImportScanFailed",
  "ImportScanTimeout",
  "ImportScanRescanRequested",
  "ImportFileQuarantined",
  "ImportSensitiveViewed",
  "ImportSensitiveDownloadRequested",
  "ImportSensitiveAccessDenied",
  "ImportExecutionCancelRequested",
  "ImportExecutionCancelled",
  "ImportExecutionDlq",
  "ImportExecutionLockAcquired",
  "ImportExecutionLockReleased",
  "ImportBatchStarted",
  "ImportBatchCompleted",
  "ImportRowCommitted",
  "ImportRowFailed",
  "ImportRowRetried",
  "ImportRollbackRequested",
  "ImportRollbackClassified",
  "ImportRollbackCompleted",
  "ImportRollbackRefused",
  "ImportSensitiveFieldAccessed",
] as const;

export type ImportAuditEventType = (typeof IMPORT_AUDIT_EVENT_TYPES)[number];

export type ImportAuditOutcome = "SUCCESS" | "FAILURE" | "DENIED" | "REFUSED";

export type ImportAuditEvent = {
  eventId: string;
  eventType: ImportAuditEventType;
  eventVersion: number;
  tenantId: string;
  actorUserId: string | null;
  correlationId: string;
  importJobId: string | null;
  occurredAt: string;
  outcome: ImportAuditOutcome;
  /** Non-sensitive metadata only */
  details?: Record<string, unknown>;
};

export function assertImportAuditSafe(details: Record<string, unknown> | undefined): void {
  if (!details) return;
  const serialized = JSON.stringify(details);
  if (/("ssn"|"password"|"token"|"secret"|"raw_json"|"mapped_json")\s*:/i.test(serialized)) {
    throw new Error("Import audit details appear to contain sensitive fields");
  }
}

export function createImportAuditEvent(
  input: Omit<ImportAuditEvent, "eventVersion" | "occurredAt"> & {
    eventVersion?: number;
    occurredAt?: string;
  },
): ImportAuditEvent {
  assertImportAuditSafe(input.details);
  return {
    eventId: input.eventId,
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    correlationId: input.correlationId,
    importJobId: input.importJobId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    outcome: input.outcome,
    ...(input.details ? { details: input.details } : {}),
  };
}
