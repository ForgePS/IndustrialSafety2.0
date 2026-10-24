import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, readTenantId } from "../src/helpers/api.js";
import { getSecondaryCredentials, hasSecondaryCredentials, REQUIRE_SECONDARY } from "../src/env.js";
import { createManualIncident, ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId, syntheticDispatchDescription } from "../src/helpers/test-data.js";
import {
  completeAttachment,
  createStructureFireIncident,
  expectDenied,
  initializeAttachment,
  promoteToInProgress,
  sha256Hex,
  TINY_JPEG,
  unwrapData,
  uploadBytesToPresign,
} from "../src/helpers/specialty.js";

test.describe("Phase 3 scenario 8 — cross-tenant attachments @phase3", () => {
  test("tenant A cannot access tenant B attachments or public S3 objects", async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.setTimeout(240_000);
    test.skip(!hasSecondaryCredentials(), REQUIRE_SECONDARY);

    const runId = e2eRunId();
    const primaryTenantId = await readTenantId(page);
    expect(primaryTenantId).toBeTruthy();

    // Secondary (Tenant B) creates an attachment on its own incident.
    const secondaryContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const secondaryPage = await secondaryContext.newPage();
    await ensureAuthenticated(secondaryPage, getSecondaryCredentials());
    const secondaryTenantId = await readTenantId(secondaryPage);
    expect(secondaryTenantId).toBeTruthy();
    expect(secondaryTenantId).not.toBe(primaryTenantId);

    // Tenant B specialty is disabled — create a non-specialty document path may fail.
    // Prefer: primary creates attachment; secondary probes it. Also have secondary create
    // an incident and attempt attachment init (feature-disabled) for isolation.
    const primaryIncidentId = await createStructureFireIncident(
      page,
      primaryTenantId!,
      runId,
      "attachment owner A",
    );
    const checksum = await sha256Hex(TINY_JPEG);
    const init = await initializeAttachment(page, primaryTenantId!, primaryIncidentId, {
      originalFilename: `tenant-a-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      checksumSha256: checksum,
      category: "OTHER",
    });
    expect([200, 201], init.body).toContain(init.status);
    const upload = unwrapData<{
      attachmentId: string;
      uploadUrl: string;
      objectKey: string;
      recordVersion?: number;
    }>(init.json);
    expect(upload.objectKey).toContain(`tenants/${primaryTenantId}/`);
    const putStatus = await uploadBytesToPresign(upload.uploadUrl, TINY_JPEG, "image/jpeg");
    expect(putStatus).toBeLessThan(400);
    const complete = await completeAttachment(
      page,
      primaryTenantId!,
      primaryIncidentId,
      upload.attachmentId,
      checksum,
    );
    expect([200, 201]).toContain(complete.status);
    const dto = unwrapData<{
      attachmentId: string;
      objectKey: string;
      recordVersion: number;
      caption?: string | null;
    }>(complete.json);

    // Tenant B cannot list/read/mutate Tenant A attachment.
    const listDenied = await apiRequest(
      secondaryPage,
      "GET",
      `/api/v1/tenants/${primaryTenantId}/neris/incidents/${primaryIncidentId}/attachments`,
    );
    expectDenied(listDenied.status, "list attachments cross-tenant");

    const getDenied = await apiRequest(
      secondaryPage,
      "GET",
      `/api/v1/tenants/${primaryTenantId}/neris/incidents/${primaryIncidentId}/attachments/${dto.attachmentId}`,
    );
    expectDenied(getDenied.status, "get attachment metadata cross-tenant");
    expect(getDenied.body).not.toContain(dto.objectKey);

    // Download URL endpoint (if any) — probe common paths.
    const downloadDenied = await apiRequest(
      secondaryPage,
      "POST",
      `/api/v1/tenants/${primaryTenantId}/neris/incidents/${primaryIncidentId}/attachments/${dto.attachmentId}/download-url`,
      { data: {} },
    );
    expectDenied(downloadDenied.status, "create download URL cross-tenant");

    const patchDenied = await apiRequest(
      secondaryPage,
      "PATCH",
      `/api/v1/tenants/${primaryTenantId}/neris/incidents/${primaryIncidentId}/attachments/${dto.attachmentId}`,
      { data: { caption: "hijack" }, ifMatch: dto.recordVersion },
    );
    expectDenied(patchDenied.status, "modify caption cross-tenant");

    const archiveDenied = await apiRequest(
      secondaryPage,
      "POST",
      `/api/v1/tenants/${primaryTenantId}/neris/incidents/${primaryIncidentId}/attachments/${dto.attachmentId}/archive`,
      { ifMatch: dto.recordVersion },
    );
    expectDenied(archiveDenied.status, "archive cross-tenant");

    // Associate with another incident (reuse attachment id on wrong incident).
    const otherIncident = await createStructureFireIncident(
      page,
      primaryTenantId!,
      runId,
      "other incident",
    );
    const associateDenied = await apiRequest(
      secondaryPage,
      "PATCH",
      `/api/v1/tenants/${primaryTenantId}/neris/incidents/${otherIncident}/attachments/${dto.attachmentId}`,
      { data: { caption: "reassociate" }, ifMatch: 1 },
    );
    expectDenied(associateDenied.status, "associate attachment cross-tenant");

    // Replace tenant identifiers in request.
    const swappedTenant = await apiRequest(
      secondaryPage,
      "GET",
      `/api/v1/tenants/${secondaryTenantId}/neris/incidents/${primaryIncidentId}/attachments/${dto.attachmentId}`,
    );
    expectDenied(swappedTenant.status, "swapped tenant id");

    // Guess S3 object key / direct access — must not be public.
    const guessedKey = `tenants/${primaryTenantId}/incidents/${primaryIncidentId}/documents/guessed`;
    const bucketHostGuesses = [
      `https://s3.amazonaws.com/${encodeURIComponent(dto.objectKey)}`,
      `https://s3.us-east-1.amazonaws.com/${dto.objectKey}`,
    ];
    for (const url of bucketHostGuesses) {
      const res = await fetch(url, { method: "GET" });
      expect([403, 404, 400, 301, 302, 405], `public GET ${url} → ${res.status}`).toContain(
        res.status,
      );
    }
    void guessedKey;

    // Reuse Tenant A upload URL as Tenant B identity is irrelevant (presign is capability URL),
    // but expired/corrupted signature must fail.
    const expiredLike = upload.uploadUrl.replace(
      /X-Amz-Signature=[^&]+/,
      "X-Amz-Signature=deadbeef",
    );
    const expiredPut = await fetch(expiredLike, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: TINY_JPEG,
    });
    expect(expiredPut.status).toBeGreaterThanOrEqual(400);

    // Tenant B cannot initialize specialty attachment when feature disabled (own tenant).
    const bIncident = await createManualIncident(
      secondaryPage,
      `${syntheticDispatchDescription(runId)} tenant B attachment probe`,
    );
    await promoteToInProgress(secondaryPage, bIncident, runId).catch(() => undefined);
    const bInit = await initializeAttachment(secondaryPage, secondaryTenantId!, bIncident, {
      originalFilename: "should-fail.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      category: "OTHER",
    });
    expectDenied(bInit.status, "tenant B specialty attachment init");

    await secondaryContext.close();
  });
});
