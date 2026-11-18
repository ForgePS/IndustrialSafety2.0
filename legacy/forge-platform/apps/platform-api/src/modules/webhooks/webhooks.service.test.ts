import { describe, expect, it, vi, beforeEach } from "vitest";
import { redactSensitive, signWebhookPayload, verifyWebhookSignature } from "@forge/security";

const withTenantTransaction = vi.fn();

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    createId: () => "22222222-2222-4222-8222-222222222222",
    withTenantTransaction: (...args: unknown[]) => withTenantTransaction(...args),
  };
});

import { WebhooksService } from "./webhooks.service.js";

const principal = {
  userId: "user-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
} as never;

describe("WebhooksService (MK-S15)", () => {
  let service: WebhooksService;
  let endpoint: Record<string, unknown> | null;
  let delivery: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    endpoint = null;
    delivery = null;
    service = new WebhooksService(
      {} as never,
      {
        writeInTransaction: vi.fn(async () => "audit-1"),
      } as never,
    );
    service.setHttpPosterForTests(async ({ body, signatureHeader }) => {
      const ok = verifyWebhookSignature(body, signatureHeader, String(endpoint?.signingSecret));
      return { ok, status: ok ? 200 : 401, bodyPreview: ok ? "ok" : "bad sig" };
    });

    withTenantTransaction.mockImplementation(async (_db, _tid, fn) =>
      fn({
        insert: (_table: { name?: string } | unknown) => ({
          values: (v: Record<string, unknown>) => ({
            returning: async () => {
              if ("signingSecret" in v || "endpointUrl" in v) {
                endpoint = v;
                return [v];
              }
              delivery = { ...v, attemptCount: 0 };
              return [v];
            },
            then: undefined,
          }),
          // drizzle insert without returning used for deliveries
        }),
        query: {
          tenantWebhookEndpoints: {
            findMany: async () => (endpoint ? [endpoint] : []),
            findFirst: async () => endpoint,
          },
          tenantWebhookDeliveries: {
            findMany: async () => (delivery ? [delivery] : []),
            findFirst: async () => delivery,
          },
        },
        update: () => ({
          set: (patch: Record<string, unknown>) => ({
            where: () => ({
              returning: async () => {
                if (endpoint && ("enabled" in patch || "signingSecret" in patch)) {
                  endpoint = { ...endpoint, ...patch };
                  return [endpoint];
                }
                delivery = { ...(delivery ?? {}), ...patch };
                return [delivery];
              },
            }),
          }),
        }),
      }),
    );

    // Handle insert().values() without returning (delivery create path)
    withTenantTransaction.mockImplementation(async (_db, _tid, fn) => {
      const tx = {
        insert: () => ({
          values: async (v: Record<string, unknown>) => {
            if ("signingSecret" in v || ("endpointUrl" in v && "eventTypesJson" in v)) {
              endpoint = v;
              return;
            }
            delivery = { ...v, attemptCount: 0 };
          },
          returningChain: null as null | (() => Promise<unknown[]>),
        }),
        query: {
          tenantWebhookEndpoints: {
            findMany: async () => (endpoint ? [endpoint] : []),
            findFirst: async () => endpoint,
          },
          tenantWebhookDeliveries: {
            findMany: async () => (delivery ? [delivery] : []),
            findFirst: async () => delivery,
          },
        },
        update: () => ({
          set: (patch: Record<string, unknown>) => ({
            where: () => ({
              returning: async () => {
                if (
                  endpoint &&
                  ("enabled" in patch || "name" in patch || "signingSecret" in patch)
                ) {
                  endpoint = { ...endpoint, ...patch };
                  return [endpoint];
                }
                delivery = { ...(delivery ?? {}), ...patch };
                return [delivery];
              },
            }),
          }),
        }),
      };

      // Fix insert to support both .values().returning() and awaitable values for create delivery
      (tx as { insert: () => unknown }).insert = () => ({
        values: (v: Record<string, unknown>) => {
          const isEndpoint = "signingSecret" in v || ("endpointUrl" in v && "eventTypesJson" in v);
          if (isEndpoint) endpoint = v;
          else delivery = { ...v, attemptCount: v.attemptCount ?? 0 };

          return {
            returning: async () => [v],
            then: (resolve: (value: unknown) => void) => resolve(undefined),
          };
        },
      });

      return fn(tx);
    });
  });

  it("signs deliveries and records attempt history", async () => {
    const created = await service.createEndpoint(
      "tenant-1",
      {
        name: "Ops",
        endpointUrl: "https://example.com/hooks",
        eventTypes: ["membership.changed"],
      },
      principal,
    );
    expect(created.signingSecret?.startsWith("whsec_")).toBe(true);
    expect(redactSensitive({ signingSecret: created.signingSecret }).signingSecret).toBe(
      "[REDACTED]",
    );

    const listed = await service.listEndpoints("tenant-1");
    expect(listed[0]).not.toHaveProperty("signingSecret");

    const deliveryResult = await service.createDelivery(
      "tenant-1",
      String(created.id),
      { eventType: "membership.changed", payload: { ok: true } },
      principal,
    );
    expect(deliveryResult.status).toBe("SUCCEEDED");
    expect(deliveryResult.attemptCount).toBe(1);
    expect(deliveryResult.durationMs).toBeTypeOf("number");
  });

  it("refuses deliver/replay when endpoint disabled", async () => {
    const created = await service.createEndpoint(
      "tenant-1",
      {
        name: "Ops",
        endpointUrl: "https://example.com/hooks",
        eventTypes: ["*"],
      },
      principal,
    );
    await service.patchEndpoint("tenant-1", String(created.id), { enabled: false }, principal);

    await expect(
      service.createDelivery(
        "tenant-1",
        String(created.id),
        { eventType: "x", payload: {} },
        principal,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("denies cross-tenant manage", async () => {
    await expect(
      service.createEndpoint(
        "other",
        {
          name: "Ops",
          endpointUrl: "https://example.com/hooks",
          eventTypes: ["a"],
        },
        principal,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("verifyWebhookSignature matches signWebhookPayload", () => {
    const body = JSON.stringify({ a: 1 });
    const secret = "whsec_test";
    const sig = signWebhookPayload(body, secret);
    expect(verifyWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyWebhookSignature(body, "sha256=dead", secret)).toBe(false);
  });
});
