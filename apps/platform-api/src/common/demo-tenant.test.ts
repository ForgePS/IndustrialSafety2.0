import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  assertDemoAllowsDotExternal,
  clearDemoTenantCache,
  isDemoTenant,
  requestsExternalDotSync,
} from "./demo-tenant.js";

describe("demo tenant DOT external guards", () => {
  it("detects external sync flags", () => {
    expect(requestsExternalDotSync({ title: "Local edit" })).toBe(false);
    expect(requestsExternalDotSync({ fmcsaSubmit: true })).toBe(true);
    expect(requestsExternalDotSync({ externalSync: "true" })).toBe(true);
    expect(requestsExternalDotSync(null)).toBe(false);
  });

  it("isDemoTenant returns false for empty tenant id without querying", async () => {
    const db = { select: vi.fn() };
    expect(await isDemoTenant(db as never, null)).toBe(false);
    expect(await isDemoTenant(db as never, "  ")).toBe(false);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("isDemoTenant caches demo flag lookups", async () => {
    clearDemoTenantCache();
    const where = vi.fn(async () => [{ isDemoTenant: true }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: where,
          })),
        })),
      })),
    };
    const tenantId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    expect(await isDemoTenant(db as never, tenantId)).toBe(true);
    expect(await isDemoTenant(db as never, tenantId)).toBe(true);
    expect(where).toHaveBeenCalledTimes(1);
    clearDemoTenantCache(tenantId);
  });

  it("assertDemoAllowsDotExternal blocks external sync for demo tenants", async () => {
    clearDemoTenantCache();
    const where = vi.fn(async () => [{ isDemoTenant: true }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: where,
          })),
        })),
      })),
    };
    const tenantId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await expect(
      assertDemoAllowsDotExternal(db as never, tenantId, { fmcsaSubmit: true }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringMatching(/demo tenants/i),
    });
    // Local edits without external flags remain allowed.
    await expect(
      assertDemoAllowsDotExternal(db as never, tenantId, { title: "Local edit" }),
    ).resolves.toBeUndefined();
    clearDemoTenantCache(tenantId);
  });

  it("assertDemoAllowsDotExternal allows non-demo tenants", async () => {
    clearDemoTenantCache();
    const where = vi.fn(async () => [{ isDemoTenant: false }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: where,
          })),
        })),
      })),
    };
    await expect(
      assertDemoAllowsDotExternal(db as never, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
        fmcsaSubmit: true,
      }),
    ).resolves.toBeUndefined();
    clearDemoTenantCache();
  });
});

describe("demo / SMS_DRY_RUN outbound containment hooks", () => {
  afterEach(() => {
    clearDemoTenantCache();
  });

  beforeEach(() => {
    clearDemoTenantCache();
  });

  it("SMS_DRY_RUN env forces dryRun when tenant settings omit dryRun", async () => {
    const { resolveEmergencyAlertSmsConfig } = await import(
      "../modules/industrial/sms/resolve-sms-provider.js"
    );
    const config = resolveEmergencyAlertSmsConfig(
      {
        AWS_REGION: "us-east-1",
        SMS_ORIGINATION_IDENTITY: "+15550001111",
        SMS_DRY_RUN: "true",
        SMS_DEFAULT_PROVIDER: "AWS",
      },
      {
        smsProvider: "AWS",
        smsEnabled: true,
        settingsJson: { originationIdentity: "+15550001111" },
      },
    );
    expect(config.dryRun).toBe(true);
  });

  it("assertTenantAllowedForDemoSeed rejects customer tenant keys", async () => {
    const { assertTenantAllowedForDemoSeed } = await import("./demo-tenant.js");
    clearDemoTenantCache();
    const where = vi.fn(async () => [{ tenantKey: "producers-rice-mill", slug: "producers-rice-mill" }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: where,
          })),
        })),
      })),
    };
    await expect(
      assertTenantAllowedForDemoSeed(db as never, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringMatching(/forge-platform/i),
    });
  });

  it("assertTenantAllowedForDemoSeed allows forge-platform", async () => {
    const { assertTenantAllowedForDemoSeed } = await import("./demo-tenant.js");
    clearDemoTenantCache();
    const where = vi.fn(async () => [{ tenantKey: "forge-platform", slug: "forge-platform" }]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: where,
          })),
        })),
      })),
    };
    await expect(
      assertTenantAllowedForDemoSeed(db as never, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ).resolves.toEqual({ tenantKey: "forge-platform", slug: "forge-platform" });
  });
});
