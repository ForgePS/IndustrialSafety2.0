/**
 * FIS-SEC Step 3 — data-driven industrial authorization matrix (synthetic tenants only).
 *
 * Exercises real PermissionGuard + evaluateAuthorization (not mocked).
 * Auth denials reuse AuthGuard + AuthContextService with Cognito/DB providers mocked.
 */
import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller, Get, Post, Req } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { ForgePrincipal } from "@forge/tenant-context";
import { ForgeError } from "@forge/errors";
import { AuthGuard } from "../auth-context/auth.guard.js";
import { AuthContextService } from "../auth-context/auth-context.service.js";
import { AuthorizationDecisionService } from "../auth-context/authorization-decision.service.js";
import { PermissionGuard } from "../auth-context/permission.guard.js";
import { Principal } from "../auth-context/principal.decorator.js";
import {
  RequireAnyPermission,
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMeta,
} from "../auth-context/require-permission.decorator.js";
import { TenantGuard } from "../auth-context/tenant.guard.js";

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

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "11111111-1111-4111-8111-111111111111";
const OBJECT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OBJECT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const IDENTITY_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const ENTITLEMENT = { productCode: "FORGE_INDUSTRIAL" as const };

const WALKTHROUGH_VIEW = [
  "industrial.walkthrough.view",
  "industrial.walkthrough.manage",
  "industrial.presentation.executive.view",
  "industrial.admin",
  "industrial.access",
] as const;

const WALKTHROUGH_GENERATE = [
  "industrial.walkthrough.videos.generate",
  "industrial.presentation.executive.export",
  "industrial.walkthrough.manage",
  "industrial.admin",
] as const;

const FLAT_ACCESS = ["industrial.access", "industrial.admin", "field.access"] as const;

const REPORTING_RUN = [
  "industrial.reporting.run",
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
  "industrial.access",
] as const;

/** Matches reporting.controller MANAGE — no broad industrial.access fallback. */
const REPORTING_MANAGE = [
  "industrial.reporting.manage",
  "industrial.reporting.admin",
  "industrial.admin",
] as const;

const ROLE_PERMS: Record<string, string[]> = {
  "tenant-admin": [
    "industrial.admin",
    "industrial.access",
    "industrial.walkthrough.manage",
    "industrial.walkthrough.view",
    "industrial.walkthrough.videos.generate",
    "industrial.presentation.executive.manage",
    "industrial.presentation.executive.view",
    "industrial.presentation.executive.export",
    "industrial.reporting.run",
    "industrial.reporting.manage",
    "industrial.reporting.view",
  ],
  "ehs-admin": [
    "industrial.access",
    "industrial.walkthrough.manage",
    "industrial.walkthrough.view",
    "industrial.walkthrough.videos.generate",
    "industrial.reporting.run",
    "industrial.reporting.view",
  ],
  supervisor: [
    "industrial.access",
    "industrial.walkthrough.view",
    "industrial.reporting.view",
    "industrial.reporting.run",
  ],
  employee: ["industrial.access", "industrial.walkthrough.view"],
  "read-only": ["industrial.access", "industrial.walkthrough.view", "industrial.reporting.view"],
};

type RoleName = keyof typeof ROLE_PERMS;

let txMock: {
  query: Record<string, { findFirst?: ReturnType<typeof vi.fn>; findMany?: ReturnType<typeof vi.fn> }>;
};

function principalFor(role: RoleName, tenantId: string): ForgePrincipal {
  return {
    authenticationIdentityId: `synth-auth-${role}`,
    userId: USER_A,
    personId: null,
    tenantId,
    organizationIds: [],
    permissions: new Set(ROLE_PERMS[role]),
    activeProducts: new Set(["FORGE_INDUSTRIAL"]),
    activeModules: new Set(),
    correlationId: "corr-matrix-1",
    requestId: "req-matrix-1",
    authProvider: "COGNITO",
    isPlatformAdmin: false,
  };
}

