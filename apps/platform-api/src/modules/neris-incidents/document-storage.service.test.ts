import { describe, expect, it } from "vitest";
import { isSignedAccessExpired } from "@forge/contracts";
import { DocumentStorageService, PRESIGN_EXPIRES_SECONDS } from "./document-storage.service.js";

describe("DocumentStorageService object keys", () => {
  it("scopes object keys by tenant and incident", () => {
    const service = Object.create(DocumentStorageService.prototype) as DocumentStorageService;
    const key = service.buildObjectKey("tenant-a", "incident-b", "uuid-file.pdf");
    expect(key).toBe("tenants/tenant-a/incidents/incident-b/documents/uuid-file.pdf");
    expect(key).not.toContain("tenant-b");
  });

  it("scopes branding keys by tenant and kind", () => {
    const service = Object.create(DocumentStorageService.prototype) as DocumentStorageService;
    const key = service.buildBrandingObjectKey("tenant-a", "logo", "uuid-logo.png");
    expect(key).toBe("tenants/tenant-a/branding/logo/uuid-logo.png");
    expect(() => service.assertTenantObjectKey(key, "tenant-b")).toThrow(
      /does not belong to the requested tenant/,
    );
  });

  it("sanitizes stored filenames", () => {
    const service = Object.create(DocumentStorageService.prototype) as DocumentStorageService;
    const name = service.buildStoredFilename("../../evil name!!.pdf");
    expect(name).toMatch(/\.pdf$/);
    expect(name).not.toContain("..");
    expect(name).not.toContain(" ");
  });

  it("rejects expired signed access", () => {
    const service = Object.create(DocumentStorageService.prototype) as DocumentStorageService;
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isSignedAccessExpired(past)).toBe(true);
    expect(() => service.assertDownloadNotExpired(past)).toThrow(/expired/i);
    expect(PRESIGN_EXPIRES_SECONDS).toBe(900);
  });
});
