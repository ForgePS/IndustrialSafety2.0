const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
]);

const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
]);

const ALLOWED_MIMES = new Set([...IMAGE_MIMES, ...DOCUMENT_MIMES]);

export const MAX_MESSAGING_ATTACHMENT_BYTES = 25_000_000;

export function isAllowedMessagingMime(mimeType: string): boolean {
  return ALLOWED_MIMES.has(mimeType.toLowerCase());
}

export function messagingAttachmentTypeForMime(mimeType: string): "IMAGE" | "DOCUMENT" | "FILE" {
  const mime = mimeType.toLowerCase();
  if (IMAGE_MIMES.has(mime)) return "IMAGE";
  if (DOCUMENT_MIMES.has(mime)) return "DOCUMENT";
  return "FILE";
}

export function canStreamInline(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  return mime === "application/pdf" || mime.startsWith("image/");
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildMessagePreview(body: string, hasAttachments: boolean): string {
  const trimmed = body.trim();
  if (trimmed) return trimmed.slice(0, 200);
  if (hasAttachments) return "Shared an attachment";
  return "";
}
