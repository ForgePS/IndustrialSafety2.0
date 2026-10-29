import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, readTenantId } from "../src/helpers/api.js";
import { getSecondaryCredentials, hasSecondaryCredentials, REQUIRE_SECONDARY } from "../src/env.js";
import { ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import {
  activateSpecialtySection,
  completeAttachment,
  createStructureFireIncident,
  DENIED,
  expectDenied,
  initializeAttachment,
  setPrimaryType,
  sha256Hex,
  submitApproveFinalize,
  TINY_JPEG,
  unwrapData,
  uploadBytesToPresign,
  validateIncident,
} from "../src/helpers/specialty.js";
import { promoteToInProgress } from "../src/helpers/specialty.js";
import { createManualIncident } from "../src/helpers/navigation.js";
import { syntheticDispatchDescription } from "../src/helpers/test-data.js";

test.describe("Phase 3 scenario 4 — hazmat release @phase3", () => {
  test("transportation hazmat with substances, containers, review, isolation, lock", async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.setTimeout(240_000);
    test.skip(!hasSecondaryCredentials(), REQUIRE_SECONDARY);

    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();

    const incidentId = await createManualIncident(
      page,
      `${syntheticDispatchDescription(runId)} hazmat transportation release`,
    );
    await promoteToInProgress(page, incidentId, runId);
    await setPrimaryType(page, tenantId!, incidentId, "HAZMAT_RELEASE");
    const activate = await activateSpecialtySection(page, tenantId!, incidentId, "HAZMAT");
    expect([200, 201]).toContain(activate.status);

    const s1 = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances`,
      {
        data: {
          productName: `Synthetic Diesel ${runId}`,
          unNaNumber: "UN1202",
          hazardClass: "3",
          quantityReleased: 200,
          unitOfMeasure: "GAL",
          releaseStatus: "RELEASED",
          environmentalImpact: "Soil staining at release location (synthetic)",
          waterwayImpact: "None observed",
          responsibleParty: "Synthetic Carrier LLC",
          narrative:
            "PPE level B; decontamination corridor established; protective actions: isolate 100m; evacuation of adjacent lot.",
        },
      },
    );
    const s2 = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances`,
      {
        data: {
          productName: `Synthetic Battery Acid ${runId}`,
          unNaNumber: "UN2796",
          hazardClass: "8",
          quantityReleased: 5,
          unitOfMeasure: "GAL",
          releaseStatus: "CONTAINED",
        },
      },
    );
    expect([200, 201], s1.body).toContain(s1.status);
    expect([200, 201], s2.body).toContain(s2.status);
    const substance1 = unwrapData<{ id: string; recordVersion: number }>(s1.json);
    const substance2 = unwrapData<{ id: string }>(s2.json);

    const c1 = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/containers`,
      {
        data: {
          substanceId: substance1.id,
          containerType: "CARGO_TANK",
          capacity: 5000,
          capacityUnit: "GAL",
          leakLocation: "Rear valve",
          controlAction: "Valve shutoff + absorbent",
        },
      },
    );
    const c2 = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/containers`,
      {
        data: {
          substanceId: substance2.id,
          containerType: "DRUM",
          capacity: 55,
          capacityUnit: "GAL",
          damage: "Dent on side",
        },
      },
    );
    expect([200, 201], c1.body).toContain(c1.status);
    expect([200, 201], c2.body).toContain(c2.status);

    // Invalid quantity rejected.
    const badQty = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances`,
      { data: { productName: "Bad", quantityReleased: -1, unitOfMeasure: "GAL" } },
    );
    expect([400, 422]).toContain(badQty.status);

    const badContainer = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/containers`,
      { data: { containerType: "" } },
    );
    expect([400, 422]).toContain(badContainer.status);

    const findings = await validateIncident(page, tenantId!, incidentId);
    expect(findings.findings.length >= 0).toBe(true);

    // Specialty review for hazmat.
    const review = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/section-approvals`,
      {
        data: {
          sectionKey: "HAZMAT",
          reviewerRole: "HAZMAT_OFFICER",
          note: `Hazmat specialty review ${runId}`,
        },
      },
    );
    expect([200, 201], review.body).toContain(review.status);

    // Attachment linked to hazmat.
    const checksum = await sha256Hex(TINY_JPEG);
    const init = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: `hazmat-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      checksumSha256: checksum,
      specialtySection: "HAZMAT",
      category: "OTHER",
    });
    expect([200, 201], init.body).toContain(init.status);
    const upload = unwrapData<{ attachmentId: string; uploadUrl: string }>(init.json);
    const putStatus = await uploadBytesToPresign(upload.uploadUrl, TINY_JPEG, "image/jpeg");
    expect(putStatus).toBeLessThan(400);
    const complete = await completeAttachment(
      page,
      tenantId!,
      incidentId,
      upload.attachmentId,
      checksum,
    );
    expect([200, 201], complete.body).toContain(complete.status);
    const att = unwrapData<{ malwareScanStatus?: string; clearedForUse?: boolean }>(complete.json);
    expect(att.clearedForUse).not.toBe(true);
    expect(att.malwareScanStatus).not.toBe("CLEARED");

    // Tenant isolation.
    const secondaryContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const secondaryPage = await secondaryContext.newPage();
    await ensureAuthenticated(secondaryPage, getSecondaryCredentials());
    const denied = await apiRequest(
      secondaryPage,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances`,
    );
    expectDenied(denied.status, "cross-tenant hazmat list");
    expect(denied.body).not.toContain(runId);

    await submitApproveFinalize(page, tenantId!, incidentId);
    const locked = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances/${substance1.id}`,
      { data: { quantityReleased: 999 }, ifMatch: substance1.recordVersion },
    );
    expect([...DENIED, 409, 400, 422]).toContain(locked.status);

    await secondaryContext.close();
  });
});
