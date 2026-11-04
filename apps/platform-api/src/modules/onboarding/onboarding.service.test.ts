import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ForgePrincipal } from "@forge/tenant-context";
import { OnboardingService } from "./onboarding.service.js";

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const ORG_ID = "55555555-5555-4555-8555-555555555555";

function principal(): ForgePrincipal {
  return {
    authenticationIdentityId: "aid",
    userId: "11111111-1111-4111-8111-111111111111",
    personId: null,
    tenantId: TENANT_ID,
    organizationIds: [],
    permissions: new Set(["platform.onboarding.manage"]),
    activeProducts: new Set(),
    activeModules: new Set(),
    correlationId: "corr-1",
    requestId: "req-1",
    authProvider: "COGNITO",
    isPlatformAdmin: true,
  };
}

function completedSteps(keys: string[]) {
  return keys.map((stepKey, index) => ({
    id: `step-${index}`,
    tenantId: TENANT_ID,
    sessionId: SESSION_ID,
    stepNumber: index + 1,
    stepKey,
    status: stepKey === "ACTIVATE_TENANT" ? "PENDING" : "COMPLETED",
    payloadJson: {},
    validationErrorsJson: [],
  }));
}

function createHarness(options?: {
  facilities?: Array<{ id: string; facilityKey: string }>;
  failProductCheck?: boolean;
  stepKeys?: string[];
  pendingStepKeys?: string[];
  sessionData?: Record<string, unknown>;
  entitlements?: Record<string, unknown>;
}) {
  const facilities = [...(options?.facilities ?? [])];
  let insertedFacility: Record<string, unknown> | null = null;
  const session = {
    id: SESSION_ID,
    tenantId: TENANT_ID,
    customerType: "INDUSTRIAL",
    templateCode: "INDUSTRIAL_STARTER",
    status: "IN_PROGRESS",
    currentStep: 11,
    recordVersion: 1,
    sessionDataJson: {
      primaryOrganizationId: ORG_ID,
      invitationId: "inv-1",
      securityConfigured: true,
      brandingConfigured: true,
      subscriptionWaived: true,
      ...options?.sessionData,
    },
    activationErrorsJson: [],
  };

  const pending = new Set(options?.pendingStepKeys ?? []);
  const steps = completedSteps(
    options?.stepKeys ?? [
      "CREATE_TENANT",
      "SELECT_CUSTOMER_TYPE",
      "CREATE_PRIMARY_ORGANIZATION",
      "SELECT_PRODUCTS",
      "SELECT_MODULES",
      "CONFIGURE_SUBSCRIPTION",
      "CONFIGURE_BRANDING",
      "CREATE_PRIMARY_ADMINISTRATOR",
      "SEND_INVITATION",
      "REVIEW_CONFIGURATION",
      "ACTIVATE_TENANT",
    ],
  ).map((step) => (pending.has(step.stepKey) ? { ...step, status: "PENDING" } : step));

  const tx = {
    execute: vi.fn(async () => undefined),
    insert: vi.fn(() => ({
      values: vi.fn(async (values: Record<string, unknown>) => {
        if (values.facilityKey) {
          insertedFacility = values;
          facilities.push({
            id: String(values.id),
            facilityKey: String(values.facilityKey),
          });
        }
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        // Awaitable directly, or via .returning() for the session row.
        where: vi.fn(() => {
          const result = Promise.resolve(undefined);
          return Object.assign(result, {
            returning: vi.fn(async () => [
              { ...session, recordVersion: session.recordVersion + 1 },
            ]),
          });
        }),
      })),
    })),
    query: {
      customerOnboardingSessions: {
        findFirst: vi.fn(async () => ({ ...session })),
      },
      customerOnboardingSteps: {
        findMany: vi.fn(async () => steps.map((s) => ({ ...s }))),
      },
      facilities: {
        findFirst: vi.fn(async () => facilities[0] ?? null),
      },
      organizations: {
        findFirst: vi.fn(async () => ({ id: ORG_ID, tenantId: TENANT_ID })),
      },
      tenantProducts: {
        findMany: vi.fn(async () =>
          options?.failProductCheck ? [] : [{ id: "tp-1", status: "ACTIVE" }],
        ),
      },
      subscriptions: {
        findFirst: vi.fn(async () => null),
      },
      userInvitations: {
        findFirst: vi.fn(async () => ({
          id: "inv-1",
          tenantId: TENANT_ID,
          status: "SENT",
        })),
      },
      tenantSettings: {
        findFirst: vi.fn(async () => ({ id: "set-1" })),
      },
      tenantBranding: {
        findFirst: vi.fn(async () => ({ id: "brand-1" })),
      },
    },
  };

  const db = {
    transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };

  const tenants = {
    activate: vi.fn(async () => ({ id: TENANT_ID, status: "ACTIVE", recordVersion: 2 })),
    getById: vi.fn(async () => ({
      id: TENANT_ID,
      status: "PROVISIONING",
      recordVersion: 1,
    })),
    list: vi.fn(async () => [{ id: TENANT_ID }]),
    create: vi.fn(),
  };

  const audit = {
    writeInTransaction: vi.fn(async () => "audit-1"),
  };
  const outbox = {
    write: vi.fn(async () => "outbox-1"),
  };

  const service = new OnboardingService(
    db as never,
    tenants as never,
    {} as never,
    (options?.entitlements ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    outbox as never,
    audit as never,
  );

  return {
    service,
    tenants,
    audit,
    getInsertedFacility: () => insertedFacility,
    setFacilities: (rows: Array<{ id: string; facilityKey: string }>) => {
      facilities.splice(0, facilities.length, ...rows);
    },
  };
}

