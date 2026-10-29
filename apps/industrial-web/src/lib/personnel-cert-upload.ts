/**
 * Binary (non-JSON) First Aid / CPR certification copy uploads via
 * presigned S3 PUT — same SSE-KMS headers as training materials.
 */

export const MAX_PERSONNEL_CERT_BYTES = 12 * 1024 * 1024;

export type PersonnelCertKind = "CPR" | "FIRST_AID";

export type PersonnelCertCopyMeta = {
  documentId: string;
  originalFilename: string;
  mimeType?: string;
  fileSizeBytes?: number;
};

export function guessPersonnelCertMime(file: File): string {
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

export function putPresignedCertUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessPersonnelCertMime(file);
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

export function certCopyFromRecord(
  record: Record<string, unknown>,
  kind: PersonnelCertKind,
): PersonnelCertCopyMeta | null {
  const nestedKey = kind === "CPR" ? "cprCertificationCopy" : "firstAidCertificationCopy";
  const idKey = kind === "CPR" ? "cprCertificationDocumentId" : "firstAidCertificationDocumentId";
  const nested = record[nestedKey];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const row = nested as Record<string, unknown>;
    const documentId = typeof row.documentId === "string" ? row.documentId.trim() : "";
    const originalFilename =
      typeof row.originalFilename === "string" ? row.originalFilename.trim() : "";
    if (documentId && originalFilename) {
      return {
        documentId,
        originalFilename,
        ...(typeof row.mimeType === "string" ? { mimeType: row.mimeType } : {}),
        ...(typeof row.fileSizeBytes === "number" ? { fileSizeBytes: row.fileSizeBytes } : {}),
      };
    }
  }
  const documentId = typeof record[idKey] === "string" ? String(record[idKey]).trim() : "";
  if (!documentId) return null;
  return { documentId, originalFilename: "Certification copy" };
}