function operationalActive() {
  return {
    tenantStatus: "ACTIVE",
    subscriptionStatus: "ACTIVE",
    canAuthenticate: true,
    canUseProducts: true,
    canManageBilling: true,
    reasonCode: null,
  };
}

@Controller("api/v1/industrial/matrix-fixture")
class IndustrialAuthzMatrixFixtureController {
  @Get("walkthrough-studio")
  @RequireAnyPermission([...WALKTHROUGH_VIEW], { requiresEntitlement: ENTITLEMENT })
  walkthroughStudioList(@Principal() principal: ForgePrincipal) {
    return { ok: true, family: "walkthrough-studio", tenantId: principal.tenantId };
  }

  @Post("walkthrough-studio/exports")
  @RequireAnyPermission([...WALKTHROUGH_GENERATE], { requiresEntitlement: ENTITLEMENT })
  walkthroughStudioExport(@Principal() principal: ForgePrincipal) {
    return { ok: true, family: "walkthrough-studio-export", tenantId: principal.tenantId };
  }

  @Get("flat/personnel")
  @RequireAnyPermission([...FLAT_ACCESS], { requiresEntitlement: ENTITLEMENT })
  flatPersonnel(@Principal() principal: ForgePrincipal) {
    return { ok: true, family: "industrial-flat", tenantId: principal.tenantId };
  }

  @Get("flat/objects/:objectId")
  @RequireAnyPermission([...FLAT_ACCESS], { requiresEntitlement: ENTITLEMENT })
  flatObject(
    @Principal() principal: ForgePrincipal,
    @Req() req: { params?: { objectId?: string; tenantId?: string } },
  ) {
    const objectId = req.params?.objectId;
    // Object-level tenant ownership — deny with NOT_FOUND (no foreign metadata).
    if (objectId === OBJECT_B && principal.tenantId === TENANT_A) {
      throw new ForgeError("NOT_FOUND", "Resource not found");
    }
    if (objectId === OBJECT_A && principal.tenantId === TENANT_B) {
      throw new ForgeError("NOT_FOUND", "Resource not found");
    }
    return { ok: true, family: "object", objectId, tenantId: principal.tenantId };
  }

  @Post("reporting/reports/:key/run")
  @RequireAnyPermission([...REPORTING_RUN], { requiresEntitlement: ENTITLEMENT })
  reportingRun(@Principal() principal: ForgePrincipal) {
    return { ok: true, family: "reporting-run", tenantId: principal.tenantId };
  }

  @Post("reporting/reports")
  @RequireAnyPermission([...REPORTING_MANAGE], { requiresEntitlement: ENTITLEMENT })
  reportingManage(@Principal() principal: ForgePrincipal) {
    return { ok: true, family: "reporting-manage", tenantId: principal.tenantId };
  }

  @Get("tenants/:tenantId/summary")
  @RequireAnyPermission([...FLAT_ACCESS], { requiresEntitlement: ENTITLEMENT })
  tenantScoped(@Principal() principal: ForgePrincipal) {
    return { ok: true, family: "tenant-scoped", tenantId: principal.tenantId };
  }
}

type MatrixCase = {
  id: string;
  family: string;
  role: RoleName;
  principalTenant: string;
  routeTenantId?: string;
  handler: keyof IndustrialAuthzMatrixFixtureController;
  params?: Record<string, string>;
  expect: "allow" | "forbidden" | "not_found";
};

