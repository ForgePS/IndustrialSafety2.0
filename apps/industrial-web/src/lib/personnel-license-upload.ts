/**
 * Personnel driver's license front/back uploads via presigned S3 (same 12 MB
 * path as DQF) — not inlined data URLs.
 */

export const MAX_PERSONNEL_LICENSE_BYTES = 12 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PersonnelLicenseSide = "front" | "back";

export function isLicenseDocumentId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

export function guessPersonnelLicenseMime(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType) return fromType;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export function putPresignedLicenseUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessPersonnelLicenseMime(file);
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

/** Read documentId from a license upload object or driversLicenseCopy list. */
export function licenseDocumentIdFromUpload(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string" && isLicenseDocumentId(raw)) return raw.trim();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const id = licenseDocumentIdFromUpload(entry);
      if (id) return id;
    }
    return null;
  }
  if (typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const documentId = String(row.documentId ?? "").trim();
  return isLicenseDocumentId(documentId) ? documentId : null;
}

/** Filename from a license upload object / driversLicenseCopy entry. */
export function licenseFileNameFromUpload(raw: unknown): string | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const entry = row as Record<string, unknown>;
  const name = String(
    entry.name ?? entry.fileName ?? entry.originalFilename ?? entry.filename ?? "",
  ).trim();
  return name || null;
}

/** MIME / content type from a license upload object. */
export function licenseMimeFromUpload(raw: unknown): string | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const entry = row as Record<string, unknown>;
  const mime = String(entry.contentType ?? entry.mimeType ?? "")
    .trim()
    .toLowerCase();
  return mime || null;
}

/** True when the stored copy is a PDF (img tags cannot render these). */
export function isLicensePdfCopy(args: {
  mimeType?: string | null;
  fileName?: string | null;
  src?: string | null;
}): boolean {
  const mime = String(args.mimeType ?? "")
    .trim()
    .toLowerCase();
  if (mime === "application/pdf" || mime.includes("pdf")) return true;
  const name = String(args.fileName ?? "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const src = String(args.src ?? "")
    .trim()
    .toLowerCase();
  if (src.startsWith("data:application/pdf")) return true;
  if (/\.pdf(\?|#|$)/i.test(src)) return true;
  return false;
}

export function isLicenseImageMime(mimeType: string | null | undefined): boolean {
  const mime = String(mimeType ?? "")
    .trim()
    .toLowerCase();
  return mime.startsWith("image/");
}
