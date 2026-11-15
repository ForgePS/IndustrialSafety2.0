/**
 * Binary certificate / proof uploads for previous training records
 * via presigned S3 PUT (same headers as personnel certs).
 */

export const MAX_TRAINING_RECORD_ATTACHMENT_BYTES = 12 * 1024 * 1024;

export type TrainingRecordAttachment = {
  documentId: string;
  fileName: string;
  contentType?: string;
  uploadedAt?: string;
};

export function guessTrainingRecordAttachmentMime(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType) return fromType;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export function putPresignedTrainingRecordUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessTrainingRecordAttachmentMime(file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-amz-server-side-encryption", "aws:kms");
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload to storage failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload blocked by the browser (network or CORS). Try again after a hard refresh.",
        ),
      );
    xhr.send(file);
  });
}
