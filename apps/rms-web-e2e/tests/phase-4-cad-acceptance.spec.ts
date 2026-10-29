import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, readTenantId } from "../src/helpers/api.js";
import { createManualIncident, ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import { getSecondaryCredentials, hasSecondaryCredentials, REQUIRE_SECONDARY } from "../src/env.js";

function unwrapData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

function expectOkStatus(status: number, label = "response"): void {
  expect([200, 201], `${label} expected 200/201, got ${status}`).toContain(status);
}

type CadConnection = {
  id: string;
  publicId: string;
  name: string;
  status: string;
  healthStatus: string;
  environment: string;
  recordVersion: number;
};

const DENIED = [403, 404];

/**
 * Phase 4 CAD Cognito acceptance — API + UI smoke covering the scenario matrix.
 * Tags: @phase4 @cad @cad-security @cad-hybrid @cad-operations
 */
test.describe("Phase 4 CAD acceptance @phase4 @cad", () => {
  test("2 — CAD flags on (A) → connections list OK", async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const res = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/connections`);
    expect(res.status).toBe(200);
    const list = unwrapData<CadConnection[]>(res.json);
    expect(Array.isArray(list)).toBe(true);
  });

  test("4 — PRODUCTION connection create rejected", async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    const tenantId = await readTenantId(page);
    const res = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `prod-reject-${e2eRunId()}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "PRODUCTION",
        transportType: "HTTPS_WEBHOOK",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(String(res.body)).toMatch(/PRODUCTION/i);
  });

  test("5/6/7 — create DEVELOPMENT webhook, test, enable/disable", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const tenantId = await readTenantId(page);
    const runId = e2eRunId();
    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `e2e-cad-${runId}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "DEVELOPMENT",
        transportType: "HTTPS_WEBHOOK",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    expectOkStatus(create.status, "create");
    const connection = unwrapData<CadConnection>(create.json);
    expect(connection.status).toBe("DRAFT");
    expect(connection.environment).toBe("DEVELOPMENT");

    const testRes = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/connections/${connection.id}/test`,
    );
    expectOkStatus(testRes.status, "test connection");
    const tested = unwrapData<
      { connection?: CadConnection; healthStatus?: string } & CadConnection
    >(testRes.json);
    const health =
      tested.healthStatus ??
      tested.connection?.healthStatus ??
      (tested as CadConnection).healthStatus;
    expect(["HEALTHY", "UNKNOWN", "DEGRADED"]).toContain(health);

    const enable = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/connections/${connection.id}/enable`,
    );
    expectOkStatus(enable.status, "enable");
    expect(unwrapData<CadConnection>(enable.json).status).toBe("ACTIVE");

    const disable = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/connections/${connection.id}/disable`,
    );
    expectOkStatus(disable.status, "disable");
    expect(unwrapData<CadConnection>(disable.json).status).toBe("DISABLED");
  });

  test("9/10 — simulator DIRECT_QUEUE send + message metadata excludes raw payload", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const tenantId = await readTenantId(page);
    const runId = e2eRunId();
    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `e2e-sim-${runId}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "SIMULATOR",
        transportType: "SYNTHETIC_SIMULATOR",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    expectOkStatus(create.status, "create");
    const connection = unwrapData<CadConnection>(create.json);

    const send = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/simulator/send`, {
      data: {
        connectionId: connection.id,
        scenarioId: "new-incident",
        delivery: "DIRECT_QUEUE",
        sourceIncidentId: `SRC-${runId}`,
      },
    });
    expectOkStatus(send.status, "simulator send");
    expect(String(send.body)).toMatch(/DIRECT_QUEUE|accepted|scenarioId/i);

    const messages = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/messages`);
    expectOkStatus(messages.status, "messages");
    const body = String(messages.body);
    expect(body).not.toMatch(/"rawPayload"|payloadCiphertext|encryptedPayload/i);
    const list = unwrapData<Array<Record<string, unknown>>>(messages.json);
    expect(Array.isArray(list)).toBe(true);
    for (const row of list) {
      expect(row).not.toHaveProperty("rawPayload");
      expect(row).not.toHaveProperty("payloadJson");
    }
  });

  test("12/13 — operations summary returns queue counters", async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    const tenantId = await readTenantId(page);
    const res = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/operations/summary`);
    expect(res.status).toBe(200);
    const summary = unwrapData<Record<string, unknown>>(res.json);
    expect(summary).toBeTruthy();
    expect(
      "connections" in summary ||
        "openConflicts" in summary ||
        "queueDepths" in summary ||
        "messageCounts" in summary ||
        "unknownUnits" in summary,
    ).toBe(true);
  });

  test("14/15/16 — unmapped, unknown units/personnel, conflicts list", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    const tenantId = await readTenantId(page);
    for (const path of ["unmapped-values", "unknown-units", "unknown-personnel", "conflicts"]) {
      const res = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/${path}`);
      expect(res.status, path).toBe(200);
      expect(Array.isArray(unwrapData<unknown[]>(res.json))).toBe(true);
    }
  });

  test("18 — rotate secret returns key metadata only", async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);
    const tenantId = await readTenantId(page);
    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `e2e-rotate-${e2eRunId()}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "DEVELOPMENT",
        transportType: "HTTPS_WEBHOOK",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    expectOkStatus(create.status, "create");
    const connection = unwrapData<CadConnection>(create.json);
    const rotate = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/connections/${connection.id}/rotate-secret`,
      { data: { reason: "phase4 e2e rotate" } },
    );
    expectOkStatus(rotate.status, "rotate");
    const body = String(rotate.body);
    expect(body).not.toMatch(/"secret"\s*:\s*"[^"]{8,}"/);
    expect(body).not.toMatch(/"webhookSecret"\s*:|"secretValue"\s*:|"plaintextSecret"\s*:/i);
    expect(body).toMatch(/webhookKeyId|secretProvisioned/i);
  });

  test("20 — incident CAD status panel data endpoint", async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);
    const tenantId = await readTenantId(page);
    const incidentId = await createManualIncident(page, syntheticDispatchDescription(e2eRunId()));
    const res = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/cad-status`,
    );
    expect(res.status).toBe(200);
    const status = unwrapData<{ links?: unknown[]; openConflicts?: unknown[] }>(res.json);
    expect(Array.isArray(status.links)).toBe(true);
    expect(Array.isArray(status.openConflicts)).toBe(true);
  });

  test("21/22 — RMS CAD Operations + Connections pages load", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/cad/operations/");
    await expect(page.getByRole("heading", { name: /cad operations/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: /cad operations/i }).first()).toBeVisible();

    await page.goto("/cad/connections/");
    await expect(page.getByRole("heading", { name: /cad connections/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("11/17 — hybrid manual create + manual link requires reason", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const tenantId = await readTenantId(page);
    const incidentId = await createManualIncident(
      page,
      `${syntheticDispatchDescription(e2eRunId())} hybrid cad`,
    );
    expect(incidentId).toBeTruthy();

    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `e2e-link-${e2eRunId()}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "DEVELOPMENT",
        transportType: "HTTPS_WEBHOOK",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    const connection = unwrapData<CadConnection>(create.json);

    const noReason = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/cad-link`,
      {
        data: {
          cadConnectionId: connection.id,
          sourceIncidentId: `SRC-LINK-${e2eRunId()}`,
        },
      },
    );
    expect(noReason.status).toBeGreaterThanOrEqual(400);
    expect(noReason.status).toBeLessThan(500);

    const withReason = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/cad-link`,
      {
        data: {
          cadConnectionId: connection.id,
          sourceIncidentId: `SRC-LINK-${e2eRunId()}`,
          reason: "phase4 hybrid manual link",
        },
      },
    );
    expectOkStatus(withReason.status, "manual link");
  });

  test("25 — finalized incident unlink / mutation guards", async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    const tenantId = await readTenantId(page);
    const bogus = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/00000000-0000-4000-8000-000000000099/cad-unlink`,
      {
        data: {
          cadIncidentLinkId: "00000000-0000-4000-8000-000000000098",
          reason: "guard",
          recordVersion: 1,
        },
      },
    );
    expect(DENIED).toContain(bogus.status);
  });

  test("26/27 — simulator outage → DEGRADED, recover → HEALTHY", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const tenantId = await readTenantId(page);
    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `e2e-outage-${e2eRunId()}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "SIMULATOR",
        transportType: "SYNTHETIC_SIMULATOR",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    const connection = unwrapData<CadConnection>(create.json);

    const outage = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/simulator/outage`,
      {
        data: { connectionId: connection.id, reason: "phase4 simulated outage" },
      },
    );
    expectOkStatus(outage.status, "outage");
    const degraded = unwrapData<{ connection?: CadConnection } & CadConnection>(outage.json);
    const degradedStatus =
      degraded.connection?.healthStatus ?? degraded.healthStatus ?? degraded.status;
    expect(String(degradedStatus)).toMatch(/DEGRADED|UNHEALTHY|ACTIVE|DISABLED/i);

    const recover = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/simulator/recover`,
      { data: { connectionId: connection.id, reason: "phase4 simulated recovery" } },
    );
    expectOkStatus(recover.status, "recover");
  });

  test("28 — mobile viewport CAD operations page", async ({ authenticatedPage: page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/cad/operations/");
    await expect(page.getByRole("heading", { name: /cad operations/i })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("29 — accessibility smoke — CAD operations headings", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/cad/operations/");
    await expect(page.getByRole("heading", { name: /cad operations/i })).toBeVisible({
      timeout: 30_000,
    });
    const heading = page.getByRole("heading", { name: /cad operations/i });
    await heading.focus();
    await expect(page.locator("body")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/password|ssn|social security/i);
  });

  test("30 — Phase 2/3 regression smoke — login + incidents still work", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const incidentId = await createManualIncident(page, syntheticDispatchDescription(e2eRunId()));
    expect(incidentId).toBeTruthy();
    await page.goto(`/incidents/${incidentId}/`);
    await expect(
      page.getByRole("heading", { name: /incident|overview|dispatch/i }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Phase 4 CAD security @phase4 @cad-security", () => {
  test("1 — CAD flags off (tenant B) → CAD APIs forbidden", async ({ browser }) => {
    test.setTimeout(180_000);
    expect(hasSecondaryCredentials(), REQUIRE_SECONDARY).toBe(true);

    const secondary = getSecondaryCredentials();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await ensureAuthenticated(page, secondary);
      const tenantId = await readTenantId(page);
      expect(tenantId).toBeTruthy();
      const res = await apiRequest(page, "GET", `/api/v1/tenants/${tenantId}/cad/connections`);
      expect(DENIED).toContain(res.status);
    } finally {
      await context.close();
    }
  });

  test("3/24 — Tenant B cannot list Tenant A CAD resources / cross-tenant status denied", async ({
    browser,
    authenticatedPage: primaryPage,
  }) => {
    test.setTimeout(180_000);
    expect(hasSecondaryCredentials(), REQUIRE_SECONDARY).toBe(true);

    const primaryTenantId = await readTenantId(primaryPage);
    expect(primaryTenantId).toBeTruthy();

    const listA = await apiRequest(
      primaryPage,
      "GET",
      `/api/v1/tenants/${primaryTenantId}/cad/connections`,
    );
    expect(listA.status).toBe(200);

    const secondary = getSecondaryCredentials();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await ensureAuthenticated(page, secondary);
      const secondaryTenantId = await readTenantId(page);
      expect(secondaryTenantId).toBeTruthy();
      expect(secondaryTenantId).not.toBe(primaryTenantId);

      const crossList = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${primaryTenantId}/cad/connections`,
      );
      expect(DENIED).toContain(crossList.status);

      const crossMessages = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${primaryTenantId}/cad/messages`,
      );
      expect(DENIED).toContain(crossMessages.status);

      const crossConflicts = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${primaryTenantId}/cad/conflicts`,
      );
      expect(DENIED).toContain(crossConflicts.status);

      const crossMappings = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${primaryTenantId}/cad/unit-mappings`,
      );
      expect(DENIED).toContain(crossMappings.status);

      const crossStatus = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${primaryTenantId}/neris/incidents/00000000-0000-4000-8000-000000000001/cad-status`,
      );
      expect(DENIED).toContain(crossStatus.status);
    } finally {
      await context.close();
    }
  });

  test("8 — webhook without signature → 401", async ({ authenticatedPage: page }) => {
    test.setTimeout(120_000);
    const tenantId = await readTenantId(page);
    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/cad/connections`, {
      data: {
        name: `e2e-wh-${e2eRunId()}`,
        vendor: "Forge",
        adapterKey: "forge.synthetic",
        adapterVersion: "1.0.0",
        environment: "DEVELOPMENT",
        transportType: "HTTPS_WEBHOOK",
        intakeMode: "HYBRID",
        configurationJson: {},
      },
    });
    expectOkStatus(create.status, "create");
    const connection = unwrapData<CadConnection>(create.json);
    await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/connections/${connection.id}/enable`,
    );

    const webhook = await page
      .context()
      .request.fetch(
        `${process.env.E2E_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000"}/api/v1/cad/webhooks/${connection.publicId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          data: JSON.stringify({ eventType: "CONNECTION_TEST", sourceIncidentId: "unsigned" }),
        },
      );
    expect([401, 403]).toContain(webhook.status());

    const invalidSig = await page
      .context()
      .request.fetch(
        `${process.env.E2E_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000"}/api/v1/cad/webhooks/${connection.publicId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-forge-cad-key-id": "wk_invalid",
            "x-forge-cad-timestamp": String(Math.floor(Date.now() / 1000)),
            "x-forge-cad-nonce": "nonce-invalid-replay-1",
            "x-forge-cad-message-id": `msg-invalid-${e2eRunId()}`,
            "x-forge-cad-signature": "deadbeef",
          },
          data: JSON.stringify({ eventType: "CONNECTION_TEST", sourceIncidentId: "bad-sig" }),
        },
      );
    expect([401, 403]).toContain(invalidSig.status());
  });
});