const MATRIX: MatrixCase[] = [
  {
    id: "WT-OK-admin",
    family: "walkthrough-studio",
    role: "tenant-admin",
    principalTenant: TENANT_A,
    handler: "walkthroughStudioList",
    expect: "allow",
  },
  {
    id: "WT-OK-employee-view",
    family: "walkthrough-studio",
    role: "employee",
    principalTenant: TENANT_A,
    handler: "walkthroughStudioList",
    expect: "allow",
  },
  {
    id: "WT-DENY-employee-export",
    family: "walkthrough-studio-export",
    role: "employee",
    principalTenant: TENANT_A,
    handler: "walkthroughStudioExport",
    expect: "forbidden",
  },
  {
    id: "WT-DENY-readonly-export",
    family: "walkthrough-studio-export",
    role: "read-only",
    principalTenant: TENANT_A,
    handler: "walkthroughStudioExport",
    expect: "forbidden",
  },
  {
    id: "WT-OK-ehs-export",
    family: "walkthrough-studio-export",
    role: "ehs-admin",
    principalTenant: TENANT_A,
    handler: "walkthroughStudioExport",
    expect: "allow",
  },
  {
    id: "FLAT-OK-supervisor",
    family: "industrial-flat",
    role: "supervisor",
    principalTenant: TENANT_A,
    handler: "flatPersonnel",
    expect: "allow",
  },
  {
    id: "HDR-DENY-wrong-tenant",
    family: "tenant-header",
    role: "tenant-admin",
    principalTenant: TENANT_A,
    routeTenantId: TENANT_B,
    handler: "tenantScoped",
    params: { tenantId: TENANT_B },
    expect: "forbidden",
  },
  {
    id: "OBJ-DENY-cross-tenant",
    family: "object-idor",
    role: "tenant-admin",
    principalTenant: TENANT_A,
    handler: "flatObject",
    params: { objectId: OBJECT_B },
    expect: "not_found",
  },
  {
    id: "OBJ-OK-same-tenant",
    family: "object-idor",
    role: "supervisor",
    principalTenant: TENANT_A,
    handler: "flatObject",
    params: { objectId: OBJECT_A },
    expect: "allow",
  },
  {
    id: "RPT-OK-supervisor-run",
    family: "reporting",
    role: "supervisor",
    principalTenant: TENANT_A,
    handler: "reportingRun",
    expect: "allow",
  },
  {
    id: "RPT-DENY-readonly-manage",
    family: "reporting",
    role: "read-only",
    principalTenant: TENANT_A,
    handler: "reportingManage",
    expect: "forbidden",
  },
];

function executionContextFor(input: {
  handler: (...args: never[]) => unknown;
  controller: object;
  principal: ForgePrincipal | undefined;
  params?: Record<string, string>;
}) {
  const request = {
    principal: input.principal,
    params: input.params ?? {},
  };
  return {
    getHandler: () => input.handler,
    getClass: () => input.controller.constructor,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

function createAuthService(overrides?: {
  appEnv?: string;
  sessionsRevokedAt?: Date | null;
}) {
  const sessionsRevokedAt = overrides?.sessionsRevokedAt ?? null;
  txMock = {
    query: {
      users: {
        findFirst: vi.fn(async () => ({
          id: USER_A,
          tenantId: TENANT_A,
          personId: null,
          status: "ACTIVE",
          sessionsRevokedAt,
          sessionVersion: 1,
          primaryEmail: "user@example.com",
        })),
      },
      tenants: {
        findFirst: vi.fn(async () => ({
          id: TENANT_A,
          status: "ACTIVE",
        })),
      },
      organizationMemberships: { findMany: vi.fn(async () => []) },
      userTenantMemberships: {
        findFirst: vi.fn(async () => ({
          id: "membership-1",
          userId: USER_A,
          tenantId: TENANT_A,
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
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where: vi.fn(async () => []) })),
        where: vi.fn(async () => []),
      })),
    })),
    query: txMock.query,
  };

  const env = {
    APP_ENV: overrides?.appEnv ?? "production",
    AWS_REGION: "us-east-1",
    COGNITO_USER_POOL_ID: "us-east-1_example",
    COGNITO_CLIENT_ID: "client-a",
  } as never;

  return new AuthContextService(db as never, env, { enabled: false } as never, {
    writeInTransaction: vi.fn(async () => "audit-1"),
  } as never);
}

