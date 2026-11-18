/** Allowed MIME types for company document uploads (PDF / Office / images). */
export const COMPANY_DOCUMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isAllowedCompanyDocumentMime(mimeType: string): boolean {
  return COMPANY_DOCUMENT_ALLOWED_MIME_TYPES.has(mimeType.trim().toLowerCase());
}
