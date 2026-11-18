import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgePrincipal } from "@forge/tenant-context";
import { BillingService, verifyBillingWebhookSignature } from "./billing.service.js";

const TENANT_ID = "22222222-2222-4222-8222-222222222222";

function principal(): ForgePrincipal {
  return {
    authenticationIdentityId: "aid",
    userId: "11111111-1111-4111-8111-111111111111",
    personId: null,
    tenantId: TENANT_ID,
    organizationIds: [],
    permissions: new Set(["platform.entitlement.manage"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };
}

describe("verifyBillingWebhookSignature", () => {
  it("accepts valid hmac and rejects invalid", () => {
    const body = JSON.stringify({ eventId: "evt_1", eventType: "x" });
    const secret = "forge-billing-stub-secret";
    const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(verifyBillingWebhookSignature(body, `sha256=${sig}`, secret)).toBe(true);
    expect(verifyBillingWebhookSignature(body, "sha256=deadbeef", secret)).toBe(false);
    expect(verifyBillingWebhookSignature(body, undefined, secret)).toBe(false);
  });
});

describe("BillingService webhook entitlement invariant", () => {
  let entitlements: {
    putProduct: ReturnType<typeof vi.fn>;
    putModule: ReturnType<typeof vi.fn>;
  };
  let subscriptions: { list: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  let service: BillingService;
  let events: Array<Record<string, unknown>>;

  beforeEach(() => {
    events = [];
    entitlements = {
      putProduct: vi.fn(async () => ({ id: "tp-1" })),
      putModule: vi.fn(async () => ({ id: "tm-1" })),
    };
    subscriptions = {
      list: vi.fn(async () => []),
      patch: vi.fn(async () => ({ id: "sub-1" })),
    };
    const tx = {
      execute: vi.fn(async () => undefined),
      insert: vi.fn(() => ({
        values: vi.fn((values: Record<string, unknown>) => ({
          returning: vi.fn(async () => {
            events.push(values);
            return [{ id: values.id ?? "evt-row", ...values }];
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      query: {
        billingCustomers: { findFirst: vi.fn(async () => null) },
        billingProviderEvents: {
          findFirst: vi.fn(async () => null),
        },
      },
    };
    const db = {
      transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const outbox = { write: vi.fn(async () => "outbox-1") };
    const audit = { writeInTransaction: vi.fn(async () => "audit-1") };
    service = new BillingService(
      db as never,
      outbox as never,
      audit as never,
      entitlements as never,
      subscriptions as never,
    );
  });

  it("documents entitlement invariant", () => {
    expect(service.entitlementInvariant().toLowerCase()).toContain("not write");
  });

  it("rejects invalid webhook signature", async () => {
    await expect(
      service.ingestProviderEvent({
        provider: "STUB",
        rawBody: "{}",
        signatureHeader: "sha256=nope",
        secret: "forge-billing-stub-secret",
        body: {
          eventId: "evt_1",
          eventType: "entitlement.sync_requested",
          tenantId: TENANT_ID,
          payload: { productCode: "FORGE_INDUSTRIAL" },
        },
        principal: principal(),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(entitlements.putProduct).not.toHaveBeenCalled();
  });

  it("syncs entitlements only via EntitlementsService", async () => {
    const body = {
      eventId: "evt_2",
      eventType: "entitlement.sync_requested",
      tenantId: TENANT_ID,
      payload: { productCode: "FORGE_INDUSTRIAL", moduleCode: "LOTO" },
    };
    const rawBody = JSON.stringify(body);
    const secret = "forge-billing-stub-secret";
    const sig = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    const result = await service.ingestProviderEvent({
      provider: "STUB",
      rawBody,
      signatureHeader: `sha256=${sig}`,
      secret,
      body,
      principal: principal(),
    });

    expect(result.duplicate).toBe(false);
    expect(result.applied).toBe(true);
    expect(entitlements.putProduct).toHaveBeenCalledWith(
      TENANT_ID,
      "FORGE_INDUSTRIAL",
      expect.anything(),
      expect.anything(),
    );
    expect(entitlements.putModule).toHaveBeenCalledWith(
      TENANT_ID,
      "LOTO",
      expect.objectContaining({ sourceType: "SUBSCRIPTION" }),
      expect.anything(),
    );
  });

  it("treats duplicate external event id as idempotent", async () => {
    const body = {
      eventId: "evt_dup",
      eventType: "subscription.updated",
      tenantId: TENANT_ID,
      payload: { status: "ACTIVE" },
    };
    const rawBody = JSON.stringify(body);
    const secret = "forge-billing-stub-secret";
    const sig = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

    // First call inserts; second findFirst returns existing
    const existing = { id: "existing", status: "PROCESSED", externalEventId: "evt_dup" };
    let calls = 0;
    const tx = {
      execute: vi.fn(async () => undefined),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [{ id: "new", status: "RECEIVED" }]),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
      query: {
        billingProviderEvents: {
          findFirst: vi.fn(async () => {
            calls += 1;
            return calls > 1 ? existing : null;
          }),
        },
      },
    };
    const db = {
      transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    service = new BillingService(
      db as never,
      { write: vi.fn() } as never,
      { writeInTransaction: vi.fn() } as never,
      entitlements as never,
      subscriptions as never,
    );

    await service.ingestProviderEvent({
      provider: "STUB",
      rawBody,
      signatureHeader: `sha256=${sig}`,
      secret,
      body,
      principal: principal(),
    });
    const second = await service.ingestProviderEvent({
      provider: "STUB",
      rawBody,
      signatureHeader: `sha256=${sig}`,
      secret,
      body,
      principal: principal(),
    });
    expect(second.duplicate).toBe(true);
    expect(second.applied).toBe(false);
  });

  it("throws ForgeError on bad webhook parse without entitlements", async () => {
    const rawBody = "{}";
    const secret = "forge-billing-stub-secret";
    const sig = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    await expect(
      service.ingestProviderEvent({
        provider: "STUB",
        rawBody,
        signatureHeader: `sha256=${sig}`,
        secret,
        body: { eventId: "x" },
        principal: principal(),
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(entitlements.putModule).not.toHaveBeenCalled();
  });
});