function httpRequest(headers: Record<string, string | undefined>) {
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

describe("Industrial authz HTTP matrix (FIS-SEC Step 3)", () => {
  const getTenantOperationalState = vi.fn(async () => operationalActive());
  const recordDenial = vi.fn(async () => undefined);

  let permissionGuard: PermissionGuard;
  let tenantGuard: TenantGuard;
  let reflector: Reflector;
  let fixture: IndustrialAuthzMatrixFixtureController;

  beforeEach(() => {
    vi.clearAllMocks();
    getTenantOperationalState.mockResolvedValue(operationalActive());
    reflector = new Reflector();
    permissionGuard = new PermissionGuard(
      reflector,
      { getTenantOperationalState } as never,
      { recordDenial } as never,
    );
    tenantGuard = new TenantGuard(reflector);
    fixture = new IndustrialAuthzMatrixFixtureController();
  });

  it.each(MATRIX)("$id ($family / $role → $expect)", async (row) => {
    const handler = fixture[row.handler] as (...args: never[]) => unknown;
    const principal = principalFor(row.role, row.principalTenant);
    const params = {
      ...(row.params ?? {}),
      ...(row.routeTenantId ? { tenantId: row.routeTenantId } : {}),
    };
    const ctx = executionContextFor({
      handler,
      controller: fixture,
      principal,
      params,
    });

    if (row.expect === "forbidden" && row.routeTenantId && row.routeTenantId !== row.principalTenant) {
      expect(() => tenantGuard.canActivate(ctx as never)).toThrow(ForgeError);
      try {
        tenantGuard.canActivate(ctx as never);
      } catch (err) {
        expect(err).toMatchObject({ code: "FORBIDDEN" });
        expect(JSON.stringify(err)).not.toMatch(/permission|email|membership/i);
      }
      return;
    }

    expect(tenantGuard.canActivate(ctx as never)).toBe(true);

    if (row.expect === "allow") {
      await expect(permissionGuard.canActivate(ctx as never)).resolves.toBe(true);
      if (row.handler === "flatObject") {
        const result = fixture.flatObject(principal, { params });
        expect(result).toMatchObject({ ok: true, objectId: params.objectId });
        expect(JSON.stringify(result)).not.toContain(TENANT_B);
      }
      return;
    }

    if (row.expect === "forbidden") {
      await expect(permissionGuard.canActivate(ctx as never)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(recordDenial).toHaveBeenCalled();
      return;
    }

    await expect(permissionGuard.canActivate(ctx as never)).resolves.toBe(true);
    expect(() => fixture.flatObject(principal, { params })).toThrow(ForgeError);
    try {
      fixture.flatObject(principal, { params });
    } catch (err) {
      expect(err).toMatchObject({ code: "NOT_FOUND", message: "Resource not found" });
      expect(JSON.stringify(err)).not.toContain(TENANT_B);
      expect(JSON.stringify(err)).not.toMatch(/owner|createdBy|permissions/i);
    }
  });

  it("PermissionGuard runs evaluateAuthorization (not short-circuited)", async () => {
    const spyMeta: RequirePermissionMeta = {
      anyOf: [...WALKTHROUGH_GENERATE],
      requiresEntitlement: ENTITLEMENT,
    };
    const getAllAndOverride = vi
      .spyOn(reflector, "getAllAndOverride")
      .mockImplementation((key: string) => {
        if (key === REQUIRE_PERMISSION_KEY) return spyMeta;
        return false;
      });

    const ctx = executionContextFor({
      handler: fixture.walkthroughStudioExport.bind(fixture),
      controller: fixture,
      principal: principalFor("employee", TENANT_A),
    });
    await expect(permissionGuard.canActivate(ctx as never)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(getTenantOperationalState).toHaveBeenCalled();
    getAllAndOverride.mockRestore();
  });
});

describe("Industrial authz matrix — anonymous / bearer / forged principal denials", () => {
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
      userId: USER_A,
      tenantId: TENANT_A,
      userStatus: "ACTIVE",
      sessionsRevokedAt: null,
    });
  });

  const denialCases: Array<{
    id: string;
    headers: Record<string, string | undefined>;
    appEnv: string;
    setup?: () => void;
  }> = [
    { id: "ANON", headers: {}, appEnv: "production" },
    {
      id: "MALFORMED_BEARER",
      headers: { authorization: "Bearer not-a-jwt" },
      appEnv: "production",
      setup: () => verifyCognitoAccessToken.mockRejectedValue(new Error("invalid token")),
    },
    {
      id: "EXPIRED",
      headers: { authorization: "Bearer expired.token.value" },
      appEnv: "production",
      setup: () => verifyCognitoAccessToken.mockRejectedValue(new Error("jwt expired")),
    },
    {
      id: "FORGED_DEV_PRINCIPAL",
      headers: {
        "x-forge-dev-principal": JSON.stringify({ userId: USER_A, tenantId: TENANT_A }),
      },
      appEnv: "development",
    },
    {
      id: "REVOKED_SESSION",
      headers: { authorization: "Bearer good.token" },
      appEnv: "production",
      setup: () => {
        const revokedAt = new Date();
        verifyCognitoAccessToken.mockResolvedValue({
          sub: "cognito-sub-1",
          iat: Math.floor(revokedAt.getTime() / 1000) - 60,
          token_use: "access",
          client_id: "client-a",
        });
        lookupIdentity.mockResolvedValue({
          identityId: IDENTITY_ID,
          userId: USER_A,
          tenantId: TENANT_A,
          userStatus: "ACTIVE",
          sessionsRevokedAt: revokedAt,
        });
      },
    },
  ];

  it.each(denialCases)("$id is rejected by AuthGuard + resolvePrincipal", async (row) => {
    const prev = process.env.FORGE_ALLOW_DEV_PRINCIPAL;
    delete process.env.FORGE_ALLOW_DEV_PRINCIPAL;
    try {
      row.setup?.();
      const service = createAuthService({
        appEnv: row.appEnv,
        sessionsRevokedAt:
          row.id === "REVOKED_SESSION"
            ? new Date()
            : null,
      });
      const authGuard = new AuthGuard(service, new Reflector());
      const ctx = {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => httpRequest(row.headers),
        }),
      };
      await expect(authGuard.canActivate(ctx as never)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    } finally {
      if (prev === undefined) delete process.env.FORGE_ALLOW_DEV_PRINCIPAL;
      else process.env.FORGE_ALLOW_DEV_PRINCIPAL = prev;
    }
  });
});

