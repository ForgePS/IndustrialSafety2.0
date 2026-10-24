import { apiFetchRaw, apiGet, apiSend } from "@forge/web-kit";
import { trainingApi } from "./api";
import type { TrainingMaterial, TrainingMaterialTopic, TrainingSourceFolder } from "./types";

export type TrainingMaterialViewUrl = {
  id: string;
  title: string;
  mimeType: string;
  originalFilename: string;
  byteSize: number;
  viewUrl: string;
  expiresInSeconds: number;
  expiresAt: string;
  mode: string;
};

/** Office Online embed limit is roughly 10 MB; allow a little headroom before falling back. */
export const OFFICE_EMBED_MAX_BYTES = 25_000_000;

export function buildOfficeEmbedUrl(sourceUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`;
}

export function canUseOfficeEmbed(byteSize: number): boolean {
  return !Number.isFinite(byteSize) || byteSize <= 0 || byteSize <= OFFICE_EMBED_MAX_BYTES;
}

/**
 * Office Online's embed frame stays a solid black rectangle on Android Chrome
 * (tablets included). Those devices should use the in-app slide renderer.
 */
export function officeEmbedBlockedForUserAgent(userAgent: string | undefined): boolean {
  return /Android/i.test(userAgent ?? "");
}

export const TRAINING_MATERIAL_ACCEPT =
  ".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.mp4,.webm,.mov,.jpg,.jpeg,.png,.webp,.gif,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,video/mp4,video/webm,video/quicktime,image/*";

export const MAX_TRAINING_MATERIAL_BYTES = 500_000_000;

export const TRAINING_MATERIAL_TOPICS: Array<{ id: TrainingMaterialTopic; label: string }> = [
  { id: "GENERAL", label: "General" },
  { id: "NEW_HIRE", label: "New hire / orientation" },
  { id: "SAFETY", label: "Safety" },
  { id: "LOTO", label: "Lockout / tagout" },
  { id: "PPE", label: "PPE" },
  { id: "EMERGENCY", label: "Emergency response" },
  { id: "FLEET", label: "Fleet / driving" },
  { id: "EQUIPMENT", label: "Equipment" },
  { id: "COMPLIANCE", label: "Compliance / OSHA" },
  { id: "REFRESHER", label: "Refresher" },
];

const LEGACY_MEDIA_KINDS = new Set(["VIDEO", "PRESENTATION", "IMAGE", "DOCUMENT"]);

export function materialTopicLabel(category: string): string {
  return TRAINING_MATERIAL_TOPICS.find((t) => t.id === category)?.label ?? "General";
}

export function materialMediaKind(
  material: Pick<TrainingMaterial, "mediaKind" | "category" | "mimeType"> & {
    originalFilename?: string;
  },
): string {
  if (material.mediaKind) return material.mediaKind;
  if (LEGACY_MEDIA_KINDS.has(material.category)) return material.category;
  if (isTrainingVideoFile(material)) return "VIDEO";
  const mime = material.mimeType.toLowerCase();
  if (mime.includes("powerpoint") || mime.includes("presentation")) return "PRESENTATION";
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime === "application/pdf") return "DOCUMENT";
  return "GENERAL";
}

export function formatMaterialBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function materialMediaLabel(mediaKind: string): string {
  switch (mediaKind) {
    case "VIDEO":
      return "Video";
    case "PRESENTATION":
      return "PowerPoint";
    case "IMAGE":
      return "Image";
    case "DOCUMENT":
      return "Document";
    default:
      return "File";
  }
}

export function materialIconClass(
  material: Pick<TrainingMaterial, "mediaKind" | "category" | "mimeType">,
): string {
  const kind = materialMediaKind(material);
  if (kind === "VIDEO") return "bx-video";
  if (kind === "PRESENTATION") return "bx-slideshow";
  if (kind === "IMAGE") return "bx-image";
  if (kind === "DOCUMENT") return "bx-file-blank";
  return "bx-file";
}

export function guessTrainingMaterialMime(file: File): string {
  const typed = (file.type || "").trim().toLowerCase();
  if (typed && typed !== "application/octet-stream") return typed;
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (name.endsWith(".pptx")) {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (name.endsWith(".mp4")) return "video/mp4";
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".mov")) return "video/quicktime";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return typed || "application/octet-stream";
}

export function canInlinePreview(mimeType: string, filename?: string): boolean {
  const mime = mimeType.toLowerCase();
  if (mime === "application/pdf" || mime.startsWith("image/")) return true;
  return isTrainingVideoFile({ mimeType, filename });
}

/** Prefer a streamable URL (presigned / content) over downloading the full blob first. */
export function prefersStreamPreview(mimeType: string, filename?: string): boolean {
  const mime = mimeType.toLowerCase();
  if (mime === "application/pdf" || mime.startsWith("image/")) return true;
  return isTrainingVideoFile({ mimeType, filename });
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

export function resolveTrainingVideoPlaybackMime(input: {
  mimeType?: string | null;
  filename?: string | null;
  originalFilename?: string | null;
}): string {
  const mime = String(input.mimeType ?? "")
    .trim()
    .toLowerCase();
  // Normalized training videos are always MP4. Prefer video/mp4 for QuickTime /
  // generic video labels so Android Chrome does not refuse the <source type>.
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "video/x-m4v") {
    return "video/mp4";
  }
  if (mime.startsWith("video/") && mime !== "application/octet-stream") return mime;
  const name = String(input.filename ?? input.originalFilename ?? "")
    .trim()
    .toLowerCase();
  if (name.endsWith(".webm")) return "video/webm";
  if (name.endsWith(".ogv") || name.endsWith(".ogg")) return "video/ogg";
  // .mov / .m4v / unknown → mp4 after normalize (and safest mobile default)
  return "video/mp4";
}

export function isPresentationMime(mimeType: string, filename?: string): boolean {
  const mime = mimeType.toLowerCase();
  const name = (filename ?? "").toLowerCase();
  return (
    mime.includes("powerpoint") ||
    mime.includes("presentation") ||
    name.endsWith(".ppt") ||
    name.endsWith(".pptx")
  );
}

export function isPptxMime(mimeType: string, filename?: string): boolean {
  const mime = mimeType.toLowerCase();
  const name = (filename ?? "").toLowerCase();
  return (
    mime.includes("openxmlformats-officedocument.presentationml") ||
    mime.includes("presentationml.presentation") ||
    name.endsWith(".pptx")
  );
}

/** Types that open in the in-app viewer (not a file download). */
export function canViewInApp(mimeType: string, filename?: string): boolean {
  return canInlinePreview(mimeType, filename) || isPresentationMime(mimeType, filename);
}

export function fitPresentationViewport(
  slideWidth: number,
  slideHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (slideWidth <= 0 || slideHeight <= 0 || maxWidth <= 0 || maxHeight <= 0) {
    return { width: Math.max(maxWidth, 1), height: Math.max(maxHeight, 1) };
  }
  let width = maxWidth;
  let height = Math.round(slideHeight * (width / slideWidth));
  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(slideWidth * (height / slideHeight));
  }
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

export function trainingMaterialContentPath(materialId: string): string {
  return `/api/v1/industrial/training/materials/${materialId}/content`;
}

function publicTrainingMaterialApiPrefix(
  accessToken: string,
  options?: { accessPortal?: boolean },
): string {
  return options?.accessPortal
    ? `/api/v1/public/training/access/${encodeURIComponent(accessToken)}`
    : `/api/v1/public/training/${encodeURIComponent(accessToken)}`;
}

export function publicTrainingMaterialContentPath(
  accessToken: string,
  materialId: string,
  sessionToken: string,
  options?: { accessPortal?: boolean },
): string {
  const prefix = publicTrainingMaterialApiPrefix(accessToken, options);
  return `${prefix}/materials/${encodeURIComponent(materialId)}/content?sessionToken=${encodeURIComponent(sessionToken)}`;
}

export function publicTrainingMaterialViewUrlPath(
  accessToken: string,
  materialId: string,
  sessionToken: string,
  options?: { accessPortal?: boolean },
): string {
  const prefix = publicTrainingMaterialApiPrefix(accessToken, options);
  return `${prefix}/materials/${encodeURIComponent(materialId)}/view-url?sessionToken=${encodeURIComponent(sessionToken)}`;
}

export async function fetchTrainingMaterialViewUrl(
  materialId: string,
): Promise<TrainingMaterialViewUrl> {
  return apiSend<TrainingMaterialViewUrl>(
    `/api/v1/industrial/training/materials/${encodeURIComponent(materialId)}/view-url`,
    "POST",
  );
}

export async function fetchPublicTrainingMaterialViewUrl(params: {
  accessToken: string;
  materialId: string;
  sessionToken: string;
  accessPortal?: boolean;
}): Promise<TrainingMaterialViewUrl> {
  const viewPath = params.accessPortal
    ? publicTrainingMaterialViewUrlPath(
        params.accessToken,
        params.materialId,
        params.sessionToken,
        { accessPortal: true },
      )
    : publicTrainingMaterialViewUrlPath(params.accessToken, params.materialId, params.sessionToken);
  return apiGet<TrainingMaterialViewUrl>(viewPath);
}

export async function fetchTrainingMaterialBlob(materialId: string): Promise<Blob> {
  const res = await apiFetchRaw(trainingMaterialContentPath(materialId));
  if (!res.ok) {
    let message = `Could not open material (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  return res.blob();
}

export async function fetchPublicTrainingMaterialBlob(params: {
  accessToken: string;
  materialId: string;
  sessionToken: string;
  accessPortal?: boolean;
}): Promise<Blob> {
  const contentPath = params.accessPortal
    ? publicTrainingMaterialContentPath(
        params.accessToken,
        params.materialId,
        params.sessionToken,
        { accessPortal: true },
      )
    : publicTrainingMaterialContentPath(params.accessToken, params.materialId, params.sessionToken);
  const res = await apiFetchRaw(contentPath);
  if (!res.ok) {
    let message = `Could not open material (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  return res.blob();
}

export async function downloadTrainingMaterial(
  material: Pick<TrainingMaterial, "id" | "originalFilename">,
): Promise<void> {
  const blob = await fetchTrainingMaterialBlob(material.id);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = material.originalFilename || "download";
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function createTrainingMaterialPreviewUrl(
  material: Pick<TrainingMaterial, "id">,
): Promise<string> {
  const blob = await fetchTrainingMaterialBlob(material.id);
  return URL.createObjectURL(blob);
}

/** PUT bytes to a Forge presigned document URL (signs SSE-KMS + content type/length). */
export function putPresignedDocumentUpload(
  uploadUrl: string,
  file: File,
  mimeType: string,
): Promise<void> {
  const contentType = mimeType.trim() || guessTrainingMaterialMime(file);
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

export function groupMaterialsByTopic(
  materials: TrainingMaterial[],
): Array<{ topic: TrainingMaterialTopic; label: string; items: TrainingMaterial[] }> {
  const buckets = new Map<TrainingMaterialTopic, TrainingMaterial[]>();
  for (const topic of TRAINING_MATERIAL_TOPICS) {
    buckets.set(topic.id, []);
  }
  for (const material of materials) {
    const topic = TRAINING_MATERIAL_TOPICS.some((t) => t.id === material.category)
      ? (material.category as TrainingMaterialTopic)
      : "GENERAL";
    buckets.get(topic)!.push(material);
  }
  return TRAINING_MATERIAL_TOPICS.map((topic) => ({
    topic: topic.id,
    label: topic.label,
    items: buckets.get(topic.id) ?? [],
  })).filter((group) => group.items.length > 0);
}

export function groupMaterialsByFolder(
  materials: TrainingMaterial[],
  folders: TrainingSourceFolder[],
): Array<{ folderId: string | null; label: string; items: TrainingMaterial[] }> {
  const groups: Array<{ folderId: string | null; label: string; items: TrainingMaterial[] }> =
    folders.map((folder) => ({
      folderId: folder.id,
      label: folder.name,
      items: materials.filter((material) => (material.folderId?.trim() || null) === folder.id),
    }));
  groups.push({
    folderId: null,
    label: "Uncategorized",
    items: materials.filter((material) => !material.folderId?.trim()),
  });
  return groups;
}

export async function uploadTrainingMaterialFile(params: {
  file: File;
  title?: string;
  description?: string;
  category?: TrainingMaterialTopic;
  sourceId?: string | null;
  folderId?: string | null;
  visibility?: string;
}): Promise<string> {
  if (params.file.size <= 0 || params.file.size > MAX_TRAINING_MATERIAL_BYTES) {
    throw new Error(
      `File must be between 1 byte and ${formatMaterialBytes(MAX_TRAINING_MATERIAL_BYTES)}.`,
    );
  }
  const title =
    params.title?.trim() || params.file.name.replace(/\.[^.]+$/, "") || params.file.name;
  const mimeType = guessTrainingMaterialMime(params.file);
  const init = await trainingApi.createMaterialUploadUrl({
    title,
    ...(params.description?.trim() ? { description: params.description.trim() } : {}),
    filename: params.file.name,
    mimeType,
    contentLength: params.file.size,
    visibility: params.visibility ?? "PUBLISHED",
    category: params.category ?? "GENERAL",
    ...(params.sourceId ? { sourceId: params.sourceId } : {}),
    ...(params.folderId ? { folderId: params.folderId } : {}),
  });
  await putPresignedDocumentUpload(init.uploadUrl, params.file, mimeType);
  await trainingApi.completeMaterialUpload(init.id);
  return init.id;
}

/** @deprecated use materialTopicLabel */
export function materialCategoryLabel(category: string): string {
  return materialTopicLabel(category);
}
