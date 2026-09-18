import { Inject, Injectable } from "@nestjs/common";
import { verifyCognitoAccessToken } from "@forge/auth";
import {
  evaluateTenantOperationalState,
  resolveEffectivePermissionCodes,
} from "@forge/authorization";
import {
  isMembershipStatusActive,
  isModuleEntitlementWithinWindow,
  SUBSCRIPTION_STATUSES,
} from "@forge/contracts";
import {
  lookupIdentity,
  lookupUserTenants,
  membershipModuleAccess,
  membershipProductAccess,
  membershipRoleAssignments,
  organizationMemberships,
  permissions,
  platformModules,
  platformProducts,
  rolePermissions,
  roles,
  subscriptions,
  tenantModuleEntitlements,
  tenantProducts,
  tenants,
  userRoleAssignments,
  users,
  userTenantAccess,
  userTenantMemberships,
  withBypassRlsTransaction,
  withTenantTransaction,
  type Database,
} from "@forge/database";
import type { ForgeEnvironment } from "@forge/environment";
import { ForgeError } from "@forge/errors";
import type { ForgePrincipal, TenantOperationalState } from "@forge/tenant-context";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { APP_ENV, DATABASE } from "../../tokens.js";
import type { RequestWithIds } from "../../common/request-ids.js";
import { getRequestIds } from "../../common/request-ids.js";
import { AuditService } from "../audit/audit.service.js";
import { CognitoAdminService } from "../cognito/cognito-admin.service.js";

const PLATFORM_SUPER_ADMIN = "PLATFORM_SUPER_ADMIN";

/** Consider a user online when they have API activity within this window. */
export const PRESENCE_ONLINE_MS = 3 * 60 * 1000;
/** Do not write last_activity_at more often than this. */
const PRESENCE_TOUCH_THROTTLE_MS = 60 * 1000;

/** True when last API activity falls within the online window. */
export function isOnlineFromActivity(
  lastActivityAt: Date | string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastActivityAt) return false;
  const t =
    lastActivityAt instanceof Date
      ? lastActivityAt.getTime()
      : new Date(lastActivityAt).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t < PRESENCE_ONLINE_MS;
}

export type AuthAccessMode = "MEMBER" | "PLATFORM_ADMIN_SUPPORT";

