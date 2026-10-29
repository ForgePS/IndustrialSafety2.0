import { describe, expect, it } from "vitest";
import {
  PACKAGE_TENANT_ID,
  PRODUCTION_TENANT_ID,
  classifySkipReason,
  deterministicTargetId,
  indexLogicalId,
  normalizePackageTenantId,
  resolveLiveTenantId,
  resolveMappedId,
  storageKeyFromAttachmentData,
  promoteStorageKeyForLiveTenant,
  type IdMapIndex,
} from "./industrial-import-helpers.js";

function emptyIndex(): IdMapIndex {
  return { bySourceId: new Map(), byCollectionAndSourceId: new Map() };
}

describe("industrial-import-helpers", () => {
  it("remaps package twin tenant to live production tenant", () => {
    expect(resolveLiveTenantId(PACKAGE_TENANT_ID)).toBe(PRODUCTION_TENANT_ID);
    expect(resolveLiveTenantId(PRODUCTION_TENANT_ID)).toBe(PRODUCTION_TENANT_ID);
    expect(normalizePackageTenantId(PACKAGE_TENANT_ID, PRODUCTION_TENANT_ID)).toBe(
      PRODUCTION_TENANT_ID,
    );
    expect(normalizePackageTenantId(null, PRODUCTION_TENANT_ID)).toBeNull();
    expect(
      normalizePackageTenantId("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", PRODUCTION_TENANT_ID),
    ).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  });

  it("resolves QR parent and EHS logical template IDs via id-map index", () => {
    const index = emptyIndex();
    index.bySourceId.set("001vRoN4Z2DkvjqlobDO", "32a32c76-d310-2293-e76f-660135cce547");
    index.byCollectionAndSourceId.set(
      "qr_links::001vRoN4Z2DkvjqlobDO",
      "32a32c76-d310-2293-e76f-660135cce547",
    );
    indexLogicalId(
      index,
      "platform_ehs_audit_templates",
      "forge_tmpl_ehs_annual_34",
      "18d383cc-56d2-934e-c27e-781c3b82772c",
    );

    expect(resolveMappedId(index, "001vRoN4Z2DkvjqlobDO", ["qr_links"])).toBe(
      "32a32c76-d310-2293-e76f-660135cce547",
    );
    expect(
      resolveMappedId(index, "forge_tmpl_ehs_annual_34", ["platform_ehs_audit_templates"]),
    ).toBe("18d383cc-56d2-934e-c27e-781c3b82772c");
    expect(resolveMappedId(index, "missing-parent", ["qr_links"])).toBeUndefined();
  });

  it("derives storage keys from Firebase download URLs", () => {
    const key = storageKeyFromAttachmentData(
      {
        fileUrl:
          "https://firebasestorage.googleapis.com/v0/b/bucket/o/certificates%2Fbusiness-1%2Flogo.png?alt=media",
      },
      "11111111-2222-4333-8444-555555555555",
    );
    expect(key).toBe("certificates/business-1/logo.png");
  });

  it("promotes Firebase-relative storage keys to live tenant prefix", () => {
    expect(
      promoteStorageKeyForLiveTenant(
        "module-attachments/business-1782553339499/loto/procedures/x.pdf",
        PRODUCTION_TENANT_ID,
      ),
    ).toBe(
      `tenants/${PRODUCTION_TENANT_ID}/module-attachments/${PRODUCTION_TENANT_ID}/loto/procedures/x.pdf`,
    );
    expect(
      promoteStorageKeyForLiveTenant(
        `tenants/${PRODUCTION_TENANT_ID}/already/promoted.pdf`,
        PRODUCTION_TENANT_ID,
      ),
    ).toBe(`tenants/${PRODUCTION_TENANT_ID}/already/promoted.pdf`);
  });

  it("classifies missing parent FK as explained skip", () => {
    expect(classifySkipReason("missing_required_fk:qr_link_id")).toBe("SKIP_MISSING_PARENT");
    expect(classifySkipReason("missing_tenant")).toBe("SKIP_NON_PRODUCERS");
  });

  it("builds deterministic UUIDs for embedded equipment document ids", () => {
    const a = deterministicTargetId("equipmentDocuments", "doc-096f1869a44d89a85e31");
    const b = deterministicTargetId("equipmentDocuments", "doc-096f1869a44d89a85e31");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
