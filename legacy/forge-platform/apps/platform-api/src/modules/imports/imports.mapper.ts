import type {
  importColumnMappings,
  importFiles,
  importJobs,
  importProfiles,
} from "@forge/database";

type JobRow = typeof importJobs.$inferSelect;
type ProfileRow = typeof importProfiles.$inferSelect;
type MappingRow = typeof importColumnMappings.$inferSelect;
type FileRow = typeof importFiles.$inferSelect;

export function mapImportJob(row: JobRow) {
  return {
    id: row.id,
    productKey: row.productCode,
    moduleKey: row.moduleCode,
    recordCategory: row.recordType,
    status: row.status,
    profileId: row.profileId,
    profileKey: row.profileKey,
    format: row.format,
    displayName: row.displayName,
    description: row.description,
    sourceType: row.sourceType,
    requestedMode: row.requestedMode,
    correlationId: row.correlationId,
    clientRequestId: row.requestId,
    progressPercent: row.progressPercent,
    currentStage: row.currentStage,
    errorSummary: row.errorSummary,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    securityHold: row.securityHold,
    malwareGatePassedAt: row.malwareGatePassedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export function mapImportFile(row: FileRow) {
  return {
    id: row.id,
    jobId: row.jobId,
    fileName: row.fileName,
    storedFileName: row.storedFileName,
    contentType: row.contentType,
    format: row.format,
    byteSize: row.byteSize,
    contentHash: row.contentHash,
    clientChecksumSha256: row.clientChecksumSha256,
    s3Bucket: row.s3Bucket,
    s3Key: row.s3Key,
    scanStatus: row.scanStatus,
    scanDetail: row.scanDetail,
    malwareVerdict: row.malwareVerdict,
    malwareVerdictAt: row.malwareVerdictAt?.toISOString() ?? null,
    quarantineStatus: row.quarantineStatus,
    quarantinedAt: row.quarantinedAt?.toISOString() ?? null,
    scanAttemptCount: row.scanAttemptCount,
    rescanRequired: row.rescanRequired,
    securityHold: row.securityHold,
    uploadStatus: row.uploadStatus,
    validationStatus: row.validationStatus,
    validationDetail: row.validationDetail,
    encryptionStatus: row.encryptionStatus,
    multipartUploadId: row.multipartUploadId,
    uploadProgressPercent: row.uploadProgressPercent,
    detectedHeaders: row.detectedHeadersJson,
    detectedSheets: row.detectedSheetsJson,
    completedAt: row.completedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapImportProfile(row: ProfileRow) {
  return {
    id: row.id,
    profileKey: row.profileKey,
    displayName: row.displayName,
    productKey: row.productCode,
    moduleKey: row.moduleCode,
    recordCategory: row.recordType,
    sourceType: row.sourceType,
    snapshot: row.snapshotJson,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

export function mapImportMapping(row: MappingRow) {
  return {
    id: row.id,
    jobId: row.jobId,
    profileId: row.profileId,
    sourceColumn: row.sourceColumn,
    targetField: row.targetField,
    transform: row.transformJson,
    isRequired: row.isRequired,
    isSensitive: row.isSensitive,
    ordinal: row.ordinal,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
