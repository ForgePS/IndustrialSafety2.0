import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  apiRequest,
  approveIncidentRaw,
  finalizeIncidentRaw,
  getIncident,
  submitIncidentRaw,
  type ApiRawResult,
} from "./api.js";
import { createManualIncident, openIncidentSection, waitForAutosaveSaved } from "./navigation.js";
import { syntheticDispatchDescription } from "./test-data.js";

export function unwrapData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export const DENIED = [401, 403, 404] as const;

export function expectDenied(status: number, label: string): void {
  if (!(DENIED as readonly number[]).includes(status)) {
    throw new Error(`${label}: expected 401/403/404, got ${status}`);
  }
}

export async function promoteToInProgress(
  page: Page,
  incidentId: string,
  runId: string,
): Promise<void> {
  await openIncidentSection(page, incidentId, "OVERVIEW");
  const dispatch = page.getByLabel(/dispatch description/i);
  await dispatch.waitFor({ state: "visible", timeout: 15_000 });
  await dispatch.fill(`${syntheticDispatchDescription(runId)} In progress for specialty closeout.`);
  await waitForAutosaveSaved(page);
}

export async function setPrimaryType(
  page: Page,
  tenantId: string,
  incidentId: string,
  primaryIncidentTypeCode: string,
): Promise<ApiRawResult> {
  const incident = await getIncident(page, tenantId, incidentId);
  return apiRequest(page, "PATCH", `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}`, {
    data: { primaryIncidentTypeCode },
    ifMatch: incident.recordVersion,
  });
}

export async function createStructureFireIncident(
  page: Page,
  tenantId: string,
  runId: string,
  label: string,
): Promise<string> {
  const incidentId = await createManualIncident(
    page,
    `${syntheticDispatchDescription(runId)} ${label}`,
  );
  await promoteToInProgress(page, incidentId, runId);
  const patch = await setPrimaryType(page, tenantId, incidentId, "STRUCTURE_FIRE");
  if (patch.status >= 500) {
    throw new Error(`Failed to set STRUCTURE_FIRE: ${patch.status} ${patch.body}`);
  }
  return incidentId;
}

export async function submitApproveFinalize(
  page: Page,
  tenantId: string,
  incidentId: string,
): Promise<void> {
  let incident = await getIncident(page, tenantId, incidentId);
  if (
    incident.status === "DRAFT" ||
    incident.status === "IN_PROGRESS" ||
    incident.status === "RETURNED_FOR_CORRECTION"
  ) {
    const submit = await submitIncidentRaw(page, tenantId, incidentId, {
      note: "E2E specialty closeout submit",
    });
    if (submit.status >= 400) {
      throw new Error(`Submit failed (${submit.status}): ${submit.body}`);
    }
  }
  incident = await getIncident(page, tenantId, incidentId);
  if (incident.status === "SUBMITTED_FOR_REVIEW") {
    const approve = await approveIncidentRaw(page, tenantId, incidentId);
    if (approve.status >= 400) {
      throw new Error(`Approve failed (${approve.status}): ${approve.body}`);
    }
  }
  incident = await getIncident(page, tenantId, incidentId);
  if (incident.status === "APPROVED") {
    const fin = await finalizeIncidentRaw(page, tenantId, incidentId);
    if (fin.status >= 400) {
      throw new Error(`Finalize failed (${fin.status}): ${fin.body}`);
    }
  }
  incident = await getIncident(page, tenantId, incidentId);
  if (!/FINALIZED/i.test(incident.status)) {
    throw new Error(`Expected FINALIZED, got ${incident.status}`);
  }
}

export async function listAudit(
  page: Page,
  tenantId: string,
  incidentId: string,
): Promise<Array<{ action?: string; after?: Record<string, unknown>; result?: string }>> {
  const res = await apiRequest(
    page,
    "GET",
    `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/audit-events?page=1&pageSize=100`,
  );
  if (res.status !== 200) {
    return [];
  }
  const data = unwrapData<unknown>(res.json);
  if (Array.isArray(data))
    return data as Array<{ action?: string; after?: Record<string, unknown> }>;
  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray((data as { items: unknown }).items)
  ) {
    return (data as { items: Array<{ action?: string }> }).items;
  }
  return [];
}

export async function activateSpecialtySection(
  page: Page,
  tenantId: string,
  incidentId: string,
  sectionKey: string,
): Promise<ApiRawResult> {
  return apiRequest(
    page,
    "POST",
    `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/specialty-sections`,
    { data: { sectionKey, action: "ACTIVATE" } },
  );
}

export async function validateIncident(
  page: Page,
  tenantId: string,
  incidentId: string,
): Promise<{
  findings: Array<{ technicalReference?: string; severity?: string; message?: string }>;
}> {
  const res = await apiRequest(
    page,
    "POST",
    `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/validate`,
    { data: {} },
  );
  if (res.status >= 400) {
    return { findings: [] };
  }
  const data = unwrapData<{
    findings?: Array<{ technicalReference?: string; severity?: string; message?: string }>;
    issues?: Array<{ technicalReference?: string; severity?: string; message?: string }>;
  }>(res.json);
  return { findings: data.findings ?? data.issues ?? [] };
}

export async function findFieldId(
  page: Page,
  tenantId: string,
  incidentId: string,
  fieldKeyHint: string,
): Promise<{ fieldId: string; sectionKey: string; fieldKey: string } | null> {
  const res = await apiRequest(
    page,
    "GET",
    `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/form-descriptor`,
  );
  if (res.status !== 200) return null;
  const descriptor = unwrapData<{
    modules?: Array<{
      sectionKey?: string;
      fields?: Array<{ fieldId?: string; fieldKey?: string }>;
    }>;
  }>(res.json);
  const hint = fieldKeyHint.toLowerCase();
  for (const mod of descriptor.modules ?? []) {
    for (const field of mod.fields ?? []) {
      if (field.fieldId && field.fieldKey?.toLowerCase().includes(hint)) {
        return {
          fieldId: field.fieldId,
          sectionKey: mod.sectionKey ?? "OVERVIEW",
          fieldKey: field.fieldKey,
        };
      }
    }
  }
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** Minimal valid JPEG (1x1). */
export const TINY_JPEG = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
]);

/** Minimal PNG (1x1). */
export const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa7, 0x35, 0x81, 0x84, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** Minimal PDF. */
export const TINY_PDF = new TextEncoder().encode(
  "%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n",
);

export type InitUploadResult = {
  attachmentId: string;
  documentId: string;
  objectKey: string;
  uploadUrl: string;
  expiresInSeconds: number;
  malwareScanStatus?: string;
  recordVersion?: number;
};

export async function initializeAttachment(
  page: Page,
  tenantId: string,
  incidentId: string,
  input: Record<string, unknown>,
): Promise<ApiRawResult> {
  return apiRequest(
    page,
    "POST",
    `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/uploads`,
    { data: input },
  );
}

export async function completeAttachment(
  page: Page,
  tenantId: string,
  incidentId: string,
  attachmentId: string,
  checksumSha256?: string | null,
): Promise<ApiRawResult> {
  return apiRequest(
    page,
    "POST",
    `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/${attachmentId}/complete`,
    { data: checksumSha256 ? { checksumSha256 } : {} },
  );
}

export async function uploadBytesToPresign(
  uploadUrl: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<number> {
  // Presign signs ContentType, ContentLength, and ServerSideEncryption=aws:kms —
  // the PUT must echo those signed headers or S3 returns 403.
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(bytes.byteLength),
      "x-amz-server-side-encryption": "aws:kms",
    },
    body: Buffer.from(bytes),
  });
  return res.status;
}
