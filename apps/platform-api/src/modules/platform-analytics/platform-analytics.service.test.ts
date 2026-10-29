import { describe, expect, it, vi } from "vitest";
import { PlatformAnalyticsService } from "./platform-analytics.service.js";

function thenableResult(result: unknown) {
  return {
    then(resolve: (v: unknown) => unknown) {
      return Promise.resolve(result).then(resolve);
    },
  };
}

function queryChain(result: unknown) {
  const api: Record<string, unknown> = {};
  const self = new Proxy(api, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (!(prop in target)) {
        Reflect.set(
          target,
          prop,
          vi.fn(() => self),
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  return self;
}

describe("PlatformAnalyticsService (MK-S20)", () => {
  it("builds privacy-safe overview aggregates", async () => {
    let call = 0;
    const tx = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => {
        call += 1;
        switch (call) {
          case 1:
            return queryChain([
              { status: "ACTIVE", value: 2 },
              { status: "TRIAL", value: 1 },
            ]);
          case 2:
            return queryChain([
              { status: "ACTIVE", value: 5 },
              { status: "SUSPENDED", value: 1 },
            ]);
          case 3:
            return queryChain([{ value: 3 }]);
          case 4:
            return queryChain([{ value: 4 }]);
          case 5:
            return queryChain([{ moduleCode: "LOTO", moduleName: "LOTO", tenantCount: 2 }]);
          case 6:
            return queryChain([{ status: "IN_PROGRESS", value: 1 }]);
          case 7:
            return queryChain([{ status: "TRIAL", value: 2 }]);
          case 8:
            return queryChain([
              {
                occurredAt: new Date("2026-08-11T07:00:00.000Z"),
                action: "tenant.create",
                resourceType: "tenant",
                result: "SUCCESS",
                tenantKey: "acme",
              },
            ]);
          default:
            return queryChain([]);
        }
      }),
    };

    const db = {
      transaction: async (cb: (inner: typeof tx) => Promise<unknown>) => cb(tx),
    };

    const service = new PlatformAnalyticsService(db as never);
    const overview = await service.overview();
    expect(overview.tenants.active).toBe(2);
    expect(overview.tenants.trial).toBe(1);
    expect(overview.users.activeMemberships).toBe(5);
    expect(overview.modules.adoption[0]?.moduleCode).toBe("LOTO");
    expect(overview.recentActivity[0]?.tenantKey).toBe("acme");
    expect(JSON.stringify(overview)).not.toMatch(/@|password|email/i);
    expect(tx.execute).toHaveBeenCalled();
    void thenableResult(null);
  });
});
