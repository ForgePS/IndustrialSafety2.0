/** MIME / size rules for personnel driver's license front/back uploads. */

export const MAX_PERSONNEL_LICENSE_BYTES = 12 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

export type PersonnelLicenseSide = "front" | "back";

export function isPersonnelLicenseSide(value: string): value is PersonnelLicenseSide {
  return value === "front" || value === "back";
}

export function isAllowedPersonnelLicenseMime(mimeType: string): boolean {
  return ALLOWED.has(mimeType.trim().toLowerCase());
}

export function personnelLicenseObjectKeyPrefix(
  tenantId: string,
  side: PersonnelLicenseSide,
): string {
  return `tenants/${tenantId}/personnel/license/${side}/`;
}
