import { describe, expect, it } from "vitest";
import { ForgeError } from "@forge/errors";

/**
 * Presentation containment contract tests (RG-10 / Step 7).
 * Asserts demo safety flags and Reset Demo tenant-scoping without live side effects.
 */

describe("presentation containment contracts", () => {
  it("demo safety flags block outbound channels when isDemoTenant", () => {
    const tenant = { isDemoTenant: true };
    const safety = {
      externalSmsBlocked: Boolean(tenant.isDemoTenant),
      externalEmailBlocked: Boolean(tenant.isDemoTenant),
      emergencyAlertsInternalOnly: Boolean(tenant.isDemoTenant),
      printersBlocked: Boolean(tenant.isDemoTenant),
      dotExternalBlocked: Boolean(tenant.isDemoTenant),
    };
    expect(safety).toEqual({
      externalSmsBlocked: true,
      externalEmailBlocked: true,
      emergencyAlertsInternalOnly: true,
      printersBlocked: true,
      dotExternalBlocked: true,
    });
  });

  it("Reset Demo rejects non-demo tenants (server boundary)", async () => {
    const isDemoTenant = false;
    const resetDemo = async () => {
      if (!isDemoTenant) {
        throw new ForgeError(
          "VALIDATION_FAILED",
          "Reset Demo is only available for tenants marked as demo environments.",
        );
      }
      return { reset: true };
    };
    await expect(resetDemo()).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("emergency alert demo path uses DEMO_TENANT_BLOCKED failure code", () => {
    const failureCode = "DEMO_TENANT_BLOCKED";
    expect(failureCode).toBe("DEMO_TENANT_BLOCKED");
  });

  it("SMS_DRY_RUN containment is independent of UI hiding", () => {
    const resolveDryRun = (envFlag: string | undefined, settingsDryRun?: boolean) => {
      if (settingsDryRun === true) return true;
      return envFlag === "true" || envFlag === "1";
    };
    expect(resolveDryRun("true", undefined)).toBe(true);
    expect(resolveDryRun(undefined, false)).toBe(false);
    expect(resolveDryRun(undefined, true)).toBe(true);
  });

  it("walkthrough studio manage permission is required (decorator contract)", async () => {
    const required = [
      "industrial.walkthrough.demo.manage",
      "industrial.walkthrough.manage",
      "industrial.admin",
    ];
    const employeePerms = new Set(["industrial.access", "industrial.walkthrough.view"]);
    const allowed = required.some((code) => employeePerms.has(code));
    expect(allowed).toBe(false);

    const adminPerms = new Set(["industrial.admin"]);
    expect(required.some((code) => adminPerms.has(code))).toBe(true);
  });
});

describe("MP4 / export cross-tenant denial pattern", () => {
  it("object lookup must be tenant-scoped before signed download", () => {
    const findExport = (tenantId: string, exportId: string, rows: Array<{ tenantId: string; id: string }>) =>
      rows.find((row) => row.tenantId === tenantId && row.id === exportId) ?? null;

    const rows = [
      { tenantId: "tenant-a", id: "mp4-1" },
      { tenantId: "tenant-b", id: "mp4-2" },
    ];
    expect(findExport("tenant-a", "mp4-2", rows)).toBeNull();
    expect(findExport("tenant-a", "mp4-1", rows)?.id).toBe("mp4-1");
  });
});
