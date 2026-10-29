import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, readTenantId } from "../src/helpers/api.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import { createManualIncident } from "../src/helpers/navigation.js";
import {
  activateSpecialtySection,
  DENIED,
  promoteToInProgress,
  setPrimaryType,
  submitApproveFinalize,
  unwrapData,
} from "../src/helpers/specialty.js";

test.describe("Phase 3 scenario 5 — alarm and impaired sprinkler @phase3", () => {
  test("alarm + fire-protection impairment, referral, review, lock", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(240_000);
    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();

    const incidentId = await createManualIncident(
      page,
      `${syntheticDispatchDescription(runId)} automatic fire alarm`,
    );
    await promoteToInProgress(page, incidentId, runId);
    await setPrimaryType(page, tenantId!, incidentId, "FALSE_ALARM");

    const alarmAct = await activateSpecialtySection(page, tenantId!, incidentId, "ALARM_DETECTION");
    const protAct = await activateSpecialtySection(page, tenantId!, incidentId, "FIRE_PROTECTION");
    expect([200, 201], alarmAct.body).toContain(alarmAct.status);
    expect([200, 201], protAct.body).toContain(protAct.status);

    const alarm = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/alarm-systems`,
      {
        data: {
          systemType: "ALARM",
          deviceType: "AUTOMATIC_FIRE_ALARM",
          location: "Main lobby",
          presence: "PRESENT",
          activation: "ACTIVATED",
          operation: "OPERATED",
          numberActivated: 1,
        },
      },
    );
    expect([200, 201], alarm.body).toContain(alarm.status);

    const incomplete = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/protection-systems`,
      {
        data: {
          systemType: "SPRINKLER",
          location: "Warehouse",
          presence: "PRESENT",
          activation: "DID_NOT_ACTIVATE",
          operation: "FAILED",
          impairment: true,
          numberActivatedUnknown: true,
        },
      },
    );
    expect([200, 201], incomplete.body).toContain(incomplete.status);
    const incompleteSys = unwrapData<{ id: string; recordVersion: number }>(incomplete.json);

    const validateRes = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/validate`,
      { data: {} },
    );
    expect(validateRes.status).toBeLessThan(500);
    const findings = unwrapData<{
      findings?: Array<{ technicalReference?: string; message?: string }>;
      issues?: Array<{ technicalReference?: string; message?: string }>;
    }>(validateRes.json);
    const all = [...(findings.findings ?? []), ...(findings.issues ?? [])];
    expect(
      all.some((f) =>
        /failure|impairment/i.test(`${f.technicalReference ?? ""} ${f.message ?? ""}`),
      ),
      `expected impairment/failure finding; got ${JSON.stringify(all).slice(0, 900)}`,
    ).toBe(true);

    const complete = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/protection-systems/${incompleteSys.id}`,
      {
        data: {
          failureReason: "Control valve closed (synthetic)",
          correctiveAction: "Valve restored open; system returned to service",
          inspectionReferral: `Fire prevention referral ${runId}`,
          contractor: `Owner notified: property manager ${runId}`,
          reviewComments: `Prevention review comment ${runId}`,
        },
        ifMatch: incompleteSys.recordVersion,
      },
    );
    expect(complete.status).toBeLessThan(400);
    const completed = unwrapData<{
      inspectionReferral?: string;
      reviewComments?: string;
      recordVersion: number;
    }>(complete.json);
    expect(completed.inspectionReferral).toContain(runId);
    expect(completed.reviewComments).toContain(runId);

    const comment = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/review-comments`,
      {
        data: {
          body: `Alarm/protection review comment ${runId}`,
          sectionKey: "FIRE_PROTECTION",
          reviewerRole: "PREVENTION_OFFICER",
        },
      },
    );
    expect([200, 201], comment.body).toContain(comment.status);

    await submitApproveFinalize(page, tenantId!, incidentId);
    const locked = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/protection-systems/${incompleteSys.id}`,
      { data: { reviewComments: "should fail" }, ifMatch: completed.recordVersion },
    );
    expect([...DENIED, 409, 400, 422]).toContain(locked.status);
  });
});
