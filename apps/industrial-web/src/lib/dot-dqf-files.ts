export type DotFormFileValue = {
  name: string;
  contentType?: string;
  documentId?: string;
  url?: string;
  dataUrl?: string;
  uploadedAt?: string;
  fileSizeBytes?: number;
};

export const MAX_DOT_DQF_DOCUMENT_BYTES = 12 * 1024 * 1024;

function isFormFileValue(value: unknown): value is DotFormFileValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== "string") return false;
  return (
    typeof row.documentId === "string" ||
    typeof row.url === "string" ||
    typeof row.dataUrl === "string"
  );
}

export function parseDotFileValues(value: string | undefined): DotFormFileValue[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isFormFileValue);
    return isFormFileValue(parsed) ? [parsed] : [];
  } catch {
    return [];
  }
}

export function serializeDotFileValues(files: DotFormFileValue[]): string {
  return files.length > 0 ? JSON.stringify(files.map(slimDotFileValueForPersist)) : "";
}

/** Persist only metadata — never re-embed base64 data URLs. */
export function slimDotFileValueForPersist(file: DotFormFileValue): DotFormFileValue {
  const documentId = file.documentId?.trim();
  if (documentId) {
    return {
      name: file.name,
      documentId,
      ...(file.contentType ? { contentType: file.contentType } : {}),
      ...(typeof file.fileSizeBytes === "number" ? { fileSizeBytes: file.fileSizeBytes } : {}),
      ...(file.uploadedAt ? { uploadedAt: file.uploadedAt } : {}),
    };
  }
  const url = file.url?.trim();
  if (url && !url.startsWith("data:")) {
    return {
      name: file.name,
      url,
      ...(file.contentType ? { contentType: file.contentType } : {}),
      ...(file.uploadedAt ? { uploadedAt: file.uploadedAt } : {}),
    };
  }
  // Legacy inline embeds: keep a stub so "has file" checks still work without
  // shipping multi-MB payloads back to the API.
  if (file.dataUrl?.startsWith("data:")) {
    return {
      name: file.name,
      dataUrl: "data:omitted",
      ...(file.contentType ? { contentType: file.contentType } : {}),
      ...(file.uploadedAt ? { uploadedAt: file.uploadedAt } : {}),
    };
  }
  return { name: file.name };
}

export function slimDotFileFieldValue(value: string | undefined): string {
  const files = parseDotFileValues(value);
  if (files.length === 0) return "";
  return serializeDotFileValues(files);
}

/** True when the entry can be opened (document, remote URL, or real data URL). */
export function isOpenableDotFile(file: DotFormFileValue): boolean {
  if (file.documentId?.trim()) return true;
  const url = file.url?.trim();
  if (url && !url.startsWith("data:")) return true;
  const dataUrl = file.dataUrl?.trim();
  return Boolean(dataUrl && dataUrl !== "data:omitted" && dataUrl.startsWith("data:"));
}

export function dotFileStatusLabel(value: string | undefined): string {
  const files = parseDotFileValues(value);
  if (files.length === 0) return "No file uploaded";
  const openable = files.filter(isOpenableDotFile);
  if (openable.length === 0) return "Needs re-upload";
  if (openable.length === 1) return openable[0]!.name;
  return `${openable.length} files uploaded`;
}

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)$/i;

export function dotFilePreviewSrc(file: DotFormFileValue): string | null {
  if (file.dataUrl?.trim() && file.dataUrl !== "data:omitted") return file.dataUrl.trim();
  if (file.url?.trim() && !file.url.startsWith("data:")) return file.url.trim();
  return null;
}

export function isImageDotFile(file: DotFormFileValue): boolean {
  if (file.contentType?.startsWith("image/")) return true;
  const candidate = (file.name || file.url || "").split(/[?#]/)[0] ?? "";
  return IMAGE_EXTENSION_PATTERN.test(candidate);
}

export function guessDotDqfMime(file: File): string {
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

export function putPresignedDotDqfUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessDotDqfMime(file);
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
