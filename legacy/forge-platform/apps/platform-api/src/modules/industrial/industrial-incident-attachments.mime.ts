/** MIME / size rules for industrial incident document attachments. */

export const MAX_INCIDENT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

export function isAllowedIncidentAttachmentMime(mimeType: string): boolean {
  return ALLOWED.has(mimeType.trim().toLowerCase());
}

export function incidentAttachmentObjectKeyPrefix(tenantId: string, incidentId: string): string {
  return `tenants/${tenantId}/incidents/${incidentId}/attachments/`;
}

export const INCIDENT_ATTACHMENT_SOURCE = "INDUSTRIAL_INCIDENT";
