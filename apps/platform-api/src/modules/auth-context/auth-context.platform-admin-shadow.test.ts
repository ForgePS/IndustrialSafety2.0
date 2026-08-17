import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthContextService } from "./auth-context.service.js";

const verifyCognitoAccessToken = vi.fn();
const lookupIdentity = vi.fn();

vi.mock("@forge/auth", () => ({
  verifyCognitoAccessToken: (...args: unknown[]) => verifyCognitoAccessToken(...args),
}));

vi.mock("@forge/database", async () => {
  const actual = await vi.importActual<typeof import("@forge/database")>("@forge/database");
  return {
    ...actual,
    lookupIdentity: (...args: unknown[]) => lookupIdentity(...args),
    lookupUserTenants: vi.fn(async () => []),
    withTenantTransaction: async (
      _db: unknown,
      _tenantId: string,
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(txMock),
  };
});

const HOME_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // platform home (Forge Platform)
const CUSTOMER_TENANT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // Producers
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDENTITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let txMock: never;

function createService() {
  txMock = {
    query: {
      users: {
        findFirst: vi.fn(async () => ({
          id: USER_ID,
          tenantId: HOME_TENANT,
          personId: null,
          status: "ACTIVE",
          sessionsRevokedAt: null,
          sessionVersion: 1,
          primaryEmail: "admin@forgepublicsafety.com",
        })),
      },
      tenants: {
        findFirst: vi.fn(async () => ({ id: CUSTOMER_TENANT, status: "ACTIVE" })),
      },
      organizationMemberships: { findMany: vi.fn(async () => []) },
    },
  } as never;

  const db = { query: (txMock as never as { query: unknown }).query } as never;

  const env = {
    APP_ENV: "production",
    AWS_REGION: "us-east-1",
    COGNITO_USER_POOL_ID: "us-east-1_example",
    COGNITO_CLIENT_ID: "client-a",
  } as never;

  const cognito = { enabled: false, globalSignOut: vi.fn() };
  return new AuthContextService(db, env, cognito as never, {
    writeInTransaction: vi.fn(async () => "audit-1"),
  } as never);
}

function request(headers: Record<string, string | undefined>) {
  return {
    header: (name: string) => {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : undefined;
    },
    params: {},
    correlationId: "corr-1",
    requestId: "req-1",
  } as never;
}

describe("AuthContextService platform-admin membership shadowing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyCognitoAccessToken.mockResolvedValue({
      sub: "cognito-sub-1",
      iat: Math.floor(Date.now() / 1000),
      token_use: "access",
      client_id: "client-a",
    });
    lookupIdentity.mockResolvedValue({
      identityId: IDENTITY_ID,
      userId: USER_ID,
      tenantId: HOME_TENANT,
      userStatus: "ACTIVE",
      sessionsRevokedAt: null,
    });
  });

  it("keeps platform-admin authority when a customer-tenant membership exists", async () => {
    const service = createService();

    // Membership in the CUSTOMER tenant with a non-super role. This is exactly
    // the state that previously stripped PLATFORM_SUPER_ADMIN.
    vi.spyOn(
      service as unknown as { resolveTenantAccess: () => unknown },
      "resolveTenantAccess",
    ).mockResolvedValue({
      tenantId: CUSTOMER_TENANT,
      status: "ACTIVE",
      membershipId: "membership-customer",
    } as never);

    // Home tenant carries PLATFORM_SUPER_ADMIN; customer tenant carries only a
    // scoped industrial role. Authority must be read from the home tenant.
    vi.spyOn(
      service as unknown as { loadPermissions: (tenantId: string) => unknown },
      "loadPermissions",
    ).mockImplementation(async (tenantId: string) => {
      if (tenantId === HOME_TENANT) {
        return {
          roleCodes: new Set(["PLATFORM_SUPER_ADMIN"]),
          permissionCodes: new Set(["platform.tenant.read", "platform.person.read"]),
        };
      }
      return {
        roleCodes: new Set(["IND3V_INDUSTRIAL_ADMIN"]),
        permissionCodes: new Set(["industrial.loto.view"]),
      };
    });

    vi.spyOn(
      service as unknown as { loadEntitlements: () => unknown },
      "loadEntitlements",
    ).mockResolvedValue({ products: new Set<string>(), modules: new Set<string>() } as never);

    const principal = await service.resolvePrincipal(
      request({ authorization: "Bearer good.token", "x-tenant-id": CUSTOMER_TENANT }),
    );

    expect(principal.isPlatformAdmin).toBe(true);
    expect([...principal.permissions]).toContain("platform.tenant.read");
    // Super admins keep authoritative home permissions, not the customer role's.
    expect([...principal.permissions]).not.toContain("industrial.loto.view");
  });
});
