/** MIME / size rules for training record certificate / proof uploads. */

export const MAX_TRAINING_RECORD_ATTACHMENT_BYTES = 12 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isAllowedTrainingRecordAttachmentMime(mimeType: string): boolean {
  return ALLOWED.has(mimeType.trim().toLowerCase());
}

export function trainingRecordAttachmentObjectKeyPrefix(
  tenantId: string,
  recordId: string,
): string {
  return `tenants/${tenantId}/training/records/${recordId}/`;
}

export const TRAINING_RECORD_ATTACHMENT_SOURCE = "INDUSTRIAL_TRAINING_RECORD";
