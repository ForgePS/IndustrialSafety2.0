/** MIME / size rules for DOT DQF document copy uploads. */

export const MAX_DOT_DQF_DOCUMENT_BYTES = 12 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isAllowedDotDqfDocumentMime(mimeType: string): boolean {
  return ALLOWED.has(mimeType.trim().toLowerCase());
}

export function dotDqfDocumentObjectKeyPrefix(tenantId: string, fieldId: string): string {
  const safeField = fieldId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 80) || "document";
  return `tenants/${tenantId}/dot/dqf/${safeField}/`;
}
