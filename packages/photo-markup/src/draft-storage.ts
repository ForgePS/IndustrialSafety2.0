import type { MarkupDocument, PhotoAnnotation } from "./types.js";
import { normalizeAnnotations, normalizeMarkupDocument } from "./normalize.js";

const DRAFT_PREFIX = "forge.photo-markup.draft.v1:";

export type MarkupSessionDraft = {
  imageSrcFingerprint: string;
  photoId?: string;
  annotations: PhotoAnnotation[];
  document?: MarkupDocument;
  savedAt: string;
};

function fingerprint(imageSrc: string): string {
  // Avoid storing full data URLs as keys; hash length is enough for session recovery.
  let hash = 0;
  const sample = imageSrc.slice(0, 200) + String(imageSrc.length);
  for (let i = 0; i < sample.length; i += 1) {
    hash = (hash * 31 + sample.charCodeAt(i)) | 0;
  }
  return `img-${Math.abs(hash)}`;
}

export function markupDraftStorageKey(imageSrc: string, photoId?: string): string {
  const id = photoId?.trim() || fingerprint(imageSrc);
  return `${DRAFT_PREFIX}${id}`;
}

export function saveMarkupSessionDraft(input: {
  imageSrc: string;
  photoId?: string;
  annotations: readonly PhotoAnnotation[];
  document?: MarkupDocument;
}): void {
  if (typeof window === "undefined") return;
  const payload: MarkupSessionDraft = {
    imageSrcFingerprint: fingerprint(input.imageSrc),
    annotations: input.annotations.map((a) => ({ ...a })),
    savedAt: new Date().toISOString(),
  };
  if (input.photoId) payload.photoId = input.photoId;
  if (input.document) payload.document = input.document;
  try {
    window.localStorage.setItem(
      markupDraftStorageKey(input.imageSrc, input.photoId),
      JSON.stringify(payload),
    );
  } catch {
    // quota / private mode
  }
}

export function loadMarkupSessionDraft(
  imageSrc: string,
  photoId?: string,
): MarkupSessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(markupDraftStorageKey(imageSrc, photoId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarkupSessionDraft;
    const annotations = normalizeAnnotations(parsed.annotations);
    if (!annotations.length && !parsed.document) return null;
    const document = parsed.document
      ? normalizeMarkupDocument(parsed.document) ?? undefined
      : undefined;
    return {
      imageSrcFingerprint: String(parsed.imageSrcFingerprint ?? ""),
      annotations,
      savedAt: String(parsed.savedAt ?? ""),
      ...(parsed.photoId ? { photoId: parsed.photoId } : {}),
      ...(document ? { document } : {}),
    };
  } catch {
    return null;
  }
}

export function clearMarkupSessionDraft(imageSrc: string, photoId?: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(markupDraftStorageKey(imageSrc, photoId));
}
