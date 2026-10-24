import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, getIncident, readTenantId } from "../src/helpers/api.js";
import {
  createManualIncident,
  ensureAuthenticated,
  openIncidentSection,
  waitForAutosaveSaved,
} from "../src/helpers/navigation.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import { getSecondaryCredentials, hasSecondaryCredentials, REQUIRE_SECONDARY } from "../src/env.js";

function unwrapData<T>(json: unknown): T {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

/**
 * NERIS Phase 3 deployed acceptance scenarios (Cognito-backed).
 */
test.describe("Phase 3 specialty workflows @phase3", () => {
  test("specialty review panel is available on REVIEW when specialty is enabled", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    const runId = e2eRunId();
    const incidentId = await createManualIncident(page, syntheticDispatchDescription(runId));
    await openIncidentSection(page, incidentId, "REVIEW");

    const specialtyHeading = page.getByRole("heading", { name: /specialty review/i });
    const officerHeading = page.getByRole("heading", { name: /officer review/i });
    await expect(officerHeading).toBeVisible({ timeout: 20_000 });

    if (await specialtyHeading.isVisible().catch(() => false)) {
      await expect(
        page.getByRole("heading", { name: /^activated specialty sections$/i }),
      ).toBeVisible();
      await expect(page.getByLabel(/reviewer role/i)).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "note",
        description:
          "Specialty review heading not visible — tenant flag may be disabled in this environment.",
      });
    }
  });

  test("scenario 1 — structure fire activates specialty and supports two exposures", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const incidentId = await createManualIncident(
      page,
      `${syntheticDispatchDescription(runId)} structure fire exposures`,
    );

    await openIncidentSection(page, incidentId, "OVERVIEW");
    const dispatch = page.getByLabel(/dispatch description/i);
    await dispatch.waitFor({ state: "visible", timeout: 15_000 });
    await dispatch.fill(`${syntheticDispatchDescription(runId)} Structure fire with exposures.`);
    await waitForAutosaveSaved(page);

    let incident = await getIncident(page, tenantId!, incidentId);
    const patch = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}`,
      {
        data: { primaryIncidentTypeCode: "STRUCTURE_FIRE" },
        ifMatch: incident.recordVersion,
      },
    );
    expect(patch.status).toBeLessThan(500);

    const descriptorRes = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/form-descriptor`,
    );
    expect(descriptorRes.status).toBe(200);
    const descriptor = unwrapData<{
      specialtyWorkflows?: Array<{ sectionKey: string; state: string }>;
    }>(descriptorRes.json);
    const groups = descriptor.specialtyWorkflows ?? [];
    const activated = groups.find(
      (g) =>
        (g.sectionKey === "STRUCTURE" || g.sectionKey === "FIRE" || g.sectionKey === "EXPOSURES") &&
        (g.state === "REQUIRED" || g.state === "ACTIVE" || g.state === "OPTIONAL"),
    );
    expect(activated, "specialty workflows should activate for STRUCTURE_FIRE").toBeTruthy();

    const exp1 = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures`,
      { data: { addressLine1: "100 Exposure Ave", city: "Synthetic Valley" } },
    );
    const exp2 = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures`,
      { data: { addressLine1: "102 Exposure Ave", city: "Synthetic Valley" } },
    );
    expect([200, 201]).toContain(exp1.status);
    expect([200, 201]).toContain(exp2.status);

    const list = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures`,
    );
    expect(list.status).toBe(200);
    const rows = unwrapData<Array<{ exposureNumber?: number }>>(list.json);
    const numbers = (Array.isArray(rows) ? rows : []).map((r) => r.exposureNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.length).toBeGreaterThanOrEqual(2);

    // Keep lint quiet if incident unused after refresh path.
    incident = await getIncident(page, tenantId!, incidentId);
    expect(incident.id).toBe(incidentId);
  });

  test("scenario 10 — specialty APIs reject for feature-disabled isolation tenant", async ({
    browser,
  }) => {
    test.skip(!hasSecondaryCredentials(), REQUIRE_SECONDARY);
    test.setTimeout(120_000);
    const credentials = getSecondaryCredentials();
    // Do not inherit primary storageState from playwright.config.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await context.clearCookies();
    await ensureAuthenticated(page, credentials);
    const me = await apiRequest(page, "GET", "/api/v1/auth/me");
    expect(me.status).toBe(200);
    const meData = unwrapData<{ tenantId?: string; tenantKey?: string }>(me.json);
    const tenantId = meData.tenantId ?? (await readTenantId(page));
    expect(tenantId).toBeTruthy();
    // Isolation tenant B (must never be specialty-enabled synthetic FD A).
    expect(tenantId).toBe("019fa017-c632-74ae-b70b-672711c72f20");
    if (meData.tenantKey) {
      expect(meData.tenantKey).toBe("rms-synthetic-fd-b");
    }

    const create = await apiRequest(page, "POST", `/api/v1/tenants/${tenantId}/neris/incidents`, {
      data: {
        dispatchDescription: `${syntheticDispatchDescription(e2eRunId())} feature-disabled probe`,
        incidentSource: "MANUAL",
      },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });

    if ([200, 201].includes(create.status)) {
      const data = unwrapData<{ id: string }>(create.json);
      const descriptor = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${tenantId}/neris/incidents/${data.id}/form-descriptor`,
      );
      const descriptorData = unwrapData<{ specialtyWorkflows?: unknown[] }>(descriptor.json);
      expect(descriptorData.specialtyWorkflows ?? []).toEqual([]);

      const specialty = await apiRequest(
        page,
        "POST",
        `/api/v1/tenants/${tenantId}/neris/incidents/${data.id}/exposures`,
        { data: { addressLine1: "Should Fail St" } },
      );
      expect(
        [401, 403, 404],
        `specialty create should be denied for feature-disabled tenant; got ${specialty.status} ${specialty.body}`,
      ).toContain(specialty.status);
    } else {
      const specialty = await apiRequest(
        page,
        "GET",
        `/api/v1/tenants/${tenantId}/neris/incidents/00000000-0000-4000-8000-000000000099/exposures`,
      );
      expect([401, 403, 404]).toContain(specialty.status);
    }
    await context.close();
  });
});
