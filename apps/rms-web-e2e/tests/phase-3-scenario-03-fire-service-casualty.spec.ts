import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, listPersonnelRaw, listUnitsRaw, readTenantId } from "../src/helpers/api.js";
import { getSecondaryCredentials, hasSecondaryCredentials, REQUIRE_SECONDARY } from "../src/env.js";
import { ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import {
  activateSpecialtySection,
  createStructureFireIncident,
  DENIED,
  expectDenied,
  listAudit,
  submitApproveFinalize,
  unwrapData,
} from "../src/helpers/specialty.js";

test.describe("Phase 3 scenario 3 — fire-service casualty @phase3", () => {
  test("firefighter injury fields, review, restriction, and lock", async ({
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
      "fire-service casualty",
    );

    const activate = await activateSpecialtySection(
      page,
      tenantId!,
      incidentId,
      "FIRE_SERVICE_CASUALTIES",
    );
    expect([200, 201]).toContain(activate.status);

    const personnelRes = await listPersonnelRaw(page, tenantId!);
    const unitsRes = await listUnitsRaw(page, tenantId!);
    const personnel = unwrapData<Array<{ id: string; displayName?: string; fullName?: string }>>(
      personnelRes.json,
    );
    const units = unwrapData<Array<{ id: string }>>(unitsRes.json);
    const person = Array.isArray(personnel) ? personnel[0] : undefined;
    const unit = Array.isArray(units) ? units[0] : undefined;

    const create = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/fire-service-casualties`,
      {
        data: {
          ...(person?.id
            ? {
                personnelId: person.id,
                personnelDisplayName: person.displayName ?? person.fullName ?? "Synthetic FF",
              }
            : {
                personnelUnknownException: "External mutual-aid firefighter (synthetic)",
                personnelDisplayName: `Synthetic FF ${runId}`,
              }),
          ...(unit?.id ? { unitId: unit.id } : {}),
          assignment: "Attack line",
          rank: "Firefighter",
          incidentActivity: "Interior attack",
          injuryType: "STRAIN",
          injurySeverity: "MODERATE",
          ppeUse: "FULL",
          scbaUse: "IN_USE",
          passStatus: "NOT_ACTIVATED",
          mayday: true,
          maydayDetails: `Synthetic mayday details ${runId}`,
          rapidIntervention: true,
          equipmentFailure: "None observed",
          treatmentStatus: "ON_SCENE",
          transportStatus: "NOT_TRANSPORTED",
          lostTimeStatus: "UNKNOWN",
          returnToDutyStatus: "PENDING",
          narrative: `FF restricted narrative ${runId}`,
        },
      },
    );
    expect([200, 201], create.body).toContain(create.status);
    const casualty = unwrapData<{
      id: string;
      assignment?: string;
      rank?: string;
      ppeUse?: string;
      mayday?: boolean;
      recordVersion: number;
    }>(create.json);

    expect(casualty.assignment).toBe("Attack line");
    expect(casualty.rank).toBe("Firefighter");
    expect(casualty.ppeUse).toBe("FULL");
    expect(casualty.mayday).toBe(true);

    // Safety Officer review assignment via specialty section approval.
    const approveSection = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/section-approvals`,
      {
        data: {
          sectionKey: "FIRE_SERVICE_CASUALTIES",
          reviewerRole: "SAFETY_OFFICER",
          note: `Safety Officer review ${runId}`,
        },
      },
    );
    expect([200, 201], approveSection.body).toContain(approveSection.status);

    // Masked list hides health narrative / name.
    const masked = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/fire-service-casualties`,
    );
    expect(masked.status).toBe(200);
    const maskedRow = (
      unwrapData<
        Array<{
          id: string;
          personnelDisplayName?: string;
          narrative?: string;
          restricted?: boolean;
        }>
      >(masked.json) ?? []
    ).find((r) => r.id === casualty.id);
    expect(maskedRow?.restricted).toBe(true);
    expect(maskedRow?.personnelDisplayName).toBe("[Restricted]");
    expect(maskedRow?.narrative).toBeUndefined();
    expect(JSON.stringify(masked.json)).not.toContain(`FF restricted narrative ${runId}`);

    // Unauthorized secondary cannot view restricted details.
    const secondaryContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const secondaryPage = await secondaryContext.newPage();
    await ensureAuthenticated(secondaryPage, getSecondaryCredentials());
    const denied = await apiRequest(
      secondaryPage,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/fire-service-casualties/${casualty.id}`,
    );
    expectDenied(denied.status, "unauthorized FF casualty get");
    expect(denied.body).not.toContain(`FF restricted narrative ${runId}`);

    const audit = await listAudit(page, tenantId!, incidentId);
    if (audit.length > 0) {
      expect(
        audit.some((e) => /fire_service_casualty|specialty_section|section/i.test(e.action ?? "")),
      ).toBe(true);
      expect(JSON.stringify(audit)).not.toContain(`FF restricted narrative ${runId}`);
    }

    await submitApproveFinalize(page, tenantId!, incidentId);
    const locked = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/fire-service-casualties/${casualty.id}`,
      { data: { injurySeverity: "SEVERE" }, ifMatch: casualty.recordVersion },
    );
    expect([...DENIED, 409, 400, 422]).toContain(locked.status);

    await secondaryContext.close();
  });
});
