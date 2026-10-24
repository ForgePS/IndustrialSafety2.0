import { test, expect } from "../src/fixtures/index.js";
import { apiRequest, readTenantId } from "../src/helpers/api.js";
import { getSecondaryCredentials, hasSecondaryCredentials, REQUIRE_SECONDARY } from "../src/env.js";
import { ensureAuthenticated } from "../src/helpers/navigation.js";
import { e2eRunId } from "../src/helpers/test-data.js";
import {
  completeAttachment,
  createStructureFireIncident,
  DENIED,
  expectDenied,
  initializeAttachment,
  sha256Hex,
  submitApproveFinalize,
  TINY_JPEG,
  TINY_PDF,
  TINY_PNG,
  unwrapData,
  uploadBytesToPresign,
} from "../src/helpers/specialty.js";

test.describe("Phase 3 attachment acceptance matrix @phase3", () => {
  test("file types, validation, quarantine, isolation, finalize, audit", async ({
    authenticatedPage: page,
    browser,
  }) => {
    test.setTimeout(300_000);
    test.skip(!hasSecondaryCredentials(), REQUIRE_SECONDARY);

    const runId = e2eRunId();
    const tenantId = await readTenantId(page);
    expect(tenantId).toBeTruthy();
    const incidentId = await createStructureFireIncident(
      page,
      tenantId!,
      runId,
      "attachment matrix",
    );

    async function happyPath(
      bytes: Uint8Array,
      mimeType: string,
      filename: string,
    ): Promise<{
      attachmentId: string;
      objectKey: string;
      recordVersion: number;
      malwareScanStatus?: string;
      clearedForUse?: boolean;
    }> {
      const checksum = await sha256Hex(bytes);
      const init = await initializeAttachment(page, tenantId!, incidentId, {
        originalFilename: filename,
        mimeType,
        fileSizeBytes: bytes.byteLength,
        checksumSha256: checksum,
        category: mimeType === "application/pdf" ? "PDF" : "OTHER",
      });
      expect([200, 201], `${filename} init: ${init.body}`).toContain(init.status);
      const upload = unwrapData<{
        attachmentId: string;
        uploadUrl: string;
        objectKey: string;
        expiresInSeconds: number;
      }>(init.json);
      expect(upload.expiresInSeconds).toBeLessThanOrEqual(15 * 60);
      expect(upload.objectKey.startsWith(`tenants/${tenantId}/`)).toBe(true);
      expect(upload.objectKey).not.toContain("..");
      const put = await uploadBytesToPresign(upload.uploadUrl, bytes, mimeType);
      expect(put).toBeLessThan(400);
      const complete = await completeAttachment(
        page,
        tenantId!,
        incidentId,
        upload.attachmentId,
        checksum,
      );
      expect([200, 201], `${filename} complete: ${complete.body}`).toContain(complete.status);
      const dto = unwrapData<{
        attachmentId: string;
        objectKey: string;
        recordVersion: number;
        malwareScanStatus?: string;
        clearedForUse?: boolean;
      }>(complete.json);
      expect(dto.clearedForUse).not.toBe(true);
      expect(dto.malwareScanStatus).not.toBe("CLEARED");
      return dto;
    }

    await happyPath(TINY_JPEG, "image/jpeg", `matrix-${runId}.jpg`);
    await happyPath(TINY_PNG, "image/png", `matrix-${runId}.png`);
    await happyPath(TINY_PDF, "application/pdf", `matrix-${runId}.pdf`);

    // Unsupported type
    const unsupported = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: "malware.exe",
      mimeType: "application/x-msdownload",
      fileSizeBytes: 128,
      category: "OTHER",
    });
    expect([400, 422]).toContain(unsupported.status);

    // Oversized
    const oversized = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: "big.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 50 * 1024 * 1024 + 1,
      category: "OTHER",
    });
    expect([400, 422]).toContain(oversized.status);

    // Empty file
    const empty = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: "empty.jpg",
      mimeType: "image/jpeg",
      fileSizeBytes: 0,
      category: "OTHER",
    });
    expect([400, 422]).toContain(empty.status);

    // Invalid MIME (allowed extension family but not allowlisted)
    const badMime = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: "x.jpg",
      mimeType: "text/html",
      fileSizeBytes: 10,
      category: "OTHER",
    });
    expect([400, 422]).toContain(badMime.status);

    // Dangerous filenames — rejected at the edge/API, or accepted with sanitized object keys.
    for (const name of [
      `..\\evil-${runId}.jpg`,
      `../evil-${runId}.jpg`,
      `path/evil-${runId}.jpg`,
    ]) {
      const checksum = await sha256Hex(TINY_JPEG);
      const init = await initializeAttachment(page, tenantId!, incidentId, {
        originalFilename: name,
        mimeType: "image/jpeg",
        fileSizeBytes: TINY_JPEG.byteLength,
        checksumSha256: checksum,
        category: "OTHER",
      });
      expect([200, 201, 400, 403, 422], name).toContain(init.status);
      if (![200, 201].includes(init.status)) {
        continue;
      }
      const upload = unwrapData<{ objectKey: string; uploadUrl: string; attachmentId: string }>(
        init.json,
      );
      expect(upload.objectKey.includes("..")).toBe(false);
      expect(upload.objectKey).not.toMatch(/\/\.\.\//);
      await uploadBytesToPresign(upload.uploadUrl, TINY_JPEG, "image/jpeg");
      await completeAttachment(page, tenantId!, incidentId, upload.attachmentId, checksum);
    }

    // Interrupted upload — initialized but not completed; never cleared.
    const interruptedChecksum = await sha256Hex(TINY_JPEG);
    const interrupted = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: `interrupted-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      checksumSha256: interruptedChecksum,
      category: "OTHER",
    });
    const interruptedUpload = unwrapData<{
      attachmentId: string;
      malwareScanStatus?: string;
    }>(interrupted.json);
    const interruptedGet = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/${interruptedUpload.attachmentId}`,
    );
    expect(interruptedGet.status).toBe(200);
    const interruptedDto = unwrapData<{
      uploadStatus?: string;
      malwareScanStatus?: string;
      clearedForUse?: boolean;
    }>(interruptedGet.json);
    expect(interruptedDto.clearedForUse).not.toBe(true);
    expect(interruptedDto.malwareScanStatus).not.toBe("CLEARED");

    // Invalid checksum on complete
    const badCheckInit = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: `badcheck-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      checksumSha256: interruptedChecksum,
      category: "OTHER",
    });
    const badCheck = unwrapData<{ attachmentId: string; uploadUrl: string }>(badCheckInit.json);
    await uploadBytesToPresign(badCheck.uploadUrl, TINY_JPEG, "image/jpeg");
    const wrongChecksum = "a".repeat(64);
    const badComplete = await completeAttachment(
      page,
      tenantId!,
      incidentId,
      badCheck.attachmentId,
      wrongChecksum,
    );
    expect([400, 422]).toContain(badComplete.status);

    // Duplicate completion — first succeeds, second should not clear / may conflict.
    const dupChecksum = await sha256Hex(TINY_JPEG);
    const dupInit = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: `dup-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      checksumSha256: dupChecksum,
      category: "OTHER",
    });
    const dup = unwrapData<{ attachmentId: string; uploadUrl: string }>(dupInit.json);
    await uploadBytesToPresign(dup.uploadUrl, TINY_JPEG, "image/jpeg");
    const first = await completeAttachment(
      page,
      tenantId!,
      incidentId,
      dup.attachmentId,
      dupChecksum,
    );
    expect([200, 201]).toContain(first.status);
    const second = await completeAttachment(
      page,
      tenantId!,
      incidentId,
      dup.attachmentId,
      dupChecksum,
    );
    const secondDto = unwrapData<{ malwareScanStatus?: string; clearedForUse?: boolean }>(
      second.json,
    );
    if (second.status < 400) {
      expect(secondDto.clearedForUse).not.toBe(true);
      expect(secondDto.malwareScanStatus).not.toBe("CLEARED");
    } else {
      expect([...DENIED, 409, 400, 422]).toContain(second.status);
    }

    // Expired / invalid presign
    const expInit = await initializeAttachment(page, tenantId!, incidentId, {
      originalFilename: `exp-${runId}.jpg`,
      mimeType: "image/jpeg",
      fileSizeBytes: TINY_JPEG.byteLength,
      category: "OTHER",
    });
    const exp = unwrapData<{ uploadUrl: string; expiresInSeconds: number }>(expInit.json);
    expect(exp.expiresInSeconds).toBeLessThanOrEqual(900);
    const bogus = exp.uploadUrl.replace(/X-Amz-Signature=[^&]+/, "X-Amz-Signature=expired");
    const expiredPut = await fetch(bogus, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: TINY_JPEG,
    });
    expect(expiredPut.status).toBeGreaterThanOrEqual(400);

    // Unauthorized / cross-tenant
    const secondaryContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const secondaryPage = await secondaryContext.newPage();
    await ensureAuthenticated(secondaryPage, getSecondaryCredentials());
    const unauth = await apiRequest(
      secondaryPage,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments`,
    );
    expectDenied(unauth.status, "unauthorized attachment list");

    // Finalize then reject metadata edits; archive also rejected.
    const live = await happyPath(TINY_JPEG, "image/jpeg", `final-live-${runId}.jpg`);
    await submitApproveFinalize(page, tenantId!, incidentId);
    const finalizedPatch = await apiRequest(
      page,
      "PATCH",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/${live.attachmentId}`,
      { data: { caption: "nope" }, ifMatch: live.recordVersion },
    );
    expect([...DENIED, 409, 400, 422]).toContain(finalizedPatch.status);
    const finalizedArchive = await apiRequest(
      page,
      "POST",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments/${live.attachmentId}/archive`,
      { ifMatch: live.recordVersion },
    );
    expect([...DENIED, 409, 400, 422]).toContain(finalizedArchive.status);

    // Quarantined never shown as cleared — list DTO.
    const list = await apiRequest(
      page,
      "GET",
      `/api/v1/tenants/${tenantId}/neris/incidents/${incidentId}/attachments`,
    );
    expect(list.status).toBe(200);
    const rows = unwrapData<
      Array<{ clearedForUse?: boolean; malwareScanStatus?: string; originalFilename?: string }>
    >(list.json);
    for (const row of Array.isArray(rows) ? rows : []) {
      expect(row.clearedForUse).not.toBe(true);
      expect(row.malwareScanStatus).not.toBe("CLEARED");
    }
    // Attachment binary content must not appear in API JSON logs/body as raw bytes dump.
    expect(list.body).not.toContain(Buffer.from(TINY_JPEG).toString("base64").slice(0, 32));

    await secondaryContext.close();
  });
});
