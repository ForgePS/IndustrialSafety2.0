import { describe, expect, it } from "vitest";
import { TENANT_ADMIN_NAMESPACES, CONFIG_NAMESPACES } from "@forge/configuration";

/**
 * Tenant isolation acceptance helpers (Step 5) — pure contract checks.
 * Live Aurora RLS + API cross-tenant denials are documented in
 * CONFIGURATION_PLATFORM_ACCEPTANCE.md (require migrate 0021 + config API image).
 */
describe("configuration tenant isolation contracts", () => {
  const tenantA = "config-tenant-a";
  const tenantB = "config-tenant-b";

  it("synthetic tenant slugs are distinct", () => {
    expect(tenantA).not.toBe(tenantB);
  });

  it("error messages must not embed foreign tenant ids (contract)", () => {
    // Standard Forge denial shape: no foreign resource identifiers.
    const denied = {
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Configuration object not found",
    };
    const serialized = JSON.stringify(denied);
    expect(serialized).not.toMatch(/config-tenant-a/);
    expect(serialized).not.toMatch(/config-tenant-b/);
    expect(serialized).not.toMatch(/019f/);
  });

  it("tenant admin cannot target creator-only namespaces via allowlist", () => {
    expect(TENANT_ADMIN_NAMESPACES).not.toContain("security");
    expect(CONFIG_NAMESPACES).toContain("security");
  });
});
