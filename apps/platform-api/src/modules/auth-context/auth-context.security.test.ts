import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgeError } from "@forge/errors";
import { AuthGuard } from "./auth.guard.js";
import { AuthContextService } from "./auth-context.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

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

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IDENTITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let txMock: {
  query: {
    users: { findFirst: ReturnType<typeof vi.fn> };
    tenants: { findFirst: ReturnType<typeof vi.fn> };
    organizationMemberships: { findMany: ReturnType<typeof vi.fn> };
    userTenantMemberships: { findFirst: ReturnType<typeof vi.fn> };
    userTenantAccess: { findFirst: ReturnType<typeof vi.fn> };
    userRoleAssignments: { findMany: ReturnType<typeof vi.fn> };
    membershipRoleAssignments: { findMany: ReturnType<typeof vi.fn> };
    rolePermissions: { findMany: ReturnType<typeof vi.fn> };
    permissions: { findMany: ReturnType<typeof vi.fn> };
    roles: { findMany: ReturnType<typeof vi.fn> };
    membershipProductAccess: { findMany: ReturnType<typeof vi.fn> };
    membershipModuleAccess: { findMany: ReturnType<typeof vi.fn> };
    tenantProducts: { findMany: ReturnType<typeof vi.fn> };
    tenantModuleEntitlements: { findMany: ReturnType<typeof vi.fn> };
    platformProducts: { findMany: ReturnType<typeof vi.fn> };
    platformModules: { findMany: ReturnType<typeof vi.fn> };
  };
};

function createService(overrides?: {
  userStatus?: string;
  sessionsRevokedAt?: Date | null;
  tenantStatus?: string;
  appEnv?: string;
}) {
  const userStatus = overrides?.userStatus ?? "ACTIVE";
  const sessionsRevokedAt = overrides?.sessionsRevokedAt ?? null;
  const tenantStatus = overrides?.tenantStatus ?? "ACTIVE";
  const appEnv = overrides?.appEnv ?? "production";

  txMock = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
        where: vi.fn(async () => []),
      })),
    })),
    query: {
      users: {
        findFirst: vi.fn(async () => ({
          id: USER_ID,
          tenantId: TENANT_ID,
          personId: null,
          status: userStatus,
          sessionsRevokedAt,
          sessionVersion: 1,
          primaryEmail: "user@example.com",
        })),
      },
      tenants: {
        findFirst: vi.fn(async () => ({
          id: TENANT_ID,
          status: tenantStatus,
        })),
      },
      organizationMemberships: { findMany: vi.fn(async () => []) },
      userTenantMemberships: {
        findFirst: vi.fn(async () => ({
          id: "membership-1",
          userId: USER_ID,
          tenantId: TENANT_ID,
          status: "ACTIVE",
        })),
      },
      userTenantAccess: { findFirst: vi.fn(async () => null) },
      userRoleAssignments: { findMany: vi.fn(async () => []) },
      membershipRoleAssignments: { findMany: vi.fn(async () => []) },
      rolePermissions: { findMany: vi.fn(async () => []) },
      permissions: { findMany: vi.fn(async () => []) },
      roles: { findMany: vi.fn(async () => []) },
      membershipProductAccess: { findMany: vi.fn(async () => []) },
      membershipModuleAccess: { findMany: vi.fn(async () => []) },
      tenantProducts: { findMany: vi.fn(async () => []) },
      tenantModuleEntitlements: { findMany: vi.fn(async () => []) },
      platformProducts: { findMany: vi.fn(async () => []) },
      platformModules: { findMany: vi.fn(async () => []) },
    },
  } as never;

  // loadPermissions uses select().from() — provide a minimal chain.
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
        where: vi.fn(async () => []),
      })),
    })),
    query: txMock.query,
  };

  const env = {
    APP_ENV: appEnv,
    AWS_REGION: "us-east-1",
    COGNITO_USER_POOL_ID: "us-east-1_example",
    COGNITO_CLIENT_ID: "client-a",
  } as never;

  const cognito = { enabled: false, globalSignOut: vi.fn() };
  return new AuthContextService(db as never, env, cognito as never, {
    writeInTransaction: vi.fn(async () => "audit-1"),
  } as never);
}

function request(headers: Record<string, string | undefined>, params: Record<string, string> = {}) {
  return {
    header: (name: string) => {
      const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
      return key ? headers[key] : undefined;
    },
    params,
    correlationId: "corr-1",
    requestId: "req-1",
  } as never;
}

