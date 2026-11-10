/**
 * Incremental saves for sanitation inspection answers.
 *
 * Photos are stored inline on each answer as data URLs, so re-sending every answer with
 * every photo made saves 10–20 MB and a dropped upload lost the whole inspection. The web
 * app now saves answers without photos (merge mode) and uploads each photo on its own.
 */

import { ForgeError } from "@forge/errors";

/** Same cap as the web checklist. Photos are stored in S3, so the inspection row stays small. */
export const SANITATION_MAX_QUESTION_PHOTOS = 50;
/** One compressed photo is ~1.2 MB as a data URL; leave headroom without allowing raw camera files. */
export const SANITATION_MAX_PHOTO_DATA_URL_LENGTH = 4_000_000;

export type SanitationResponsePhoto = {
  id: string;
  fileName: string;
  contentType: string;
  dataUrl: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Merge incoming answers over the stored ones. Questions not sent are kept. An answer
 * sent without a `photos` key keeps the photos already stored for that question.
 */
export function mergeSanitationResponses(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(incoming)) {
    const previous = stored[key];
    if (isObject(value) && !("photos" in value) && isObject(previous) && "photos" in previous) {
      out[key] = { ...value, photos: previous.photos };
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Validate one uploaded photo. */
export function parseSanitationPhoto(value: unknown): SanitationResponsePhoto {
  if (!isObject(value)) throw new ForgeError("VALIDATION_FAILED", "photo is required");
  const id = String(value.id ?? "").trim();
  if (!id || id.length > 120) throw new ForgeError("VALIDATION_FAILED", "photo.id is required");
  const dataUrl = String(value.dataUrl ?? "");
  if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
    throw new ForgeError("VALIDATION_FAILED", "photo.dataUrl must be an image data URL");
  }
  if (dataUrl.length > SANITATION_MAX_PHOTO_DATA_URL_LENGTH) {
    throw new ForgeError("VALIDATION_FAILED", "Photo is too large");
  }
  return {
    id,
    fileName: String(value.fileName ?? "photo.jpg").slice(0, 255) || "photo.jpg",
    contentType: String(value.contentType ?? "image/jpeg").slice(0, 120) || "image/jpeg",
    dataUrl,
  };
}

function photoList(entry: unknown): unknown[] {
  return isObject(entry) && Array.isArray(entry.photos) ? entry.photos : [];
}

function photoId(photo: unknown): string {
  return isObject(photo) ? String(photo.id ?? "") : "";
}

/** Add a photo to one question's answer. Re-uploading the same photo id is a no-op. */
export function addSanitationResponsePhoto(
  responses: Record<string, unknown>,
  questionKey: string,
  photo: SanitationResponsePhoto | SanitationStoredPhoto,
  answerFields: Record<string, unknown> = {},
): Record<string, unknown> {
  const entry = responses[questionKey];
  const photos = photoList(entry);
  if (photos.some((p) => photoId(p) === photo.id)) return responses;
  if (photos.length >= SANITATION_MAX_QUESTION_PHOTOS) {
    throw new ForgeError(
      "VALIDATION_FAILED",
      `A question can have at most ${SANITATION_MAX_QUESTION_PHOTOS} photos`,
    );
  }
  const base = isObject(entry) ? entry : { result: entry ?? "", ...answerFields };
  return { ...responses, [questionKey]: { ...base, photos: [...photos, photo] } };
}

/** Remove a photo from one question's answer. */
export function removeSanitationResponsePhoto(
  responses: Record<string, unknown>,
  questionKey: string,
  id: string,
): Record<string, unknown> {
  const entry = responses[questionKey];
  if (!isObject(entry)) return responses;
  const photos = photoList(entry);
  const kept = photos.filter((p) => photoId(p) !== id);
  if (kept.length === photos.length) return responses;
  return { ...responses, [questionKey]: { ...entry, photos: kept } };
}

/** A photo stored in S3; the inspection keeps only this reference. */
export type SanitationStoredPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  objectKey: string;
  sizeBytes: number;
};

/** Tenant-scoped S3 key for one checklist photo. */
export function sanitationPhotoObjectKey(
  tenantId: string,
  inspectionId: string,
  photoId: string,
  contentType: string,
): string {
  const safeId = photoId.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 120) || "photo";
  const ext = /png/i.test(contentType) ? "png" : /webp/i.test(contentType) ? "webp" : "jpg";
  return `tenants/${tenantId}/sanitation/inspections/${inspectionId}/photos/${safeId}.${ext}`;
}

/** Decode an uploaded photo's data URL. */
export function decodeSanitationPhoto(photo: SanitationResponsePhoto): {
  body: Buffer;
  contentType: string;
} {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/is.exec(photo.dataUrl);
  if (!match) throw new ForgeError("VALIDATION_FAILED", "photo.dataUrl must be an image data URL");
  const body = Buffer.from(match[2]!, "base64");
  if (!body.length) throw new ForgeError("VALIDATION_FAILED", "Photo is empty");
  return { body, contentType: match[1]!.toLowerCase() };
}

/** Apply `change` to every photo object in the answers. Returns the same object if nothing changed. */
export function mapSanitationPhotos(
  responses: Record<string, unknown>,
  change: (photo: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> {
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(responses)) {
    if (!isObject(entry) || !Array.isArray(entry.photos)) {
      out[key] = entry;
      continue;
    }
    const photos = entry.photos.map((p) => {
      if (!isObject(p)) return p;
      const next = change(p);
      if (next !== p) changed = true;
      return next;
    });
    out[key] = { ...entry, photos };
  }
  return changed ? out : responses;
}

/** Signed links are added when an inspection is read; never store them. */
export function stripSanitationPhotoUrls(
  responses: Record<string, unknown>,
): Record<string, unknown> {
  return mapSanitationPhotos(responses, (photo) => {
    if (!("url" in photo) || typeof photo.objectKey !== "string") return photo;
    const { url: _url, ...rest } = photo;
    return rest;
  });
}

/** Photos stored in S3 (not inline) that still need a signed link or bytes. */
export function sanitationStoredPhotoKeys(responses: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  mapSanitationPhotos(responses, (photo) => {
    if (typeof photo.objectKey === "string" && photo.objectKey) keys.add(photo.objectKey);
    return photo;
  });
  return [...keys];
}
