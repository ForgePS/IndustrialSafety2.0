import type { Page } from "@playwright/test";
import { expect } from "../fixtures/index.js";
import { apiRequest } from "./api.js";
import { e2eRunId } from "./test-data.js";

export function unwrapData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

export function expectOkStatus(status: number, label = "response"): void {
  expect([200, 201], `${label} expected 200/201, got ${status}`).toContain(status);
}

export type CadConnection = {
  id: string;
  publicId: string;
  name: string;
  status: string;
  healthStatus: string;
  environment: string;
  recordVersion: number;
};

export type CadConflict = {
  id: string;
  status: string;
  conflictType: string;
  fieldIdentifier: string | null;
  cadValueJson: unknown;
  forgeValueJson: unknown;
  ownershipPolicy: string | null;
  recommendedResolution: string | null;
  resolutionAction: string | null;
  resolutionReason: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  cadRawMessageId: string | null;
  cadNormalizedEventId: string | null;
  recordVersion: number;
};

export type CadRawMessageMeta = {
  id: string;
  sourceMessageId: string | null;
  sourceIncidentId: string | null;
  processingStatus: string;
  payloadHash: string | null;
  processingAttempts?: number;
  correlationId: string | null;
  cadConnectionId: string;
};

export async function createSyntheticCadConnection(
  page: Page,
  tenantId: string,
  opts: { namePrefix?: string; environment?: string; transportType?: string } = {},
): Promise<CadConnection> {
  const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
    data: {
      name: `${opts.namePrefix ?? "e2e-cad"}-${e2eRunId()}`,
      vendor: "Forge",
      adapterKey: "forge.synthetic",
      adapterVersion: "1.0.0",
      environment: opts.environment ?? "SIMULATOR",
      transportType: opts.transportType ?? "SYNTHETIC_SIMULATOR",
      intakeMode: "HYBRID",
      configurationJson: {},
    },
  });
  expectOkStatus(create.status, "create CAD connection");
  const connection = unwrapData<CadConnection>(create.json);
  const enable = await apiRequest(
    page,
    "POST",
    `/api/v1/tenants/${tenantId}/cad/connections/${connection.id}/enable`,
  );
  expectOkStatus(enable.status, "enable CAD connection");
  return unwrapData<CadConnection>(enable.json);
}

export async function simulatorSend(
  page: Page,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const send = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/simulator/send`, {
    data: body,
  });
  expectOkStatus(send.status, "simulator send");
  return unwrapData<Record<string, unknown>>(send.json);
}

export async function listCadMessages(page: Page, tenantId: string): Promise<CadRawMessageMeta[]> {
  const res = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/messages`);
  expect(res.status).toBe(200);
  return unwrapData<CadRawMessageMeta[]>(res.json);
}

export async function waitForCadMessage(
  page: Page,
  tenantId: string,
  predicate: (row: CadRawMessageMeta) => boolean,
  timeoutMs = 120_000,
): Promise<CadRawMessageMeta> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rows = await listCadMessages(page, tenantId);
    const hit = rows.find(predicate);
    if (hit) return hit;
    await page.waitForTimeout(2_000);
  }
  throw new Error("Timed out waiting for CAD raw message metadata");
}

export async function waitForOpenConflict(
  page: Page,
  tenantId: string,
  opts: { incidentId?: string; fieldIdentifier?: string } = {},
  timeoutMs = 180_000,
): Promise<CadConflict> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = opts.incidentId ? `?incidentId=${opts.incidentId}&status=OPEN` : "?status=OPEN";
    const res = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/conflicts${query}`);
    expect(res.status).toBe(200);
    const rows = unwrapData<CadConflict[]>(res.json);
    const hit = rows.find((row) => {
      if (row.status !== "OPEN" && row.status !== "ESCALATED") return false;
      if (opts.fieldIdentifier && row.fieldIdentifier !== opts.fieldIdentifier) return false;
      return true;
    });
    if (hit) return hit;
    await page.waitForTimeout(3_000);
  }
  throw new Error(
    `Timed out waiting for OPEN CAD conflict${opts.incidentId ? ` on incident ${opts.incidentId}` : ""}`,
  );
}

export async function getCadConflict(
  page: Page,
  tenantId: string,
  conflictId: string,
): Promise<CadConflict> {
  const res = await apiRequest(
    page,
    "GET",
    `/api/v1/tenants/${tenantId}/cad/conflicts/${conflictId}`,
  );
  expectOkStatus(res.status, "get conflict");
  return unwrapData<CadConflict>(res.json);
}

export async function listAuditEvents(
  page: Page,
  tenantId: string,
): Promise<Array<{ action?: string; resourceId?: string; result?: string }>> {
  const res = await apiRequest(
    page,
    "GET",
    `/api/v1/tenants/${tenantId}/audit-events?pageSize=200`,
  );
  expect([200, 201]).toContain(res.status);
  const data = unwrapData<unknown>(res.json);
  if (Array.isArray(data))
    return data as Array<{ action?: string; resourceId?: string; result?: string }>;
  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray((data as { items: unknown }).items)
  ) {
    return (data as { items: Array<{ action?: string; resourceId?: string; result?: string }> })
      .items;
  }
  return [];
}
