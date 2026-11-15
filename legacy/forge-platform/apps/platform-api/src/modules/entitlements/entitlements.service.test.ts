import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { EntitlementsService } from "./entitlements.service.js";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MODULE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CORE_MODULE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

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

function createMocks() {
  const outboxTypes: string[] = [];
  const auditActions: string[] = [];
  let productRow: Record<string, unknown> | null = null;
  const entitlementsByModuleId = new Map<string, Record<string, unknown>>();
  let lastResolvedModuleId = MODULE_ID;

  const moduleRecord = {
    id: MODULE_ID,
    productId: PRODUCT_ID,
    code: "PERSONNEL",
    name: "Personnel",
    isCore: false,
    customerAssignable: true,
    classification: "CUSTOMER_MODULE",
    implementationStatus: "READY",
  };

  const coreRecord = {
    id: CORE_MODULE_ID,
    productId: PRODUCT_ID,
    code: "CORE",
    name: "Industrial Core",
    isCore: true,
    customerAssignable: false,
    classification: "PLATFORM_CORE",
    implementationStatus: "READY",
  };

  const tx = {
    execute: vi.fn(async () => undefined),
    insert: vi.fn(() => ({
      values: vi.fn((values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          if (values.productId && !values.moduleId) {
            productRow = { id: "tp-1", status: "ACTIVE", ...values };
            return [productRow];
          }
          const row = { id: `tm-${String(values.moduleId)}`, ...values };
          entitlementsByModuleId.set(String(values.moduleId), row);
          return [row];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (productRow && "status" in values && !("sourceType" in values)) {
              productRow = { ...productRow, ...values };
              return [productRow];
            }
            const existing = entitlementsByModuleId.get(lastResolvedModuleId);
            const row = {
              ...(existing ?? { id: "tm-upd", moduleId: lastResolvedModuleId }),
              ...values,
            };
            entitlementsByModuleId.set(lastResolvedModuleId, row);
            return [row];
          }),
        })),
      })),
    })),
    query: {
      platformProducts: {
        findFirst: vi.fn(async () => ({
          id: PRODUCT_ID,
          code: "FORGE_INDUSTRIAL",
          name: "Forge Industrial Safety",
        })),
      },
      platformModules: {
        findFirst: vi.fn(async () => {
          // Default for putModule PERSONNEL; ensureCoreModule also calls findFirst.
          // Alternate: if product just enabled and looking for core first calls.
          return moduleRecord;
        }),
        findMany: vi.fn(async () => [moduleRecord, coreRecord]),
      },
      tenantProducts: {
        findFirst: vi.fn(async () => productRow),
      },
      tenantModuleEntitlements: {
        findFirst: vi.fn(async () => entitlementsByModuleId.get(lastResolvedModuleId) ?? null),
      },
    },
  };

  let resolveMode: "core" | "personnel" = "core";
  tx.query.platformModules.findFirst = vi.fn(async () => {
    if (resolveMode === "core") {
      lastResolvedModuleId = CORE_MODULE_ID;
      return coreRecord;
    }
    lastResolvedModuleId = MODULE_ID;
    return moduleRecord;
  });

  const db = {
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const outbox = {
    write: vi.fn(async (_t: unknown, input: { eventType: string }) => {
      outboxTypes.push(input.eventType);
      return "outbox-1";
    }),
  };
  const audit = {
    writeInTransaction: vi.fn(async (_t: unknown, input: { action: string }) => {
      auditActions.push(input.action);
      return "audit-1";
    }),
  };

  return {
    service: new EntitlementsService(db as never, outbox as never, audit as never),
    outboxTypes,
    auditActions,
    resolvePersonnel() {
      resolveMode = "personnel";
    },
  };
}

describe("EntitlementsService assignments", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  it("assigns a product to a tenant", async () => {
    const row = await mocks.service.putProduct(
      TENANT_ID,
      "FORGE_INDUSTRIAL",
      { status: "ACTIVE" },
      principal(),
    );
    expect(row.tenantId).toBe(TENANT_ID);
    expect(row.productId).toBe(PRODUCT_ID);
    expect(row.status).toBe("ACTIVE");
    expect(mocks.outboxTypes).toContain(DOMAIN_EVENT_TYPES.ENTITLEMENT_CHANGED);
    expect(mocks.auditActions).toContain("entitlement.product.put");
  });

  it("assigns a module entitlement to a tenant with productCode", async () => {
    await mocks.service.putProduct(
      TENANT_ID,
      "FORGE_INDUSTRIAL",
      { status: "ACTIVE" },
      principal(),
    );
    mocks.resolvePersonnel();
    const row = await mocks.service.putModule(
      TENANT_ID,
      "PERSONNEL",
      { status: "ACTIVE", productCode: "FORGE_INDUSTRIAL" },
      principal(),
    );
    expect(row.tenantId).toBe(TENANT_ID);
    expect(row.moduleId).toBe(MODULE_ID);
    expect(row.status).toBe("ACTIVE");
    expect(mocks.outboxTypes).toContain(DOMAIN_EVENT_TYPES.ENTITLEMENT_CHANGED);
  });

  it("rejects enabling a module when the product is not active", async () => {
    await expect(
      mocks.service.putModule(
        TENANT_ID,
        "PERSONNEL",
        { status: "ACTIVE", productCode: "FORGE_INDUSTRIAL" },
        principal(),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("must be active"),
    });
  });
});
