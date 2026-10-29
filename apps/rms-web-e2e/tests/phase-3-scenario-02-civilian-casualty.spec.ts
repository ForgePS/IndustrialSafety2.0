import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, getIncident, readTenantId } from "../src/helpers/api.js";
import {
  getBaseUrl,
  getSecondaryCredentials,
  hasSecondaryCredentials,
  REQUIRE_SECONDARY,
} from "../src/env.js";
import { ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import {
  activateSpecialtySection,
  createStructureFireIncident,
  DENIED,
  expectDenied,
  findFieldId,
  listAudit,
  submitApproveFinalize,
  unwrapData,
  validateIncident,
} from "../src/helpers/specialty.js";

test.describe("Phase 3 scenario 2 — civilian casualty @phase3", () => {
  test("structure fire civilian casualty security and reconciliation", async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.setTimeout(240_000);
    test.skip(!hasSecondaryCredentials(), REQUIRE_SECONDARY);

    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();

    const incidentId = await createStructureFireIncident(
      page,
      tenantId!,
      runId,
      "civilian casualty scenario",
    );

    const activate = await activateSpecialtySection(
      page,
      tenantId!,
      incidentId,
      "CIVILIAN_CASUALTIES",
    );
    expect([200, 201], `activate civilian: ${activate.body}`).toContain(activate.status);

    const casualtyName = `Synthetic Civilian ${runId}`;
    const create = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties`,
      {
        data: {
          personKnown: true,
          displayName: casualtyName,
          age: 42,
          sex: "UNKNOWN",
          injuryType: "SMOKE_INHALATION",
          injurySeverity: "MODERATE",
          transportStatus: "TRANSPORTED",
          destinationReference: "Synthetic General Hospital",
          narrative: `Restricted narrative for ${runId}`,
          fatality: false,
        },
      },
    );
    expect([200, 201], `create casualty: ${create.body}`).toContain(create.status);
    const casualty = unwrapData<{ id: string; displayName?: string; recordVersion: number }>(
      create.json,
    );
    expect(casualty.displayName).toBe(casualtyName);

    // Count reconciliation via reported field value when catalog provides a matching field.
    const countField = await findFieldId(page, tenantId!, incidentId, "civilian_injur");
    if (countField) {
      const incident = await getIncident(page, tenantId!, incidentId);
      const upsert = await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/field-values`,
        {
          data: {
            values: [
              {
                fieldId: countField.fieldId,
                sectionKey: countField.sectionKey,
                valueNumber: 99,
              },
            ],
          },
          ifMatch: incident.recordVersion,
        },
      );
      expect(upsert.status).toBeLessThan(500);
      const mismatched = await validateIncident(page, tenantId!, incidentId);
      expect(
        mismatched.findings.some((f) =>
          /civilian_casualty\.count\.reconcile|injury count/i.test(
            `${f.technicalReference ?? ""} ${f.message ?? ""}`,
          ),
        ),
        `expected count reconcile finding; got ${JSON.stringify(mismatched.findings).slice(0, 800)}`,
      ).toBe(true);

      const after = await getIncident(page, tenantId!, incidentId);
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/field-values`,
        {
          data: {
            values: [
              {
                fieldId: countField.fieldId,
                sectionKey: countField.sectionKey,
                valueNumber: 1,
              },
            ],
          },
          ifMatch: after.recordVersion,
        },
      );
    } else {
      // Fatality reconciliation path when injury-count fields are not seeded.
      const fatalityCreate = await apiRequest(
        page,
        "POST",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties`,
        {
          data: {
            personKnown: false,
            unknownPersonHandling: "ANONYMIZED",
            fatality: true,
          },
        },
      );
      expect([200, 201]).toContain(fatalityCreate.status);
      const fatality = unwrapData<{ id: string }>(fatalityCreate.json);
      const findings = await validateIncident(page, tenantId!, incidentId);
      expect(
        findings.findings.some((f) =>
          /fatality|severity and outcome/i.test(`${f.technicalReference ?? ""} ${f.message ?? ""}`),
        ),
        `expected fatality reconcile; got ${JSON.stringify(findings.findings).slice(0, 800)}`,
      ).toBe(true);
      // Clean up incomplete fatality card for finalize path.
      await apiRequest(
        page,
        "POST",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties/${fatality.id}/archive`,
        { ifMatch: "*" },
      );
    }

    // Authorized full access.
    const fullList = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties?full=true`,
    );
    expect(fullList.status).toBe(200);
    const fullRows = unwrapData<Array<{ id: string; displayName?: string; restricted?: boolean }>>(
      fullList.json,
    );
    expect(
      (Array.isArray(fullRows) ? fullRows : []).find((r) => r.id === casualty.id)?.displayName,
    ).toBe(casualtyName);

    const getOne = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties/${casualty.id}`,
    );
    expect(getOne.status).toBe(200);
    expect(unwrapData<{ narrative?: string }>(getOne.json).narrative).toContain(runId);

    // Masked list for ordinary views.
    const maskedList = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties`,
    );
    expect(maskedList.status).toBe(200);
    const masked = (
      unwrapData<
        Array<{ id: string; displayName?: string | null; narrative?: string; restricted?: boolean }>
      >(maskedList.json) ?? []
    ).find((r) => r.id === casualty.id);
    expect(masked?.restricted).toBe(true);
    expect(masked?.displayName).toBe("[Restricted]");
    expect(masked?.narrative).toBeUndefined();
    expect(JSON.stringify(maskedList.json)).not.toContain(casualtyName);
    expect(JSON.stringify(maskedList.json)).not.toContain(`Restricted narrative for ${runId}`);

    // Unauthorized secondary tenant — API / URL / tenant-context / RLS probes.
    const secondaryContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const secondaryPage = await secondaryContext.newPage();
    await ensureAuthenticated(secondaryPage, getSecondaryCredentials());
    const secondaryTenantId = await readTenantId(secondaryPage);
    expect(secondaryTenantId).toBeTruthy();
    expect(secondaryTenantId).not.toBe(tenantId);

    for (const [label, result] of [
      [
        "direct API get",
        await apiRequest(
          secondaryPage,
          "GET",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties/${casualty.id}`,
        ),
      ],
      [
        "direct API list full",
        await apiRequest(
          secondaryPage,
          "GET",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties?full=true`,
        ),
      ],
      [
        "modified tenant path",
        await apiRequest(
          secondaryPage,
          "GET",
          `/api/v1/tenants/${secondaryTenantId}/neris/incidents/${incidentId}/civilian-casualties/${casualty.id}`,
        ),
      ],
      [
        "RLS wrong-tenant path as primary",
        await apiRequest(
          page,
          "GET",
          `/api/v1/tenants/${secondaryTenantId}/neris/incidents/${incidentId}/civilian-casualties/${casualty.id}`,
        ),
      ],
    ] as const) {
      expectDenied(result.status, label);
      expect(result.body, label).not.toContain(casualtyName);
    }

    await secondaryPage.goto(`${getBaseUrl()}/incidents/${incidentId}/`);
    await expect(secondaryPage.locator("body")).toBeVisible();
    const bodyText = await secondaryPage.locator("body").innerText();
    expect(bodyText).not.toContain(casualtyName);
    expect(bodyText).not.toContain(`Restricted narrative for ${runId}`);

    // Audit: sensitive access recorded; restricted name not in audit payload.
    const audit = await listAudit(page, tenantId!, incidentId);
    if (audit.length > 0) {
      expect(audit.some((e) => /civilian_casualty/i.test(e.action ?? ""))).toBe(true);
      expect(JSON.stringify(audit)).not.toContain(casualtyName);
      expect(JSON.stringify(audit)).not.toContain(`Restricted narrative for ${runId}`);
    }

    // Finalization lock.
    await submitApproveFinalize(page, tenantId!, incidentId);
    const locked = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties/${casualty.id}`,
      { data: { injurySeverity: "SEVERE" }, ifMatch: casualty.recordVersion },
    );
    expect([...DENIED, 409, 400, 422]).toContain(locked.status);

    await secondaryContext.close();
  });
});