@Injectable()
export class AuthContextService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_ENV) private readonly env: ForgeEnvironment,
    private readonly cognito: CognitoAdminService,
    private readonly audit: AuditService,
  ) {}

  async resolvePrincipal(req: RequestWithIds): Promise<ForgePrincipal> {
    const ids = getRequestIds(req);
    const authHeader = req.header("authorization");
    const bearer =
      authHeader?.startsWith("Bearer ") || authHeader?.startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;

    let userId: string | null = null;
    let tenantHint: string | null = null;
    let identityId: string | null = null;
    let authProvider: ForgePrincipal["authProvider"] = "COGNITO";
    let tokenIssuedAtMs: number | null = null;

    if (bearer) {
      const claims = await verifyCognitoAccessToken(bearer, {
        region: this.env.AWS_REGION,
        userPoolId: this.env.COGNITO_USER_POOL_ID,
        clientId: this.env.COGNITO_CLIENT_ID,
      }).catch(() => {
        throw new ForgeError("UNAUTHORIZED", "Invalid or expired access token");
      });

      const identity = await lookupIdentity(this.db, "COGNITO", claims.sub);
      if (!identity) {
        throw new ForgeError("UNAUTHORIZED", "Authentication identity is not linked");
      }
      if (identity.userStatus === "DISABLED") {
        throw new ForgeError("FORBIDDEN", "User account is disabled");
      }
      if (
        identity.sessionsRevokedAt &&
        typeof claims.iat === "number" &&
        claims.iat * 1000 < identity.sessionsRevokedAt.getTime()
      ) {
        throw new ForgeError("UNAUTHORIZED", "Session has been revoked");
      }

      identityId = identity.identityId;
      userId = identity.userId;
      tenantHint = identity.tenantId;
      tokenIssuedAtMs = typeof claims.iat === "number" ? claims.iat * 1000 : null;
    } else if (this.allowsDevPrincipalHeader()) {
      const raw =
        req.header("x-forge-dev-principal") ??
        req.header("x-forge-dev-user") ??
        req.header("X-Forge-Dev-User");
      if (!raw) {
        throw new ForgeError("UNAUTHORIZED", "Missing Authorization or dev principal header");
      }
      let parsed: { userId?: string; tenantId?: string };
      try {
        parsed = JSON.parse(raw) as { userId?: string; tenantId?: string };
      } catch {
        throw new ForgeError("UNAUTHORIZED", "Invalid x-forge-dev-principal JSON");
      }
      if (!parsed.userId || !parsed.tenantId) {
        throw new ForgeError("UNAUTHORIZED", "Dev principal requires userId and tenantId");
      }
      userId = parsed.userId;
      tenantHint = parsed.tenantId;
      identityId = `dev:${parsed.userId}`;
      authProvider = "COGNITO";
    } else {
      throw new ForgeError("UNAUTHORIZED", "Authorization Bearer token required");
    }

    const user = await withTenantTransaction(this.db, tenantHint!, async (tx) =>
      tx.query.users.findFirst({ where: eq(users.id, userId!) }),
    );
    if (!user) {
      throw new ForgeError("UNAUTHORIZED", "User not found");
    }
    if (user.status === "DISABLED") {
      throw new ForgeError("FORBIDDEN", "User account is disabled");
    }
    if (
      user.sessionsRevokedAt &&
      tokenIssuedAtMs !== null &&
      tokenIssuedAtMs < user.sessionsRevokedAt.getTime()
    ) {
      throw new ForgeError("UNAUTHORIZED", "Session has been revoked");
    }

    // Fire-and-forget presence + login touch — never block auth on these writes.
    void this.touchPresence(user.tenantId, user.id, {
      previousActivityAt: user.lastActivityAt ?? null,
      previousLoginAt: user.lastLoginAt ?? null,
      tokenIssuedAtMs,
    });

    const routeTenantId =
      (req.params?.tenantId as string | undefined) ??
      req.header("x-tenant-id")?.trim() ??
      tenantHint;

    if (!routeTenantId) {
      throw new ForgeError("BAD_REQUEST", "Tenant context could not be resolved");
    }

    const access = await this.resolveTenantAccess(userId!, routeTenantId);

    // Always evaluate platform-admin authority from the user's home tenant.
    // Membership in a customer tenant must not replace home PLATFORM_SUPER_ADMIN.
    const homeTenantId = user.tenantId;
    const permissionBundle = await this.loadPermissions(homeTenantId, userId!);
    const isSuper =
      permissionBundle.roleCodes.has(PLATFORM_SUPER_ADMIN) ||
      (permissionBundle.permissionCodes.has("platform.tenant.create") &&
        permissionBundle.permissionCodes.has("platform.tenant.suspend") &&
        permissionBundle.permissionCodes.has("platform.entitlement.manage"));

    if (!access && !isSuper) {
      throw new ForgeError("FORBIDDEN", "No active access to the requested tenant");
    }
    if (access && !isMembershipStatusActive(access.status) && !isSuper) {
      throw new ForgeError("FORBIDDEN", "Membership is not active for the requested tenant");
    }

    const tenantId = routeTenantId;
    const tenant = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }),
    );
    if (!tenant && !isSuper) {
      throw new ForgeError("NOT_FOUND", "Tenant not found");
    }
    if (tenant) {
      this.assertTenantSessionEligible(tenant.status, isSuper);
    }

    let effectivePermissions = permissionBundle;
    if (access && homeTenantId !== tenantId && !isSuper) {
      effectivePermissions = await this.loadPermissions(tenantId, userId!);
    }

    const entitlements = tenant
      ? await this.loadEntitlements(tenantId, access?.membershipId ?? null, {
          preferTenantCatalog: isSuper,
        })
      : { products: new Set<string>(), modules: new Set<string>() };

    const memberships = user.personId
      ? await withTenantTransaction(this.db, tenantId, async (tx) =>
          tx.query.organizationMemberships.findMany({
            where: and(
              eq(organizationMemberships.tenantId, tenantId),
              eq(organizationMemberships.personId, user.personId!),
              eq(organizationMemberships.status, "ACTIVE"),
            ),
          }),
        )
      : [];

    return {
      authenticationIdentityId: identityId!,
      userId: userId!,
      personId: user.personId,
      tenantId,
      organizationIds: memberships.map((m) => m.organizationId),
      permissions: effectivePermissions.permissionCodes,
      activeProducts: entitlements.products,
      activeModules: entitlements.modules,
      correlationId: ids.correlationId,
      requestId: ids.requestId,
      authProvider,
      isPlatformAdmin: isSuper,
    };
  }

  async listAvailableTenants(userId: string, options?: { isPlatformAdmin?: boolean }) {
    let rows: Awaited<ReturnType<typeof lookupUserTenants>>;
    try {
      rows = await lookupUserTenants(this.db, userId);
    } catch (error: unknown) {
      throw new ForgeError(
        "INTERNAL_ERROR",
        "Failed to resolve available tenants for the authenticated user",
        {
          exposeMessage: this.env.APP_ENV === "local" || this.env.APP_ENV === "development",
          cause: error,
          details: [
            {
              reason: error instanceof Error ? error.message : String(error),
            },
          ],
        },
      );
    }

    const membershipRows = rows.map((row) => {
      const tenantSession = evaluateTenantOperationalState({
        tenantStatus: row.tenantStatus,
        subscriptionStatus: "ACTIVE",
      });
      return {
        tenantId: row.tenantId,
        slug: row.tenantSlug,
        displayName: row.tenantDisplayName,
        tenantStatus: row.tenantStatus,
        membershipId: row.membershipId,
        membershipStatus: row.membershipStatus,
        isDefaultTenant: row.isDefaultTenant,
        selectable:
          isMembershipStatusActive(row.membershipStatus) && tenantSession.canAuthenticate,
        accessMode: "MEMBER" as AuthAccessMode,
      };
    });

    if (!options?.isPlatformAdmin) {
      return membershipRows;
    }

    // Platform admins may open any existing non-deleted tenant in support context.
    // Catalog read uses controlled bypass_rls (same path as platform tenant list).
    const catalog = await withBypassRlsTransaction(this.db, async (tx) =>
      tx.query.tenants.findMany({
        where: ne(tenants.status, "ARCHIVED"),
        orderBy: (t, { asc }) => [asc(t.displayName)],
      }),
    );

    const byId = new Map(membershipRows.map((row) => [row.tenantId, row]));
    for (const tenant of catalog) {
      const existing = byId.get(tenant.id);
      const tenantSession = evaluateTenantOperationalState({
        tenantStatus: tenant.status,
        subscriptionStatus: "ACTIVE",
      });
      if (existing) {
        existing.selectable = existing.selectable || tenantSession.canAuthenticate;
        continue;
      }
      byId.set(tenant.id, {
        tenantId: tenant.id,
        slug: tenant.slug,
        displayName: tenant.displayName,
        tenantStatus: tenant.status,
        membershipId: null,
        membershipStatus: "PLATFORM_ADMIN_SUPPORT",
        isDefaultTenant: false,
        selectable: tenantSession.canAuthenticate,
        accessMode: "PLATFORM_ADMIN_SUPPORT",
      });
    }

    return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async selectTenant(
    principal: ForgePrincipal,
    tenantId: string,
    options?: { productCode?: string; reason?: string },
  ): Promise<ReturnType<AuthContextService["toClientSummary"]> & { accessMode: AuthAccessMode }> {
    const access = await this.resolveTenantAccess(principal.userId, tenantId);

    if (!access || !isMembershipStatusActive(access.status)) {
      if (!principal.isPlatformAdmin) {
        throw new ForgeError("FORBIDDEN", "No active membership for the selected tenant");
      }
    }

    const tenant = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }),
    );
    if (!tenant) {
      throw new ForgeError("NOT_FOUND", "Tenant not found");
    }
    this.assertTenantSessionEligible(tenant.status, principal.isPlatformAdmin);

    // Platform admin support context keeps authoritative home permissions.
    // Membership path still loads tenant-local roles when present.
    let permissionCodes = principal.permissions;
    if (access && isMembershipStatusActive(access.status) && !principal.isPlatformAdmin) {
      const permissions = await this.loadPermissions(tenantId, principal.userId);
      permissionCodes = permissions.permissionCodes;
    } else if (access && isMembershipStatusActive(access.status) && principal.isPlatformAdmin) {
      const membershipPermissions = await this.loadPermissions(tenantId, principal.userId);
      permissionCodes = new Set([...principal.permissions, ...membershipPermissions.permissionCodes]);
    }

    const entitlements = await this.loadEntitlements(tenantId, access?.membershipId ?? null, {
      preferTenantCatalog: principal.isPlatformAdmin,
    });

    const resolvedAccessMode: AuthAccessMode =
      principal.isPlatformAdmin && (!access || !isMembershipStatusActive(access.status))
        ? "PLATFORM_ADMIN_SUPPORT"
        : principal.isPlatformAdmin
          ? "PLATFORM_ADMIN_SUPPORT"
          : "MEMBER";

    if (principal.isPlatformAdmin) {
      await withTenantTransaction(this.db, tenantId, async (tx) => {
        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "PLATFORM_ADMIN_TENANT_ACCESS_STARTED",
          resourceType: "tenant",
          resourceId: tenantId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: {
            platformRole: "PLATFORM_SUPER_ADMIN",
            platformAdmin: true,
            targetTenantId: tenantId,
            targetProduct: options?.productCode ?? null,
            reason: options?.reason ?? "select-tenant",
            accessMode: resolvedAccessMode,
            membershipId: access?.membershipId ?? null,
          },
        });
      }, principal.userId);
    }

    const summaryPrincipal: ForgePrincipal = {
      ...principal,
      tenantId,
      permissions: permissionCodes,
      activeProducts: entitlements.products,
      activeModules: entitlements.modules,
    };
    return {
      ...this.toClientSummary(summaryPrincipal),
      accessMode: resolvedAccessMode,
    };
  }

  /**
   * Invalidates every issued access token for the principal by stamping
   * sessions_revoked_at and bumping session_version, then asking Cognito to
   * drop refresh tokens.
   */
  async logoutAll(principal: ForgePrincipal): Promise<{ sessionVersion: number }> {
    const now = new Date();
    const updated = await withTenantTransaction(
      this.db,
      principal.tenantId,
      async (tx) => {
        const current = await tx.query.users.findFirst({ where: eq(users.id, principal.userId) });
        if (!current) {
          throw new ForgeError("NOT_FOUND", "User not found");
        }
        const [row] = await tx
          .update(users)
          .set({
            sessionsRevokedAt: now,
            sessionVersion: current.sessionVersion + 1,
            lastActivityAt: null,
            updatedAt: now,
          })
          .where(eq(users.id, principal.userId))
          .returning({
            sessionVersion: users.sessionVersion,
            primaryEmail: users.primaryEmail,
          });
        return row;
      },
      principal.userId,
    );

    if (this.cognito.enabled && updated?.primaryEmail) {
      await this.cognito.globalSignOut(updated.primaryEmail).catch(() => undefined);
    }

    return { sessionVersion: updated?.sessionVersion ?? 1 };
  }

  async getTenantOperationalState(tenantId: string): Promise<TenantOperationalState> {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const tenant = await tx.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      if (!tenant) {
        return evaluateTenantOperationalState({
          tenantStatus: "ARCHIVED",
          subscriptionStatus: null,
        });
      }
      const current = await tx.query.subscriptions.findFirst({
        where: and(
          eq(subscriptions.tenantId, tenantId),
          inArray(subscriptions.status, [...SUBSCRIPTION_STATUSES, "TRIAL", "GRACE", "CANCELED"]),
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      return evaluateTenantOperationalState({
        tenantStatus: tenant.status,
        subscriptionStatus: current?.status ?? null,
      });
    });
  }

  private async resolveTenantAccess(userId: string, tenantId: string) {
    const membership = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx.query.userTenantMemberships.findFirst({
        where: and(
          eq(userTenantMemberships.userId, userId),
          eq(userTenantMemberships.tenantId, tenantId),
        ),
      }),
    );
    if (membership) {
      return {
        tenantId: membership.tenantId,
        status: membership.status,
        membershipId: membership.id,
      };
    }

    // Compatibility projection for rows not yet migrated to memberships.
    const access = await withTenantTransaction(this.db, tenantId, async (tx) =>
      tx.query.userTenantAccess.findFirst({
        where: and(eq(userTenantAccess.userId, userId), eq(userTenantAccess.tenantId, tenantId)),
      }),
    );
    return access
      ? { tenantId: access.tenantId, status: access.status, membershipId: null as string | null }
      : null;
  }

  private async loadPermissions(tenantId: string, userId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const membership = await tx.query.userTenantMemberships.findFirst({
        where: and(
          eq(userTenantMemberships.tenantId, tenantId),
          eq(userTenantMemberships.userId, userId),
          eq(userTenantMemberships.status, "ACTIVE"),
        ),
      });

      let roleRows: Array<{ roleId: string; roleCode: string }> = [];
      if (membership) {
        roleRows = await tx
          .select({
            roleId: membershipRoleAssignments.roleId,
            roleCode: roles.code,
          })
          .from(membershipRoleAssignments)
          .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
          .where(
            and(
              eq(membershipRoleAssignments.membershipId, membership.id),
              eq(membershipRoleAssignments.status, "ACTIVE"),
              isNull(membershipRoleAssignments.revokedAt),
            ),
          );
      } else {
        // Fall back to the Sprint 1D user_role_assignments projection.
        roleRows = await tx
          .select({
            roleId: userRoleAssignments.roleId,
            roleCode: roles.code,
          })
          .from(userRoleAssignments)
          .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
          .where(
            and(
              eq(userRoleAssignments.tenantId, tenantId),
              eq(userRoleAssignments.userId, userId),
              isNull(userRoleAssignments.revokedAt),
            ),
          );
      }

      const roleCodes = new Set(roleRows.map((a) => a.roleCode));
      const roleIds = roleRows.map((a) => a.roleId);
      let permissionCodes = new Set<string>();

      if (roleIds.length > 0) {
        const perms = await tx
          .select({
            code: permissions.code,
            effect: rolePermissions.effect,
          })
          .from(rolePermissions)
          .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
          .where(inArray(rolePermissions.roleId, roleIds));

        permissionCodes = resolveEffectivePermissionCodes(
          perms.map((p) => ({
            code: p.code,
            effect: p.effect === "DENY" ? "DENY" : "ALLOW",
          })),
        );
      }

      return { roleCodes, permissionCodes };
    }, userId);
  }

  private async loadEntitlements(
    tenantId: string,
    membershipId: string | null,
    options?: { preferTenantCatalog?: boolean },
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const products = new Set<string>();
      const modules = new Set<string>();

      // Platform admin support / no membership: expose the tenant catalog as-is
      // (does not invent grants; reflects tenant product ownership only).
      if (!membershipId || options?.preferTenantCatalog) {
        const tp = await tx
          .select({ code: platformProducts.code })
          .from(tenantProducts)
          .innerJoin(platformProducts, eq(platformProducts.id, tenantProducts.productId))
          .where(and(eq(tenantProducts.tenantId, tenantId), eq(tenantProducts.status, "ACTIVE")));
        for (const row of tp) {
          products.add(row.code);
        }

        const now = new Date();
        const tm = await tx
          .select({
            code: platformModules.code,
            startsAt: tenantModuleEntitlements.startsAt,
            endsAt: tenantModuleEntitlements.endsAt,
          })
          .from(tenantModuleEntitlements)
          .innerJoin(platformModules, eq(platformModules.id, tenantModuleEntitlements.moduleId))
          .where(
            and(
              eq(tenantModuleEntitlements.tenantId, tenantId),
              inArray(tenantModuleEntitlements.status, ["ACTIVE", "GRACE"]),
            ),
          );
        for (const row of tm) {
          if (isModuleEntitlementWithinWindow(row, now)) {
            modules.add(row.code);
          }
        }

        return { products, modules };
      }

      if (membershipId) {
        const mp = await tx
          .select({ code: platformProducts.code })
          .from(membershipProductAccess)
          .innerJoin(platformProducts, eq(platformProducts.id, membershipProductAccess.productId))
          .where(
            and(
              eq(membershipProductAccess.membershipId, membershipId),
              eq(membershipProductAccess.status, "ACTIVE"),
            ),
          );
        for (const row of mp) {
          products.add(row.code);
        }

        const mm = await tx
          .select({ code: platformModules.code })
          .from(membershipModuleAccess)
          .innerJoin(platformModules, eq(platformModules.id, membershipModuleAccess.moduleId))
          .where(
            and(
              eq(membershipModuleAccess.membershipId, membershipId),
              eq(membershipModuleAccess.status, "ACTIVE"),
            ),
          );
        for (const row of mm) {
          modules.add(row.code);
        }

        // Membership grants are intersected with what the tenant itself holds.
        const tenantProductsSet = new Set<string>();
        const tp = await tx
          .select({ code: platformProducts.code })
          .from(tenantProducts)
          .innerJoin(platformProducts, eq(platformProducts.id, tenantProducts.productId))
          .where(and(eq(tenantProducts.tenantId, tenantId), eq(tenantProducts.status, "ACTIVE")));
        for (const row of tp) {
          tenantProductsSet.add(row.code);
        }
        for (const code of [...products]) {
          if (!tenantProductsSet.has(code)) {
            products.delete(code);
          }
        }

        const now = new Date();
        const tenantModulesSet = new Set<string>();
        const tm = await tx
          .select({
            code: platformModules.code,
            startsAt: tenantModuleEntitlements.startsAt,
            endsAt: tenantModuleEntitlements.endsAt,
          })
          .from(tenantModuleEntitlements)
          .innerJoin(platformModules, eq(platformModules.id, tenantModuleEntitlements.moduleId))
          .where(
            and(
              eq(tenantModuleEntitlements.tenantId, tenantId),
              inArray(tenantModuleEntitlements.status, ["ACTIVE", "GRACE"]),
            ),
          );
        for (const row of tm) {
          if (isModuleEntitlementWithinWindow(row, now)) {
            tenantModulesSet.add(row.code);
          }
        }
        for (const code of [...modules]) {
          if (!tenantModulesSet.has(code)) {
            modules.delete(code);
          }
        }

        return { products, modules };
      }

      return { products, modules };
    });
  }

  /**
   * Throttled presence write so messaging can show who is currently in the Platform.
   * Also records lastLoginAt when a new Cognito access token is seen (or first activity).
   * Failures are ignored — auth must not depend on presence.
   */
  private async touchPresence(
    homeTenantId: string,
    userId: string,
    opts: {
      previousActivityAt: Date | null;
      previousLoginAt: Date | null;
      tokenIssuedAtMs: number | null;
    },
  ): Promise<void> {
    const now = Date.now();
    const activityStale =
      !opts.previousActivityAt ||
      now - opts.previousActivityAt.getTime() >= PRESENCE_TOUCH_THROTTLE_MS;
    const loginNeedsUpdate =
      opts.tokenIssuedAtMs != null
        ? !opts.previousLoginAt || opts.previousLoginAt.getTime() < opts.tokenIssuedAtMs
        : !opts.previousLoginAt && activityStale;
    if (!activityStale && !loginNeedsUpdate) {
      return;
    }
    try {
      await withTenantTransaction(
        this.db,
        homeTenantId,
        async (tx) => {
          const patch: {
            lastActivityAt?: Date;
            lastLoginAt?: Date;
            updatedAt: Date;
          } = { updatedAt: new Date(now) };
          if (activityStale) {
            patch.lastActivityAt = new Date(now);
          }
          if (loginNeedsUpdate) {
            patch.lastLoginAt = new Date(
              opts.tokenIssuedAtMs != null ? opts.tokenIssuedAtMs : now,
            );
          }
          await tx.update(users).set(patch).where(eq(users.id, userId));
        },
        userId,
      );
    } catch {
      // Presence is best-effort.
    }
  }

  /**
   * Dev principal headers are for local CI and explicit break-glass only.
   * Hosted `APP_ENV=development` (e.g. api-dev) must NOT accept them unless
   * `FORGE_ALLOW_DEV_PRINCIPAL=true` is set deliberately.
   */
  private allowsDevPrincipalHeader(): boolean {
    if (this.env.APP_ENV === "local" || this.env.APP_ENV === "testing") {
      return true;
    }
    if (
      (this.env.APP_ENV === "development" || this.env.APP_ENV === "govcloud-development") &&
      process.env.FORGE_ALLOW_DEV_PRINCIPAL === "true"
    ) {
      return true;
    }
    return false;
  }

  /**
   * Tenant status gate for session context (independent of subscription billing).
   * Aligns with `@forge/authorization` canAuthenticate rules (allows TRIAL).
   */
  private assertTenantSessionEligible(tenantStatus: string, isPlatformAdmin: boolean): void {
    const state = evaluateTenantOperationalState({
      tenantStatus,
      subscriptionStatus: "ACTIVE",
    });
    if (!state.canAuthenticate && !isPlatformAdmin) {
      throw new ForgeError("TENANT_INACTIVE", "Selected tenant is not active");
    }
  }

  toClientSummary(principal: ForgePrincipal, accessMode: AuthAccessMode = "MEMBER") {
    return {
      userId: principal.userId,
      personId: principal.personId,
      tenantId: principal.tenantId,
      organizationIds: principal.organizationIds,
      permissions: [...principal.permissions],
      activeProducts: [...principal.activeProducts],
      activeModules: [...principal.activeModules],
      isPlatformAdmin: principal.isPlatformAdmin,
      authProvider: principal.authProvider,
      accessMode,
    };
  }
}
