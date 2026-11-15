/**
 * Binary document uploads for industrial incidents via presigned S3 PUT.
 */

export const MAX_INCIDENT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type IncidentAttachment = {
  documentId: string;
  fileName: string;
  contentType?: string;
  uploadedAt?: string;
};

export function guessIncidentAttachmentMime(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType) return fromType;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (name.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

export function putPresignedIncidentUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessIncidentAttachmentMime(file);
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

export function parseIncidentAttachments(raw: unknown): IncidentAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: IncidentAttachment[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const documentId = typeof row.documentId === "string" ? row.documentId.trim() : "";
    if (!documentId || seen.has(documentId)) continue;
    seen.add(documentId);
    const fileName =
      (typeof row.fileName === "string" && row.fileName.trim()) ||
      (typeof row.originalFilename === "string" && row.originalFilename.trim()) ||
      "Attachment";
    out.push({
      documentId,
      fileName,
      ...(typeof row.contentType === "string" ? { contentType: row.contentType } : {}),
      ...(typeof row.uploadedAt === "string" ? { uploadedAt: row.uploadedAt } : {}),
    });
  }
  return out;
}