describe("Industrial authz matrix — Nest hybrid smoke", () => {
  it("boots a minimal module with real PermissionGuard evaluation", async () => {
    const authContext = {
      resolvePrincipal: vi.fn(async () => principalFor("tenant-admin", TENANT_A)),
      getTenantOperationalState: vi.fn(async () => operationalActive()),
    };
    const decisions = { recordDenial: vi.fn(async () => undefined) };

    const moduleRef = await Test.createTestingModule({
      controllers: [IndustrialAuthzMatrixFixtureController],
      providers: [
        Reflector,
        { provide: AuthContextService, useValue: authContext },
        { provide: AuthorizationDecisionService, useValue: decisions },
        {
          provide: AuthGuard,
          useFactory: (auth: AuthContextService, reflector: Reflector) =>
            new AuthGuard(auth, reflector),
          inject: [AuthContextService, Reflector],
        },
        {
          provide: PermissionGuard,
          useFactory: (
            reflector: Reflector,
            auth: AuthContextService,
            dec: AuthorizationDecisionService,
          ) => new PermissionGuard(reflector, auth, dec),
          inject: [Reflector, AuthContextService, AuthorizationDecisionService],
        },
      ],
    }).compile();

    const perm = moduleRef.get(PermissionGuard);
    const fixtureCtrl = moduleRef.get(IndustrialAuthzMatrixFixtureController);

    await expect(
      perm.canActivate(
        executionContextFor({
          handler: fixtureCtrl.walkthroughStudioList,
          controller: fixtureCtrl,
          principal: principalFor("tenant-admin", TENANT_A),
        }) as never,
      ),
    ).resolves.toBe(true);

    await expect(
      perm.canActivate(
        executionContextFor({
          // Pass unbound method so Reflect metadata remains attached.
          handler: fixtureCtrl.walkthroughStudioExport,
          controller: fixtureCtrl,
          principal: principalFor("employee", TENANT_A),
        }) as never,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