describe("AuthContextService session security", () => {
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
      tenantId: TENANT_ID,
      userStatus: "ACTIVE",
      sessionsRevokedAt: null,
    });
  });

  it("rejects missing bearer token in production", async () => {
    const service = createService();
    await expect(service.resolvePrincipal(request({}))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects missing bearer in hosted development without FORGE_ALLOW_DEV_PRINCIPAL", async () => {
    const prev = process.env.FORGE_ALLOW_DEV_PRINCIPAL;
    delete process.env.FORGE_ALLOW_DEV_PRINCIPAL;
    try {
      const service = createService({ appEnv: "development" });
      // Forged / present x-forge-dev-principal must not authenticate on hosted development.
      await expect(
        service.resolvePrincipal(
          request({
            "x-forge-dev-principal": JSON.stringify({ userId: USER_ID, tenantId: TENANT_ID }),
          }),
        ),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Authorization Bearer token required",
      });
      // Missing bearer with no headers fail-closes the same way (RG-03 / RG-04).
      await expect(service.resolvePrincipal(request({}))).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "Authorization Bearer token required",
      });
    } finally {
      if (prev === undefined) delete process.env.FORGE_ALLOW_DEV_PRINCIPAL;
      else process.env.FORGE_ALLOW_DEV_PRINCIPAL = prev;
    }
  });

  it("accepts x-forge-dev-principal in local APP_ENV", async () => {
    const service = createService({ appEnv: "local" });
    const principal = await service.resolvePrincipal(
      request({
        "x-forge-dev-principal": JSON.stringify({ userId: USER_ID, tenantId: TENANT_ID }),
      }),
    );
    expect(principal.userId).toBe(USER_ID);
    expect(principal.tenantId).toBe(TENANT_ID);
  });

  it("rejects invalid or expired access tokens", async () => {
    verifyCognitoAccessToken.mockRejectedValue(new Error("jwt expired"));
    const service = createService();
    await expect(
      service.resolvePrincipal(request({ authorization: "Bearer bad.token.value" })),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects disabled user accounts", async () => {
    lookupIdentity.mockResolvedValue({
      identityId: IDENTITY_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
      userStatus: "DISABLED",
      sessionsRevokedAt: null,
    });
    const service = createService({ userStatus: "DISABLED" });
    await expect(
      service.resolvePrincipal(request({ authorization: "Bearer good.token" })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects revoked sessions older than sessionsRevokedAt", async () => {
    const revokedAt = new Date();
    verifyCognitoAccessToken.mockResolvedValue({
      sub: "cognito-sub-1",
      iat: Math.floor(revokedAt.getTime() / 1000) - 60,
      token_use: "access",
      client_id: "client-a",
    });
    lookupIdentity.mockResolvedValue({
      identityId: IDENTITY_ID,
      userId: USER_ID,
      tenantId: TENANT_ID,
      userStatus: "ACTIVE",
      sessionsRevokedAt: revokedAt,
    });
    const service = createService({ sessionsRevokedAt: revokedAt });
    await expect(
      service.resolvePrincipal(request({ authorization: "Bearer good.token" })),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows TRIAL tenants for session context", async () => {
    const service = createService({ tenantStatus: "TRIAL" });
    // Permission loading uses select chains; ensure membership path succeeds.
    const principal = await service.resolvePrincipal(
      request({ authorization: "Bearer good.token", "x-tenant-id": TENANT_ID }),
    );
    expect(principal.userId).toBe(USER_ID);
    expect(principal.tenantId).toBe(TENANT_ID);
    expect(principal.authenticationIdentityId).toBe(IDENTITY_ID);
  });

  it("rejects CANCELED tenants for session context", async () => {
    const service = createService({ tenantStatus: "CANCELED" });
    await expect(
      service.resolvePrincipal(
        request({ authorization: "Bearer good.token", "x-tenant-id": TENANT_ID }),
      ),
    ).rejects.toMatchObject({ code: "TENANT_INACTIVE" });
  });
});

describe("AuthGuard", () => {
  it("rejects protected routes when authentication fails", async () => {
    const authContext = {
      resolvePrincipal: vi.fn(async () => {
        throw new ForgeError("UNAUTHORIZED", "Authentication required");
      }),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    };
    const guard = new AuthGuard(authContext as never, reflector as never);

    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as never),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("allows public routes without resolving a principal", async () => {
    const authContext = {
      resolvePrincipal: vi.fn(),
    };
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => key === IS_PUBLIC_KEY),
    };
    const guard = new AuthGuard(authContext as never, reflector as never);
    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as never),
    ).resolves.toBe(true);
    expect(authContext.resolvePrincipal).not.toHaveBeenCalled();
  });
});
