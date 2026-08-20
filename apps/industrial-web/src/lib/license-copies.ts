/**
 * Driver's license front/back copies for company drivers and DOT (DQF).
 * Uploads land as objects (Firebase / companyVehicleDrivers) or as URL strings
 * on the personnel record; both resolve to a viewable image src.
 */

export type LicenseCopies = {
  front: string | null;
  back: string | null;
};

/** Rough cap so a high-res phone photo cannot bloat the personnel row. */
export const MAX_LICENSE_DATA_URL_LENGTH = 1_500_000;

export function uploadImageSrc(raw: unknown): string | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (value === "") return null;
    if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) return value;
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const entry = raw as Record<string, unknown>;
  for (const key of ["dataUrl", "url", "downloadURL", "downloadUrl", "src", "href"]) {
    const nested = uploadImageSrc(entry[key]);
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
  const front =
    uploadImageSrc(record.licenseFrontUrl) ??
    uploadImageSrc(record.licenseFrontUpload) ??
    uploadImageSrc(record.driversLicenseFront) ??
    null;
  const back =
    uploadImageSrc(record.licenseBackUrl) ??
    uploadImageSrc(record.licenseBackUpload) ??
    uploadImageSrc(record.driversLicenseBack) ??
    null;
  if (front || back) return { front, back };

  // Some DQF imports only stored one combined "copy" document.
  const copy =
    uploadImageSrc(record.driversLicenseCopy) ??
    uploadImageSrc(
      Array.isArray(record.driversLicenseCopy) ? record.driversLicenseCopy[0] : null,
    );
  return { front: copy, back: null };
}

export function hasLicenseCopyGap(copies: LicenseCopies): boolean {
  return !copies.front || !copies.back;
}
