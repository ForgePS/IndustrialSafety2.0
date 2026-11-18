import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { FacilitiesService } from "./facilities.service.js";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FACILITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function principal(tenantId = TENANT_A): ForgePrincipal {
  return {
    authenticationIdentityId: "aid",
    userId: "11111111-1111-4111-8111-111111111111",
    personId: null,
    tenantId,
    organizationIds: [],
    permissions: new Set(["tenant.facilities.read", "tenant.facilities.manage"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };
}

function createMocks(facilityTenantId = TENANT_A) {
  let current = {
    id: FACILITY_ID,
    tenantId: facilityTenantId,
    facilityKey: "plant-1",
    name: "Plant 1",
    facilityType: "SITE",
    status: "ACTIVE",
    organizationId: null as string | null,
    recordVersion: 1,
  };
  let inserted: Record<string, unknown> | null = null;

  const tx = {
    execute: vi.fn(async () => undefined),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          inserted = values;
          current = { ...current, ...values } as typeof current;
          return [current];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            current = { ...current, ...values } as typeof current;
            return [current];
          }),
        })),
      })),
    })),
    query: {
      facilities: {
        findFirst: vi.fn(async () => ({ ...current })),
        findMany: vi.fn(async () => [current]),
      },
      organizations: {
        findFirst: vi.fn(async () => null),
      },
    },
  };

  const db = {
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };

  const outbox = { write: vi.fn(async () => "outbox-1") };
  const audit = { writeInTransaction: vi.fn(async () => "audit-1") };

  return {
    service: new FacilitiesService(db as never, outbox as never, audit as never),
    getInserted: () => inserted,
    getCurrent: () => current,
  };
}

describe("FacilitiesService tenant isolation", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks(TENANT_A);
  });

  it("creates a facility owned by the tenant", async () => {
    const row = await mocks.service.create(
      TENANT_A,
      { facilityKey: "plant-1", name: "Plant 1" },
      principal(),
    );
    expect(row.tenantId).toBe(TENANT_A);
    expect(mocks.getInserted()?.tenantId).toBe(TENANT_A);
  });

  it("returns facility when it belongs to the tenant", async () => {
    const row = await mocks.service.get(TENANT_A, FACILITY_ID);
    expect(row.id).toBe(FACILITY_ID);
  });

  it("rejects cross-tenant facility access", async () => {
    mocks = createMocks(TENANT_B);
    await expect(mocks.service.get(TENANT_A, FACILITY_ID)).rejects.toBeInstanceOf(ForgeError);
    await expect(mocks.service.get(TENANT_A, FACILITY_ID)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
