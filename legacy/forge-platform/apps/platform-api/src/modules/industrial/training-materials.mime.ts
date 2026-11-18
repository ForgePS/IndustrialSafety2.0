/** Allowed MIME types for industrial training material uploads. */
export const TRAINING_MATERIAL_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function isAllowedTrainingMaterialMime(mimeType: string): boolean {
  return TRAINING_MATERIAL_ALLOWED_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

export function trainingMaterialCategoryForMime(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("video/")) return "VIDEO";
  if (
    mime.includes("powerpoint") ||
    mime.includes("presentation") ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return "PRESENTATION";
  }
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime === "application/pdf") return "DOCUMENT";
  return "GENERAL";
}

/** Detect training videos from MIME and/or filename (do not rely on extension alone). */
export function isTrainingVideoFile(input: {
  mimeType?: string | null | undefined;
  filename?: string | null | undefined;
  originalFilename?: string | null | undefined;
  fileName?: string | null | undefined;
}): boolean {
  const mime = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  const name = String(input.filename ?? input.originalFilename ?? input.fileName ?? "")
    .trim()
    .toLowerCase();
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|m4v|webm|ogv|ogg|mov)$/i.test(name);
}

/** Best Content-Type for inline video playback when stored MIME is missing/wrong. */
export function resolveTrainingVideoPlaybackMime(input: {
  mimeType?: string | null | undefined;
  filename?: string | null | undefined;
  originalFilename?: string | null | undefined;
}): string {
  const mime = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  // Normalized training videos are MP4. Prefer video/mp4 for QuickTime labels so
  // Android Chrome does not refuse playback based on a mismatched type hint.
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "video/x-m4v") {
    return "video/mp4";
  }
  if (mime.startsWith("video/") && mime !== "application/octet-stream") return mime;
  const name = String(input.filename ?? input.originalFilename ?? "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".ogv") || name.endsWith(".ogg")) return "video/ogg";
  return "video/mp4";
}
