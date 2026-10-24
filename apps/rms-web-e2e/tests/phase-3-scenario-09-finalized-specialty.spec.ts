import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, getIncident, patchIncidentRaw, readTenantId } from "../src/helpers/api.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import {
  activateSpecialtySection,
  completeAttachment,
  createStructureFireIncident,
  DENIED,
  initializeAttachment,
  sha256Hex,
  submitApproveFinalize,
  TINY_JPEG,
  unwrapData,
  uploadBytesToPresign,
} from "../src/helpers/specialty.js";
import { openIncidentSection } from "../src/helpers/navigation.js";

test.describe("Phase 3 scenario 9 — finalized specialty edits @phase3", () => {
  test("finalized specialty records reject all unauthorized edits", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(300_000);
    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();

    const incidentId = await createStructureFireIncident(
      page,
      tenantId!,
      runId,
      "finalized specialty edits",
    );

    for (const section of [
      "EXPOSURES",
      "CIVILIAN_CASUALTIES",
      "FIRE_SERVICE_CASUALTIES",
      "HAZMAT",
      "ALARM_DETECTION",
      "FIRE_PROTECTION",
    ]) {
      const act = await activateSpecialtySection(page, tenantId!, incidentId, section);
      expect([200, 201], `${section}: ${act.body}`).toContain(act.status);
    }

    const exposure = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures`,
          { data: { addressLine1: `Final Ave ${runId}` } },
        )
      ).json,
    );

    const civilian = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties`,
          {
            data: {
              personKnown: true,
              displayName: `Civ ${runId}`,
              injurySeverity: "MINOR",
            },
          },
        )
      ).json,
    );

    const ff = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/fire-service-casualties`,
          {
            data: {
              personnelUnknownException: "Synthetic mutual aid",
              personnelDisplayName: `FF ${runId}`,
              injurySeverity: "MINOR",
            },
          },
        )
      ).json,
    );

    const substance = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances`,
          { data: { productName: `Sub ${runId}`, unNaNumber: "UN1203", hazardClass: "3" } },
        )
      ).json,
    );

    const container = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/containers`,
          {
            data: {
              substanceId: substance.id,
              containerType: "DRUM",
              capacity: 55,
              capacityUnit: "GAL",
            },
          },
        )
      ).json,
    );

    const alarm = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/alarm-systems`,
          {
            data: {
              systemType: "ALARM",
              deviceType: "SMOKE",
              presence: "PRESENT",
              operation: "OPERATED",
            },
          },
        )
      ).json,
    );

    const protection = unwrapData<{ id: string; recordVersion: number }>(
      (
        await apiRequest(
          page,
          "POST",
          `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/protection-systems`,
          {
            data: {
              systemType: "SPRINKLER",
              presence: "PRESENT",
              operation: "OPERATED",
            },
          },
        )
      ).json,
    );

    const checksum = await sha256Hex(TINY_JPEG);
    const init = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: `final-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      checksumSha256: checksum,
      category: "OTHER",
    });
    const upload = unwrapData<{ attachmentId: string; uploadUrl: string }>(init.json);
    await uploadBytesToPresign(upload.uploadUrl, TINY_JPEG, "image/jpeg");
    const attComplete = await completeAttachment(
      page,
      tenantId!,
      incidentId,
      upload.attachmentId,
      checksum,
    );
    const attachment = unwrapData<{ attachmentId: string; recordVersion: number }>(
      attComplete.json,
    );

    const comment = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/review-comments`,
      {
        data: {
          body: `Pre-finalize review comment ${runId}`,
          sectionKey: "EXPOSURES",
        },
      },
    );
    expect([200, 201], comment.body).toContain(comment.status);

    await submitApproveFinalize(page, tenantId!, incidentId);

    const reject = async (label: string, result: { status: number; body: string }) => {
      expect([...DENIED, 409, 400, 422], `${label}: ${result.status} ${result.body}`).toContain(
        result.status,
      );
    };

    await reject(
      "exposure patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures/${exposure.id}`,
        { data: { city: "Nope" }, ifMatch: exposure.recordVersion },
      ),
    );
    await reject(
      "civilian patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/civilian-casualties/${civilian.id}`,
        { data: { injurySeverity: "SEVERE" }, ifMatch: civilian.recordVersion },
      ),
    );
    await reject(
      "ff patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/fire-service-casualties/${ff.id}`,
        { data: { injurySeverity: "SEVERE" }, ifMatch: ff.recordVersion },
      ),
    );
    await reject(
      "substance patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/substances/${substance.id}`,
        { data: { productName: "Nope" }, ifMatch: substance.recordVersion },
      ),
    );
    await reject(
      "container patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/hazmat/containers/${container.id}`,
        { data: { damage: "Nope" }, ifMatch: container.recordVersion },
      ),
    );
    await reject(
      "alarm patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/alarm-systems/${alarm.id}`,
        { data: { location: "Nope" }, ifMatch: alarm.recordVersion },
      ),
    );
    await reject(
      "protection patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/protection-systems/${protection.id}`,
        { data: { location: "Nope" }, ifMatch: protection.recordVersion },
      ),
    );
    await reject(
      "attachment metadata",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/${attachment.attachmentId}`,
        { data: { caption: "Nope" }, ifMatch: attachment.recordVersion },
      ),
    );
    await reject(
      "attachment archive",
      await apiRequest(
        page,
        "POST",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/${attachment.attachmentId}/archive`,
        { ifMatch: attachment.recordVersion },
      ),
    );

    // Repeated request + modified version number.
    await reject(
      "repeated exposure patch",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures/${exposure.id}`,
        { data: { city: "Nope2" }, ifMatch: exposure.recordVersion },
      ),
    );
    await reject(
      "modified version",
      await apiRequest(
        page,
        "PATCH",
        `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/exposures/${exposure.id}`,
        { data: { city: "Nope3" }, ifMatch: 999999 },
      ),
    );

    // RMS Web edit attempt.
    await openIncidentSection(page, incidentId, "OVERVIEW");
    const dispatch = page.getByLabel(/dispatch description/i);
    if (await dispatch.isVisible().catch(() => false)) {
      const prior = await dispatch.inputValue();
      await dispatch.fill(`${prior} blocked after finalize`);
      await expect(
        page.getByText(/locked|cannot edit|save failed|incident is locked|conflict/i).first(),
      ).toBeVisible({ timeout: 25_000 });
    }

    // Incident-level patch also locked.
    const incident = await getIncident(page, tenantId!, incidentId);
    const incidentPatch = await patchIncidentRaw(
      page,
      tenantId!,
      incidentId,
      { dispatchDescription: "should fail" },
      { ifMatch: incident.recordVersion },
    );
    await reject("incident patch", incidentPatch);
  });
});
