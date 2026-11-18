import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal } from "@forge/tenant-context";
import { TenantsService } from "./tenants.service.js";

function principal(): ForgePrincipal {
  return {
    authenticationIdentityId: "aid",
    userId: "11111111-1111-4111-8111-111111111111",
    personId: null,
    tenantId: "22222222-2222-4222-8222-222222222222",
    organizationIds: [],
    permissions: new Set([
      "platform.tenant.create",
      "platform.tenant.update",
      "platform.tenant.suspend",
    ]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };
}

function createMocks(
  initialStatus = "PROVISIONING",
  options?: { openOnboardingSession?: boolean },
) {
  const outboxTypes: string[] = [];
  const auditActions: string[] = [];
  let inserted: Record<string, unknown> | null = null;
  let current = {
    id: "33333333-3333-4333-8333-333333333333",
    status: initialStatus,
    tenantKey: "acme-fire",
    slug: "acme-fire",
    legalName: "Acme Fire Dept",
    displayName: "Acme Fire",
    suspensionReason: null as string | null,
    recordVersion: 1,
  };

  const tx = {
    execute: vi.fn(async () => undefined),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        inserted = values;
        current = { ...current, ...values } as typeof current;
      }),
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
      tenants: {
        findFirst: vi.fn(async () => ({ ...current })),
        findMany: vi.fn(async () => [{ ...current }]),
      },
      customerOnboardingSessions: {
        findFirst: vi.fn(async () =>
          options?.openOnboardingSession
            ? { id: "sess-1", status: "IN_PROGRESS", tenantId: current.id }
            : null,
        ),
      },
    },
  };

  const db = {
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    query: {
      tenants: {
        findFirst: vi.fn(async () => ({ ...current })),
        findMany: vi.fn(async () => [current]),
      },
    },
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
    service: new TenantsService(db as never, outbox as never, audit as never),
    outboxTypes,
    auditActions,
    getInserted: () => inserted,
    getCurrent: () => current,
  };
}

describe("TenantsService lifecycle", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks("PROVISIONING");
  });

  it("creates tenant in PROVISIONING and writes audit + outbox", async () => {
    const row = await mocks.service.create(
      {
        tenantKey: "acme-fire",
        slug: "acme-fire",
        legalName: "Acme Fire Dept",
        displayName: "Acme Fire",
      },
      principal(),
    );

    expect(mocks.getInserted()?.status).toBe("PROVISIONING");
    expect(mocks.outboxTypes).toContain(DOMAIN_EVENT_TYPES.TENANT_CREATED);
    expect(mocks.auditActions).toContain("tenant.create");
    expect(row.status).toBe("PROVISIONING");
  });

  it("lists tenants via bypass RLS transaction", async () => {
    const rows = await mocks.service.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tenantKey).toBe("acme-fire");
  });

  it("reads tenant by id", async () => {
    const row = await mocks.service.getById("33333333-3333-4333-8333-333333333333");
    expect(row.tenantKey).toBe("acme-fire");
  });

  it("updates tenant display fields", async () => {
    mocks = createMocks("ACTIVE");
    const row = await mocks.service.patch(
      "33333333-3333-4333-8333-333333333333",
      { displayName: "Acme Fire Updated" },
      principal(),
      "*",
    );
    expect(row.displayName).toBe("Acme Fire Updated");
    expect(mocks.auditActions).toContain("tenant.update");
  });

  it("activates from PROVISIONING to ACTIVE", async () => {
    const row = await mocks.service.activate(
      "33333333-3333-4333-8333-333333333333",
      principal(),
      "*",
    );
    expect(row.status).toBe("ACTIVE");
    expect(mocks.outboxTypes).toContain(DOMAIN_EVENT_TYPES.TENANT_ACTIVATED);
    expect(mocks.auditActions).toContain("tenant.activate");
  });

  it("blocks direct activate while onboarding session is IN_PROGRESS", async () => {
    mocks = createMocks("PROVISIONING", { openOnboardingSession: true });
    await expect(
      mocks.service.activate("33333333-3333-4333-8333-333333333333", principal(), "*"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows activate from onboarding even with IN_PROGRESS session", async () => {
    mocks = createMocks("PROVISIONING", { openOnboardingSession: true });
    const row = await mocks.service.activate(
      "33333333-3333-4333-8333-333333333333",
      principal(),
      "*",
      { fromOnboarding: true },
    );
    expect(row.status).toBe("ACTIVE");
  });

  it("starts trial from PROVISIONING", async () => {
    const row = await mocks.service.startTrial(
      "33333333-3333-4333-8333-333333333333",
      principal(),
      "*",
    );
    expect(row.status).toBe("TRIAL");
    expect(mocks.outboxTypes).toContain(DOMAIN_EVENT_TYPES.TENANT_STATUS_CHANGED);
  });

  it("rejects invalid tenant status transitions", async () => {
    mocks = createMocks("ARCHIVED");
    await expect(
      mocks.service.activate("33333333-3333-4333-8333-333333333333", principal(), "*"),
    ).rejects.toBeInstanceOf(ForgeError);
    await expect(
      mocks.service.activate("33333333-3333-4333-8333-333333333333", principal(), "*"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("suspend sets SUSPENDED with reason", async () => {
    mocks = createMocks("ACTIVE");
    const row = await mocks.service.suspend(
      "33333333-3333-4333-8333-333333333333",
      { reason: "Non-payment" },
      principal(),
      "*",
    );
    expect(row.status).toBe("SUSPENDED");
    expect(row.suspensionReason).toBe("Non-payment");
    expect(mocks.outboxTypes).toContain(DOMAIN_EVENT_TYPES.TENANT_SUSPENDED);
    expect(mocks.auditActions).toContain("tenant.suspend");
  });

  it("cancels an active tenant", async () => {
    mocks = createMocks("ACTIVE");
    const row = await mocks.service.cancel(
      "33333333-3333-4333-8333-333333333333",
      principal(),
      "*",
    );
    expect(row.status).toBe("CANCELED");
    expect(mocks.auditActions).toContain("tenant.cancel");
  });
});
