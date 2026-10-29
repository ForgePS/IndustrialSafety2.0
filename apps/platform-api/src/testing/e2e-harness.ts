import { createHash } from "node:crypto";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { evaluateAuthorization } from "@forge/authorization";
import {
  authenticationIdentities,
  createDatabase,
  createId,
  idempotencyRecords,
  membershipModuleAccess,
  membershipProductAccess,
  membershipRoleAssignments,
  outboxEvents,
  permissions,
  persons,
  platformModules,
  platformProducts,
  rolePermissions,
  roles,
  subscriptionPlans,
  subscriptions,
  tenantModuleEntitlements,
  tenantProducts,
  tenants,
  userInvitations,
  userTenantMemberships,
  users,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import { seedPlatformData } from "@forge/database/seed";
import { LOCAL_PLACEHOLDER_ENV, loadEnvironment } from "@forge/environment";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { AppModule } from "../app.module.js";
import { GlobalExceptionFilter } from "../http-exception.filter.js";
import { AuthContextService } from "../modules/auth-context/auth-context.service.js";
import type { RequestWithIds } from "../common/request-ids.js";

export const TEST_ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  "postgresql://forge:forge_local_only@localhost:5432/forge_platform_test";

export const TEST_APP_URL =
  process.env.DATABASE_URL ??
  "postgresql://forge_app:forge_local_only@localhost:5432/forge_platform_test";

const TEST_ENV = loadEnvironment({
  ...LOCAL_PLACEHOLDER_ENV,
  APP_ENV: "local",
  NODE_ENV: "test",
  DATABASE_URL: TEST_ADMIN_URL,
  DATABASE_NAME: "forge_platform_test",
});

export function devPrincipal(userId: string, tenantId: string): Record<string, string> {
  return {
    "x-forge-dev-principal": JSON.stringify({ userId, tenantId }),
  };
}

export interface TenantFixture {
  tenantId: string;
  tenantKey: string;
  subscriptionId: string;
  planId: string;
}

export interface UserFixture {
  userId: string;
  tenantId: string;
  membershipId: string;
  email: string;
}

export class E2eHarness {
  readonly adminDb: Database;
  readonly appDb: Database;
  app!: INestApplication;
  authContext!: AuthContextService;

  private readonly createdTenantIds = new Set<string>();

  constructor() {
    this.adminDb = createDatabase(TEST_ADMIN_URL);
    this.appDb = createDatabase(TEST_APP_URL);
  }

  async init(): Promise<void> {
    await seedPlatformData(this.adminDb);
    await this.ensureSubscriptionPlan();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(TEST_ENV)],
    }).compile();

    this.app = moduleRef.createNestApplication();
    this.app.useGlobalFilters(new GlobalExceptionFilter(TEST_ENV));
    await this.app.init();
    this.authContext = this.app.get(AuthContextService);
  }

  async close(): Promise<void> {
    await this.app?.close();
  }

  request() {
    return request(this.app.getHttpServer());
  }

  api(userId: string, tenantId: string) {
    const headers = devPrincipal(userId, tenantId);
    return {
      get: (path: string) => this.request().get(path).set(headers),
      post: (path: string) => this.request().post(path).set(headers),
      patch: (path: string) => this.request().patch(path).set(headers),
      put: (path: string) => this.request().put(path).set(headers),
      delete: (path: string) => this.request().delete(path).set(headers),
    };
  }

  async createTenant(
    options: {
      productCodes?: string[];
      moduleCodes?: string[];
      subscriptionStatus?: string;
    } = {},
  ): Promise<TenantFixture> {
    const tenantId = createId();
    const tenantKey = `e2e-${tenantId.replace(/-/g, "")}`;
    const now = new Date();
    const productCodes = options.productCodes ?? ["FORGE_RMS"];
    const moduleCodes = options.moduleCodes ?? ["CORE", "PERSONNEL"];
    const subscriptionStatus = options.subscriptionStatus ?? "ACTIVE";

    await this.adminDb.insert(tenants).values({
      id: tenantId,
      tenantKey,
      slug: tenantKey,
      legalName: tenantKey,
      displayName: tenantKey,
      tenantType: "CUSTOMER",
      status: "ACTIVE",
      timezone: "UTC",
      defaultLocale: "en-US",
      dataRegion: "us-east-1",
      createdAt: now,
      updatedAt: now,
    });

    const plan = await this.adminDb.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, "E2E_STANDARD"),
    });
    if (!plan) {
      throw new Error("Missing E2E subscription plan");
    }

    const subscriptionId = createId();
    await this.adminDb.insert(subscriptions).values({
      id: subscriptionId,
      tenantId,
      planId: plan.id,
      status: subscriptionStatus,
      billingProvider: "NONE",
      startsAt: now,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 86400_000),
      createdAt: now,
      updatedAt: now,
    });

    const productRows = await this.adminDb
      .select()
      .from(platformProducts)
      .where(inArray(platformProducts.code, [...productCodes]));

    for (const product of productRows) {
      await this.adminDb.insert(tenantProducts).values({
        id: createId(),
        tenantId,
        productId: product.id,
        status: "ACTIVE",
        enabledAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    const moduleRows = await this.adminDb
      .select({ module: platformModules })
      .from(platformModules)
      .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
      .where(inArray(platformModules.code, [...moduleCodes]));

    for (const row of moduleRows) {
      await this.adminDb.insert(tenantModuleEntitlements).values({
        id: createId(),
        tenantId,
        moduleId: row.module.id,
        status: "ACTIVE",
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    this.trackTenant(tenantId);
    await this.ensureTenantRoles(tenantId);
    return { tenantId, tenantKey, subscriptionId, planId: plan.id };
  }

  /** Register a tenant created via API for harness cleanup. */
  trackTenant(tenantId: string): void {
    this.createdTenantIds.add(tenantId);
  }

  /**
   * After API-provisioned tenant create/activate: attach E2E subscription + seed
   * TENANT_OWNER / TENANT_ADMIN / STANDARD_USER roles (mirrors onboarding bootstrap).
   */
  async bootstrapProvisionedTenant(
    tenantId: string,
  ): Promise<{ subscriptionId: string; planId: string }> {
    const plan = await this.adminDb.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, "E2E_STANDARD"),
    });
    if (!plan) {
      throw new Error("Missing E2E subscription plan");
    }

    const existing = await this.adminDb.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, tenantId),
    });
    let subscriptionId = existing?.id;
    if (!subscriptionId) {
      subscriptionId = createId();
      const now = new Date();
      await this.adminDb.insert(subscriptions).values({
        id: subscriptionId,
        tenantId,
        planId: plan.id,
        status: "ACTIVE",
        billingProvider: "NONE",
        startsAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 86400_000),
        createdAt: now,
        updatedAt: now,
      });
    }

    this.trackTenant(tenantId);
    await this.ensureTenantRoles(tenantId);
    return { subscriptionId, planId: plan.id };
  }

  /**
   * Entitle modules for a product by resolving product-scoped module IDs
   * (module codes are not globally unique across products).
   */
  async entitleModulesForProduct(
    tenantId: string,
    productCode: string,
    moduleCodes: readonly string[],
  ): Promise<void> {
    const now = new Date();
    const moduleRows = await this.adminDb
      .select({ module: platformModules })
      .from(platformModules)
      .innerJoin(platformProducts, eq(platformProducts.id, platformModules.productId))
      .where(
        and(
          eq(platformProducts.code, productCode),
          inArray(platformModules.code, [...moduleCodes]),
        ),
      );

    for (const row of moduleRows) {
      const existing = await this.adminDb.query.tenantModuleEntitlements.findFirst({
        where: and(
          eq(tenantModuleEntitlements.tenantId, tenantId),
          eq(tenantModuleEntitlements.moduleId, row.module.id),
        ),
      });
      if (existing) {
        await this.adminDb
          .update(tenantModuleEntitlements)
          .set({ status: "ACTIVE", updatedAt: now })
          .where(eq(tenantModuleEntitlements.id, existing.id));
        continue;
      }
      await this.adminDb.insert(tenantModuleEntitlements).values({
        id: createId(),
        tenantId,
        moduleId: row.module.id,
        status: "ACTIVE",
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async ensureTenantRoles(tenantId: string): Promise<void> {
    await this.createRole(tenantId, "STANDARD_USER", [
      "platform.organization.read",
      "platform.person.read",
      "platform.permission.read",
    ]);
    await this.createRole(tenantId, "TENANT_ADMIN", [
      "platform.tenant.read",
      "platform.tenant.update",
      "platform.organization.read",
      "platform.organization.create",
      "platform.person.read",
      "platform.person.create",
      "platform.user.invite",
      "platform.role.assign",
      "platform.permission.read",
      "platform.audit.read",
      "platform.invitation.read",
      "platform.invitation.manage",
      "platform.membership.read",
      "platform.membership.manage",
      "tenant.facilities.read",
      "tenant.facilities.manage",
      "tenant.notification.read",
      "tenant.notification.manage",
      "tenant.billing.read",
    ]);
    await this.createRole(tenantId, "TENANT_OWNER", [
      "platform.tenant.read",
      "platform.tenant.update",
      "platform.organization.read",
      "platform.organization.create",
      "platform.person.read",
      "platform.person.create",
      "platform.person.update",
      "platform.user.invite",
      "platform.role.assign",
      "platform.permission.read",
      "platform.audit.read",
      "platform.invitation.read",
      "platform.invitation.manage",
      "platform.membership.read",
      "platform.membership.manage",
      "tenant.facilities.read",
      "tenant.facilities.manage",
      "tenant.notification.read",
      "tenant.notification.manage",
      "tenant.billing.read",
    ]);
  }

  async createRole(
    tenantId: string,
    code: string,
    permissionCodes: readonly string[],
  ): Promise<string> {
    const existing = await withTenantTransaction(this.adminDb, tenantId, async (tx) =>
      tx.query.roles.findFirst({
        where: and(eq(roles.tenantId, tenantId), eq(roles.code, code)),
      }),
    );
    if (existing) {
      return existing.id;
    }

    const roleId = createId();
    const now = new Date();
    await withTenantTransaction(this.adminDb, tenantId, async (tx) => {
      await tx.insert(roles).values({
        id: roleId,
        tenantId,
        code,
        name: code,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      });
      if (permissionCodes.length > 0) {
        const permRows = await tx
          .select({ id: permissions.id })
          .from(permissions)
          .where(inArray(permissions.code, [...permissionCodes]));
        for (const perm of permRows) {
          await tx.insert(rolePermissions).values({
            roleId,
            permissionId: perm.id,
            effect: "ALLOW",
            createdAt: now,
          });
        }
      }
    });
    return roleId;
  }

  async createUser(input: {
    tenantId: string;
    email: string;
    roleCode: string;
    rolePermissions: readonly string[];
    membershipStatus?: "PENDING" | "ACTIVE" | "SUSPENDED";
    productCodes?: string[];
    moduleCodes?: string[];
  }): Promise<UserFixture> {
    const userId = createId();
    const membershipId = createId();
    const now = new Date();
    const membershipStatus = input.membershipStatus ?? "ACTIVE";

    await withTenantTransaction(this.adminDb, input.tenantId, async (tx) => {
      await tx.insert(users).values({
        id: userId,
        tenantId: input.tenantId,
        primaryEmail: input.email.toLowerCase(),
        status: "ACTIVE",
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(userTenantMemberships).values({
        id: membershipId,
        tenantId: input.tenantId,
        userId,
        status: membershipStatus,
        isDefaultTenant: true,
        activatedAt: membershipStatus === "ACTIVE" ? now : null,
        createdAt: now,
        updatedAt: now,
      });
    });

    const roleId = await this.createRole(input.tenantId, input.roleCode, input.rolePermissions);

    await withTenantTransaction(this.adminDb, input.tenantId, async (tx) => {
      await tx.insert(membershipRoleAssignments).values({
        id: createId(),
        tenantId: input.tenantId,
        membershipId,
        roleId,
        status: "ACTIVE",
        grantedByUserId: userId,
        grantedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const productCodes = input.productCodes ?? ["FORGE_RMS"];
      if (productCodes.length > 0) {
        const products = await tx
          .select({ id: platformProducts.id })
          .from(platformProducts)
          .where(inArray(platformProducts.code, [...productCodes]));
        for (const product of products) {
          await tx.insert(membershipProductAccess).values({
            id: createId(),
            tenantId: input.tenantId,
            membershipId,
            productId: product.id,
            status: "ACTIVE",
            grantedByUserId: userId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }

      const moduleCodes = input.moduleCodes ?? ["CORE", "PERSONNEL"];
      if (moduleCodes.length > 0) {
        const modules = await tx
          .select({ id: platformModules.id })
          .from(platformModules)
          .where(inArray(platformModules.code, [...moduleCodes]));
        for (const mod of modules) {
          await tx.insert(membershipModuleAccess).values({
            id: createId(),
            tenantId: input.tenantId,
            membershipId,
            moduleId: mod.id,
            status: "ACTIVE",
            grantedByUserId: userId,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    });

    return { userId, tenantId: input.tenantId, membershipId, email: input.email.toLowerCase() };
  }

  async createPlatformSuperAdmin(): Promise<UserFixture> {
    let platformTenant = await this.adminDb.query.tenants.findFirst({
      where: eq(tenants.tenantKey, "forge-platform"),
    });
    if (!platformTenant) {
      const fixture = await this.createTenant({ productCodes: ["FORGE_CREATOR"] });
      await this.adminDb
        .update(tenants)
        .set({ tenantKey: "forge-platform", tenantType: "PLATFORM", slug: "forge-platform" })
        .where(eq(tenants.id, fixture.tenantId));
      platformTenant = await this.adminDb.query.tenants.findFirst({
        where: eq(tenants.id, fixture.tenantId),
      });
    }
    if (!platformTenant) {
      throw new Error("Failed to create platform tenant");
    }

    return this.createUser({
      tenantId: platformTenant.id,
      email: `super-admin-${createId()}@example.test`,
      roleCode: "PLATFORM_SUPER_ADMIN",
      rolePermissions: [
        "platform.tenant.create",
        "platform.tenant.read",
        "platform.tenant.update",
        "platform.tenant.suspend",
        "platform.person.read",
        "platform.person.create",
        "platform.invitation.manage",
        "platform.invitation.read",
        "platform.membership.manage",
        "platform.membership.read",
        "platform.role.assign",
        "platform.permission.read",
        "platform.entitlement.manage",
        "platform.onboarding.manage",
      ],
      productCodes: ["FORGE_CREATOR", "FORGE_RMS", "FORGE_ACADEMY", "FORGE_INDUSTRIAL"],
      moduleCodes: ["CORE", "TENANT_ADMIN", "PERSONNEL", "ADMINISTRATION"],
    });
  }

  async createPerson(tenantId: string, firstName: string, lastName: string): Promise<string> {
    const personId = createId();
    const now = new Date();
    await withTenantTransaction(this.adminDb, tenantId, async (tx) => {
      await tx.insert(persons).values({
        id: personId,
        tenantId,
        forgePersonNumber: `FP-${personId.slice(0, 8)}`,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        status: "ACTIVE",
        recordSource: "TEST",
        createdAt: now,
        updatedAt: now,
      });
    });
    return personId;
  }

  async setSubscriptionStatus(tenantId: string, subscriptionId: string, status: string) {
    await withTenantTransaction(this.adminDb, tenantId, async (tx) => {
      await tx
        .update(subscriptions)
        .set({ status, updatedAt: new Date() })
        .where(eq(subscriptions.id, subscriptionId));
    });
  }

  async countIdempotencyRecords(tenantId: string, key: string): Promise<number> {
    const rows = await withTenantTransaction(this.adminDb, tenantId, async (tx) =>
      tx
        .select({ id: idempotencyRecords.id })
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.tenantId, tenantId),
            eq(idempotencyRecords.idempotencyKey, key),
          ),
        ),
    );
    return rows.length;
  }

  async countOutboxEvents(
    tenantId: string,
    eventType: string,
    aggregateId?: string,
  ): Promise<number> {
    const rows = await withTenantTransaction(this.adminDb, tenantId, async (tx) =>
      tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.tenantId, tenantId),
            eq(outboxEvents.eventType, eventType),
            ...(aggregateId ? [eq(outboxEvents.aggregateId, aggregateId)] : []),
          ),
        ),
    );
    return rows.length;
  }

  async resolvePrincipal(userId: string, tenantId: string) {
    const req = {
      header: (name: string) => {
        if (name.toLowerCase() === "x-forge-dev-principal") {
          return JSON.stringify({ userId, tenantId });
        }
        return undefined;
      },
      params: { tenantId },
      correlationId: "test-correlation",
      requestId: "test-request",
    } as unknown as RequestWithIds;
    return this.authContext.resolvePrincipal(req);
  }

  evaluateForPrincipal(
    principal: Awaited<ReturnType<E2eHarness["resolvePrincipal"]>>,
    permissionCode: string,
    options?: { requiresEntitlement?: { productCode?: string; moduleCode?: string } },
  ) {
    return evaluateAuthorization({
      principal,
      permissionCode,
      resourceType: "person",
      resourceTenantId: principal.tenantId,
      tenantOperationalState: {
        tenantStatus: "ACTIVE",
        subscriptionStatus: "ACTIVE",
        canAuthenticate: true,
        canUseProducts: true,
        canManageBilling: true,
        reasonCode: null,
      },
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      ...options,
    });
  }

  simulatedCognitoSubject(email: string): string {
    const digest = createHash("sha256").update(`local-pool:${email.toLowerCase()}`).digest("hex");
    return [
      digest.slice(0, 8),
      digest.slice(8, 12),
      `4${digest.slice(13, 16)}`,
      `8${digest.slice(17, 20)}`,
      digest.slice(20, 32),
    ].join("-");
  }

  async cleanup(): Promise<void> {
    for (const tenantId of this.createdTenantIds) {
      try {
        await this.adminDb.delete(userInvitations).where(eq(userInvitations.tenantId, tenantId));
        await this.adminDb.delete(persons).where(eq(persons.tenantId, tenantId));
        await this.adminDb
          .delete(authenticationIdentities)
          .where(eq(authenticationIdentities.tenantId, tenantId));
        await this.adminDb.delete(users).where(eq(users.tenantId, tenantId));
        await this.adminDb.delete(tenants).where(eq(tenants.id, tenantId));
      } catch {
        /* best effort */
      }
    }
  }

  private async ensureSubscriptionPlan(): Promise<void> {
    const existing = await this.adminDb.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.code, "E2E_STANDARD"),
    });
    if (existing) {
      return;
    }
    const now = new Date();
    await this.adminDb.insert(subscriptionPlans).values({
      id: createId(),
      code: "E2E_STANDARD",
      name: "E2E Standard Plan",
      billingInterval: "MONTHLY",
      status: "ACTIVE",
      currency: "USD",
      configurationJson: {},
      createdAt: now,
      updatedAt: now,
    });
  }
}
