import { test, expect } from "../src/fixtures/index.js";
import {
  apiRequest,
  readTenantId,
  listIncidents,
  incidentIdsFromList,
} from "../src/helpers/api.js";
import {
  createSyntheticCadConnection,
  expectOkStatus,
  listAuditEvents,
  listCadMessages,
  simulatorSend,
  unwrapData,
  waitForCadMessage,
  type CadRawMessageMeta,
} from "../src/helpers/cad.js";
import { ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import {
  getApiUrl,
  getSecondaryCredentials,
  hasSecondaryCredentials,
  REQUIRE_SECONDARY,
} from "../src/env.js";

type ReprocessResult = {
  accepted: boolean;
  rawMessageId: string;
  processingAttempts: number;
  payloadHash: string;
  sourceMessageId: string | null;
  correlationId: string;
};

/**
 * Deterministic CAD message reprocess (@phase4 matrix row 19).
 * Creates its own raw message via simulator — never reuses prior-run data.
 */
test.describe("Phase 4 deterministic CAD reprocess @phase4 @cad", () => {
  test("reprocess quarantined message with idempotency and isolation", async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.setTimeout(360_000);
    expect(hasSecondaryCredentials(), REQUIRE_SECONDARY).toBe(true);

    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const runId = e2eRunId();
    const sourceIncidentId = `SRC-REPRO-${runId}`;

    const connection = await createSyntheticCadConnection(page, tenantId!, {
      namePrefix: "e2e-reprocess",
      environment: "SIMULATOR",
      transportType: "SYNTHETIC_SIMULATOR",
    });

    const beforeList = await listIncidents(page, tenantId!);
    expect(beforeList.status).toBe(200);
    const incidentCountBefore = incidentIdsFromList(beforeList.json).length;

    const send = await simulatorSend(page, tenantId!, {
      connectionId: connection.id,
      scenarioId: "new-incident",
      delivery: "DIRECT_QUEUE",
      sourceIncidentId,
      sourceSequence: 1,
      overrides: {
        address: `Reprocess Lane ${runId}`,
        callType: "STRUCTURE_FIRE",
      },
    });
    const rawMessageId = String(send.rawMessageId);
    expect(rawMessageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const created = await waitForCadMessage(
      page,
      tenantId!,
      (row) => row.id === rawMessageId,
      60_000,
    );
    expect(created.id).toBe(rawMessageId);
    expect(created.payloadHash).toBeTruthy();
    expect(created.sourceMessageId).toBeTruthy();
    const originalStatus = created.processingStatus;
    const originalHash = created.payloadHash!;
    const originalSourceMessageId = created.sourceMessageId!;
    const originalAttempts = created.processingAttempts ?? 0;

    const quarantine = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/simulator/quarantine-message`,
      {
        data: {
          rawMessageId,
          reason: "phase4 deterministic synthetic quarantine for reprocess",
        },
      },
    );
    expectOkStatus(quarantine.status, "quarantine message");
    const quarantined = unwrapData<CadRawMessageMeta>(quarantine.json);
    expect(quarantined.processingStatus).toBe("QUARANTINED");

    const first = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/messages/${rawMessageId}/reprocess`,
      { data: { reason: "phase4 deterministic reprocess #1" } },
    );
    expect([200, 201, 202]).toContain(first.status);
    const firstBody = unwrapData<ReprocessResult>(first.json);
    expect(firstBody.accepted).toBe(true);
    expect(firstBody.rawMessageId).toBe(rawMessageId);
    expect(firstBody.processingAttempts).toBeGreaterThan(originalAttempts);
    expect(firstBody.payloadHash).toBe(originalHash);
    expect(firstBody.sourceMessageId).toBe(originalSourceMessageId);
    expect(firstBody.correlationId).toBeTruthy();

    const afterFirst = await waitForCadMessage(
      page,
      tenantId!,
      (row) =>
        row.id === rawMessageId && (row.processingAttempts ?? 0) >= firstBody.processingAttempts,
      60_000,
    );
    expect(afterFirst.payloadHash).toBe(originalHash);
    expect(afterFirst.sourceMessageId).toBe(originalSourceMessageId);
    expect(afterFirst.processingStatus).not.toBe("QUARANTINED");

    const second = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/messages/${rawMessageId}/reprocess`,
      { data: { reason: "phase4 deterministic reprocess #2 idempotency" } },
    );
    expect([200, 201, 202]).toContain(second.status);
    const secondBody = unwrapData<ReprocessResult>(second.json);
    expect(secondBody.accepted).toBe(true);
    expect(secondBody.processingAttempts).toBeGreaterThan(firstBody.processingAttempts);
    expect(secondBody.payloadHash).toBe(originalHash);
    expect(secondBody.sourceMessageId).toBe(originalSourceMessageId);

    const afterSecond = await waitForCadMessage(
      page,
      tenantId!,
      (row) =>
        row.id === rawMessageId && (row.processingAttempts ?? 0) >= secondBody.processingAttempts,
      60_000,
    );
    expect(afterSecond.payloadHash).toBe(originalHash);
    expect(afterSecond.sourceMessageId).toBe(originalSourceMessageId);

    // Allow pipeline to settle; duplicate incident/unit creation must not explode from reprocess.
    await page.waitForTimeout(8_000);
    const afterList = await listIncidents(page, tenantId!);
    expect(afterList.status).toBe(200);
    const incidentsAfter = incidentIdsFromList(afterList.json);
    expect(incidentsAfter.length).toBeLessThanOrEqual(incidentCountBefore + 2);

    const messages = await listCadMessages(page, tenantId!);
    const sameSource = messages.filter((m) => m.sourceMessageId === originalSourceMessageId);
    expect(sameSource.length).toBe(1);

    const audits = await listAuditEvents(page, tenantId!);
    const reprocessAudit = audits.find(
      (row) =>
        row.resourceId === rawMessageId &&
        String(row.action ?? "").includes("REPROCESS") &&
        row.result === "SUCCESS",
    );
    expect(reprocessAudit, "reprocess audit event required").toBeTruthy();

    const unauth = await page
      .context()
      .request.fetch(
        `${getApiUrl()}/api/v1/tenants/${tenantId}/cad/messages/${rawMessageId}/reprocess`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          data: JSON.stringify({ reason: "missing bearer must fail" }),
        },
      );
    expect([401, 403]).toContain(unauth.status());

    const secondary = getSecondaryCredentials();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const secondaryPage = await context.newPage();
    try {
      await ensureAuthenticated(secondaryPage, secondary);
      const cross = await apiRequest(
        secondaryPage,
        "POST",
        `/api/v1/tenants/${tenantId}/cad/messages/${rawMessageId}/reprocess`,
        { data: { reason: "cross-tenant reprocess must fail" } },
      );
      expect([403, 404]).toContain(cross.status);
    } finally {
      await context.close();
    }

    // Preserve original status observation for evidence (must have been recorded before quarantine).
    expect(originalStatus).toBeTruthy();
  });
});
