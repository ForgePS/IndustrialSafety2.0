import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, getIncident, patchIncidentRaw, readTenantId } from "../src/helpers/api.js";
import {
  createSyntheticCadConnection,
  getCadConflict,
  listAuditEvents,
  simulatorSend,
  unwrapData,
  waitForOpenConflict,
  expectOkStatus,
  type CadConflict,
} from "../src/helpers/cad.js";
import { createManualIncident, ensureAuthenticated } from "../src/helpers/navigation.js";
import { submitApproveFinalize } from "../src/helpers/specialty.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import {
  getApiUrl,
  getSecondaryCredentials,
  hasSecondaryCredentials,
  REQUIRE_SECONDARY,
} from "../src/env.js";

/**
 * Deterministic KEEP_FORGE conflict resolution (@phase4 matrix row 23).
 * Creates its own prerequisites — fails if no OPEN conflict is produced.
 */
test.describe("Phase 4 deterministic KEEP_FORGE conflict @phase4 @cad-hybrid", () => {
  test("KEEP_FORGE conflict resolution end-to-end", async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.setTimeout(420_000);
    expect(hasSecondaryCredentials(), REQUIRE_SECONDARY).toBe(true);

    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const runId = e2eRunId();
    const sourceIncidentId = `SRC-KEEP-${runId}`;
    const forgeType = "FALSE_ALARM";
    const cadType = "STRUCTURE_FIRE";

    const connection = await createSyntheticCadConnection(page, tenantId!, {
      namePrefix: "e2e-keep-forge",
      environment: "SIMULATOR",
      transportType: "SYNTHETIC_SIMULATOR",
    });

    const incidentId = await createManualIncident(
      page,
      `${syntheticDispatchDescription(runId)} keep-forge conflict`,
    );
    let incident = await getIncident(page, tenantId!, incidentId);
    const patch = await patchIncidentRaw(
      page,
      tenantId!,
      incidentId,
      { primaryIncidentTypeCode: forgeType },
      { ifMatch: incident.recordVersion },
    );
    expectOkStatus(patch.status, "set forge primaryIncidentTypeCode");
    incident = await getIncident(page, tenantId!, incidentId);
    expect(incident).toMatchObject({ id: incidentId });
    const typed = incident as typeof incident & { primaryIncidentTypeCode?: string | null };
    expect(typed.primaryIncidentTypeCode).toBe(forgeType);

    const link = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/cad-link`,
      {
        data: {
          cadConnectionId: connection.id,
          sourceIncidentId,
          reason: "phase4 deterministic KEEP_FORGE prerequisite link",
        },
      },
    );
    expectOkStatus(link.status, "manual CAD link");

    await submitApproveFinalize(page, tenantId!, incidentId);
    incident = await getIncident(page, tenantId!, incidentId);
    expect(incident.status).toMatch(/FINALIZED/i);
    const forgeValueBefore = (incident as { primaryIncidentTypeCode?: string | null })
      .primaryIncidentTypeCode;

    const send = await simulatorSend(page, tenantId!, {
      connectionId: connection.id,
      scenarioId: "update-incident",
      delivery: "DIRECT_QUEUE",
      sourceIncidentId,
      sourceSequence: 2,
      overrides: { callType: cadType },
    });
    expect(send.rawMessageId).toBeTruthy();

    const openConflict = await waitForOpenConflict(page, tenantId!, { incidentId }, 180_000);
    expect(openConflict.status).toMatch(/OPEN|ESCALATED/);
    expect(openConflict.conflictType).toMatch(/FINALIZED_RECORD_CONFLICT|VALUE_CONFLICT/);
    expect(openConflict.cadValueJson).toBeTruthy();
    expect(openConflict.forgeValueJson).toBeTruthy();
    expect(openConflict.ownershipPolicy || openConflict.recommendedResolution).toBeTruthy();
    expect(openConflict.recommendedResolution).toBeTruthy();
    // Field identifier is required for value conflicts; finalized record conflicts may use status/type field.
    expect(openConflict.fieldIdentifier).toBeTruthy();
    expect(
      openConflict.cadRawMessageId || openConflict.cadNormalizedEventId,
      "source event linkage required",
    ).toBeTruthy();

    const noReason = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/conflicts/${openConflict.id}/resolve`,
      {
        data: {
          resolutionAction: "KEEP_FORGE",
          resolutionReason: "   ",
          recordVersion: openConflict.recordVersion,
        },
      },
    );
    expect(noReason.status).toBeGreaterThanOrEqual(400);
    expect(noReason.status).toBeLessThan(500);

    const resolve = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/cad/conflicts/${openConflict.id}/resolve`,
      {
        data: {
          resolutionAction: "KEEP_FORGE",
          resolutionReason: "phase4 deterministic KEEP_FORGE acceptance",
          recordVersion: openConflict.recordVersion,
        },
      },
    );
    expectOkStatus(resolve.status, "KEEP_FORGE resolve");
    const resolved = unwrapData<CadConflict>(resolve.json);
    expect(resolved.status).toBe("MANUALLY_RESOLVED");
    expect(resolved.resolutionAction).toBe("KEEP_FORGE");
    expect(resolved.resolutionReason).toMatch(/KEEP_FORGE/i);
    expect(resolved.resolvedByUserId).toBeTruthy();
    expect(resolved.resolvedAt).toBeTruthy();

    const after = await getCadConflict(page, tenantId!, openConflict.id);
    expect(after.status).toBe("MANUALLY_RESOLVED");
    expect(after.cadValueJson).toEqual(openConflict.cadValueJson);
    expect(after.forgeValueJson).toEqual(openConflict.forgeValueJson);

    const incidentAfter = await getIncident(page, tenantId!, incidentId);
    const forgeValueAfter = (incidentAfter as { primaryIncidentTypeCode?: string | null })
      .primaryIncidentTypeCode;
    expect(forgeValueAfter).toBe(forgeValueBefore ?? forgeType);

    const audits = await listAuditEvents(page, tenantId!);
    const conflictAudit = audits.find(
      (row) =>
        row.resourceId === openConflict.id &&
        String(row.action ?? "").includes("CONFLICT") &&
        row.result === "SUCCESS",
    );
    expect(conflictAudit, "CAD conflict audit event required").toBeTruthy();

    const secondary = getSecondaryCredentials();
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const secondaryPage = await context.newPage();
    try {
      await ensureAuthenticated(secondaryPage, secondary);
      const secondaryTenantId = await readTenantId(secondaryPage);
      expect(secondaryTenantId).toBeTruthy();
      expect(secondaryTenantId).not.toBe(tenantId);

      const viewDenied = await apiRequest(
        secondaryPage,
        "GET",
        `/api/v1/tenants/${tenantId}/cad/conflicts/${openConflict.id}`,
      );
      expect([403, 404]).toContain(viewDenied.status);

      const resolveDenied = await apiRequest(
        secondaryPage,
        "POST",
        `/api/v1/tenants/${tenantId}/cad/conflicts/${openConflict.id}/resolve`,
        {
          data: {
            resolutionAction: "KEEP_FORGE",
            resolutionReason: "cross-tenant must fail",
            recordVersion: after.recordVersion,
          },
        },
      );
      expect([403, 404]).toContain(resolveDenied.status);

      // Unauthorized: secondary principal lacks Tenant A conflict-resolution permission on A resources.
      expect([403, 404]).toContain(resolveDenied.status);
    } finally {
      await context.close();
    }

    const unauth = await page
      .context()
      .request.fetch(
        `${getApiUrl()}/api/v1/tenants/${tenantId}/cad/conflicts/${openConflict.id}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          data: JSON.stringify({
            resolutionAction: "KEEP_FORGE",
            resolutionReason: "missing bearer must fail",
            recordVersion: after.recordVersion,
          }),
        },
      );
    expect([401, 403]).toContain(unauth.status());
  });
});
