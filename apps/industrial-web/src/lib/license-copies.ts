/**
 * Driver's license front/back copies for company drivers and DOT (DQF).
 * Uploads land as objects (Firebase / companyVehicleDrivers) or as URL strings
 * on the personnel record; both resolve to a viewable image src.
 */

import { licenseDocumentIdFromUpload } from "./personnel-license-upload";

export type LicenseCopies = {
  front: string | null;
  back: string | null;
};

/**
 * Cap for inlined license JPEG data URLs. Matches the industrial API
 * document/dataUrl guard (3.5M) so phone photos can survive compression.
 */
export const MAX_LICENSE_DATA_URL_LENGTH = 3_500_000;

export function uploadImageSrc(raw: unknown, seen?: Set<object>, depth = 0): string | null {
  if (depth > 12) return null;
  if (typeof raw === "string") {
    const value = raw.trim();
    if (value === "") return null;
    if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) return value;
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const visited = seen ?? new Set<object>();
  if (visited.has(raw)) return null;
  visited.add(raw);
  const entry = raw as Record<string, unknown>;
  for (const key of ["dataUrl", "url", "downloadURL", "downloadUrl", "src", "href"]) {
    const nested = uploadImageSrc(entry[key], visited, depth + 1);
    if (nested) return nested;
  }
  return null;
}

export function isOversizedLicenseImage(value: string): boolean {
  return value.startsWith("data:image/") && value.length > MAX_LICENSE_DATA_URL_LENGTH;
}

export function isAcceptableLicenseImage(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  return trimmed.startsWith("data:image/") && trimmed.length <= MAX_LICENSE_DATA_URL_LENGTH;
}

/** Build the upload object shape used by companyVehicleDrivers / DQF imports. */
export function toLicenseUpload(
  dataUrl: string,
  side: "front" | "back",
): Record<string, unknown> | null {
  const value = dataUrl.trim();
  if (value === "") return null;
  const contentType = value.startsWith("data:")
    ? (value.match(/^data:([^;]+)/)?.[1] ?? "image/jpeg")
    : "image/jpeg";
  const upload: Record<string, unknown> = {
    fileName: `drivers-license-${side}.jpg`,
    contentType,
    uploadedAt: new Date().toISOString(),
  };
  if (value.startsWith("data:")) upload.dataUrl = value;
  else upload.url = value;
  return upload;
}

/**
 * Prefer explicit URL fields, then the company-driver / DQF upload objects.
 * Also accepts a single `driversLicenseCopy` document when it is image-like.
 */
export function personnelLicenseCopies(record: Record<string, unknown>): LicenseCopies {
  const frontUrl = uploadImageSrc(record.licenseFrontUrl);
  const backUrl = uploadImageSrc(record.licenseBackUrl);
  const frontUpload = uploadImageSrc(record.licenseFrontUpload);
  const backUpload = uploadImageSrc(record.licenseBackUpload);

  const frontDoc = licenseDocumentIdFromUpload(record.licenseFrontUpload);
  const backDoc = licenseDocumentIdFromUpload(record.licenseBackUpload);
  const dotFrontDoc = licenseDocumentIdFromUpload(record.driversLicenseCopy);
  const dotBackDoc = licenseDocumentIdFromUpload(record.driversLicenseBack);

  const front = frontUrl ?? frontUpload ?? uploadImageSrc(record.driversLicenseFront) ?? null;
  const back = backUrl ?? backUpload ?? uploadImageSrc(record.driversLicenseBack) ?? null;
  if (front || back) return { front, back };

  if (frontDoc || backDoc || dotFrontDoc || dotBackDoc) {
    return {
      front: frontDoc ?? dotFrontDoc,
      back: backDoc ?? dotBackDoc,
    };
  }

  const copy =
    uploadImageSrc(record.driversLicenseCopy) ??
    uploadImageSrc(Array.isArray(record.driversLicenseCopy) ? record.driversLicenseCopy[0] : null);
  return { front: copy, back: null };
}

export function hasLicenseCopyGap(copies: LicenseCopies): boolean {
  return !copies.front || !copies.back;
}
