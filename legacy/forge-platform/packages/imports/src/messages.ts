export const IMPORT_UPLOAD_DETECT_MESSAGE_TYPE = "import.upload.detect.v1" as const;

export type ImportUploadDetectMessage = {
  type: typeof IMPORT_UPLOAD_DETECT_MESSAGE_TYPE;
  version: 1;
  tenantId: string;
  jobId: string;
  fileId: string;
  correlationId: string;
  actorUserId: string | null;
  s3Bucket: string;
  s3Key: string;
  expectedFormat: "csv" | "xlsx" | "json" | null;
  enqueuedAt: string;
};

export function createImportUploadDetectMessage(
  input: Omit<ImportUploadDetectMessage, "type" | "version" | "enqueuedAt"> & {
    enqueuedAt?: string;
  },
): ImportUploadDetectMessage {
  return {
    type: IMPORT_UPLOAD_DETECT_MESSAGE_TYPE,
    version: 1,
    tenantId: input.tenantId,
    jobId: input.jobId,
    fileId: input.fileId,
    correlationId: input.correlationId,
    actorUserId: input.actorUserId,
    s3Bucket: input.s3Bucket,
    s3Key: input.s3Key,
    expectedFormat: input.expectedFormat,
    enqueuedAt: input.enqueuedAt ?? new Date().toISOString(),
  };
}
