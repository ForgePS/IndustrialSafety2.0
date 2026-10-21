/** MIME / size rules for First Aid & CPR certification copy uploads. */

export const MAX_PERSONNEL_CERT_BYTES = 12 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export type PersonnelCertKind = "CPR" | "FIRST_AID";

export function isPersonnelCertKind(value: string): value is PersonnelCertKind {
  return value === "CPR" || value === "FIRST_AID";
}

export function isAllowedPersonnelCertMime(mimeType: string): boolean {
  return ALLOWED.has(mimeType.trim().toLowerCase());
}

export function personnelCertObjectKeyPrefix(tenantId: string, kind: PersonnelCertKind): string {
  const folder = kind === "CPR" ? "cpr" : "first-aid";
  return `tenants/${tenantId}/personnel/certifications/${folder}/`;
}

export function personnelCertColumn(
  kind: PersonnelCertKind,
): "cprCertificationDocumentId" | "firstAidCertificationDocumentId" {
  return kind === "CPR" ? "cprCertificationDocumentId" : "firstAidCertificationDocumentId";
}