describe("OnboardingService MK-S7", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it("ensureDefaultFacility creates Primary Facility when catalog empty", async () => {
    const result = await harness.service.ensureDefaultFacility(TENANT_ID, principal(), {
      primaryOrganizationId: ORG_ID,
    });
    expect(result.created).toBe(true);
    expect(harness.getInsertedFacility()?.facilityKey).toBe("default");
    expect(harness.getInsertedFacility()?.name).toBe("Primary Facility");
    expect(harness.audit.writeInTransaction).toHaveBeenCalled();
  });

  it("ensureDefaultFacility reuses existing facility", async () => {
    harness = createHarness({
      facilities: [{ id: "fac-1", facilityKey: "plant-a" }],
    });
    const result = await harness.service.ensureDefaultFacility(TENANT_ID, principal(), {});
    expect(result).toEqual({ id: "fac-1", created: false });
    expect(harness.getInsertedFacility()).toBeNull();
  });

  it("activate does not call tenants.activate when checks fail", async () => {
    harness = createHarness({ failProductCheck: true });
    await expect(
      harness.service.activate(SESSION_ID, principal(), "*", TENANT_ID),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(harness.tenants.activate).not.toHaveBeenCalled();
  });

  it("listTemplates includes resolved onboarding steps", () => {
    const templates = harness.service.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    expect(templates[0]?.onboarding.steps.at(-1)?.key).toBe("ACTIVATE_TENANT");
  });

  it("SELECT_MODULES assigns shared module codes to the selected product", async () => {
    const putModule = vi.fn(async () => ({}));
    harness = createHarness({
      pendingStepKeys: ["SELECT_MODULES", "CONFIGURE_SUBSCRIPTION", "ACTIVATE_TENANT"],
      sessionData: { productCodes: ["FORGE_INDUSTRIAL"] },
      entitlements: { putModule },
    });

    await harness.service.completeStep(
      SESSION_ID,
      "SELECT_MODULES",
      { moduleCodes: ["CORE", "PERSONNEL", "TRAINING", "LOCKOUT_TAGOUT"] },
      principal(),
      "*",
      TENANT_ID,
    );

    expect(putModule).toHaveBeenCalledTimes(4);
    for (const call of putModule.mock.calls as unknown as Array<
      [string, string, { productCode?: string }]
    >) {
      expect(call[0]).toBe(TENANT_ID);
      expect(call[2].productCode).toBe("FORGE_INDUSTRIAL");
    }
    expect(putModule.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      "CORE",
      "PERSONNEL",
      "TRAINING",
      "LOCKOUT_TAGOUT",
    ]);
  });
});
