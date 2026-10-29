import { apiGet, apiSend, toIfMatch } from "@forge/web-kit";

function tenantBase(tenantId: string): string {
  return `/api/v1/tenants/${tenantId}`;
}

export type SpecialtyRecordKind =
  | "exposures"
  | "civilian-casualties"
  | "fire-service-casualties"
  | "hazmat/substances"
  | "hazmat/containers"
  | "alarm-systems"
  | "protection-systems";

function collectionPath(tenantId: string, incidentId: string, kind: SpecialtyRecordKind): string {
  return `${tenantBase(tenantId)}/neris/incidents/${incidentId}/${kind}`;
}

export async function listSpecialtyRecords(
  tenantId: string,
  incidentId: string,
  kind: SpecialtyRecordKind,
): Promise<Record<string, unknown>[]> {
  return apiGet<Record<string, unknown>[]>(collectionPath(tenantId, incidentId, kind));
}

export async function createSpecialtyRecord(
  tenantId: string,
  incidentId: string,
  kind: SpecialtyRecordKind,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(collectionPath(tenantId, incidentId, kind), "POST", body);
}

export async function patchSpecialtyRecord(
  tenantId: string,
  incidentId: string,
  kind: SpecialtyRecordKind,
  id: string,
  body: Record<string, unknown>,
  recordVersion: number,
): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(
    `${collectionPath(tenantId, incidentId, kind)}/${id}`,
    "PATCH",
    body,
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export async function archiveSpecialtyRecord(
  tenantId: string,
  incidentId: string,
  kind: SpecialtyRecordKind,
  id: string,
  recordVersion: number,
): Promise<Record<string, unknown>> {
  return apiSend<Record<string, unknown>>(
    `${collectionPath(tenantId, incidentId, kind)}/${id}/archive`,
    "POST",
    {},
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export type AttachmentDto = {
  attachmentId: string;
  category: string;
  caption: string | null;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  malwareScanStatus: string;
  clearedForUse: boolean;
  isImage: boolean;
  isPdf: boolean;
  recordVersion: number;
  uploadStatus: string;
};

export async function listAttachments(
  tenantId: string,
  incidentId: string,
): Promise<AttachmentDto[]> {
  return apiGet<AttachmentDto[]>(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/attachments`,
  );
}

export async function initializeAttachmentUpload(
  tenantId: string,
  incidentId: string,
  body: Record<string, unknown>,
): Promise<{
  attachmentId: string;
  uploadUrl: string;
  expiresInSeconds: number;
}> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/attachments/uploads`,
    "POST",
    body,
  );
}

export async function completeAttachmentUpload(
  tenantId: string,
  incidentId: string,
  attachmentId: string,
  body: Record<string, unknown> = {},
): Promise<AttachmentDto> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/attachments/${attachmentId}/complete`,
    "POST",
    body,
  );
}

export async function archiveAttachment(
  tenantId: string,
  incidentId: string,
  attachmentId: string,
  recordVersion: number,
): Promise<AttachmentDto> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/attachments/${attachmentId}/archive`,
    "POST",
    {},
    { ifMatch: toIfMatch(recordVersion) },
  );
}

export async function patchAttachment(
  tenantId: string,
  incidentId: string,
  attachmentId: string,
  body: Record<string, unknown>,
  recordVersion: number,
): Promise<AttachmentDto> {
  return apiSend(
    `${tenantBase(tenantId)}/neris/incidents/${incidentId}/attachments/${attachmentId}`,
    "PATCH",
    body,
    { ifMatch: toIfMatch(recordVersion) },
  );
}
