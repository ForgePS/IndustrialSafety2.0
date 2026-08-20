import { Inject, Injectable } from "@nestjs/common";
import {
  createMembershipInputSchema,
  isCreatorOnlyPermission,
  patchMembershipInputSchema,
  setMembershipFacilityScopeInputSchema,
  setMembershipProductsInputSchema,
  setMembershipRolesInputSchema,
  type MembershipStatus,
} from "@forge/contracts";
import {
  createId,
  facilities,
  membershipHistory,
  membershipModuleAccess,
  membershipProductAccess,
  membershipRoleAssignments,
  permissions,
  persons,
  platformModules,
  platformProducts,
  rolePermissions,
  roles,
  tenantModuleEntitlements,
  tenantProducts,
  userTenantAccess,
  userTenantMemberships,
  users,
  withTenantTransaction,
  type Database,
  type DatabaseTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

export type ExpectedVersion = number | "*";

/** Transitions permitted by ADR-021. Anything else is a 409. */
const ALLOWED_TRANSITIONS: Record<MembershipStatus, readonly MembershipStatus[]> = {
  PENDING: ["ACTIVE", "REVOKED", "EXPIRED"],
  ACTIVE: ["SUSPENDED", "REVOKED", "EXPIRED"],
  SUSPENDED: ["ACTIVE", "REVOKED", "ARCHIVED"],
  EXPIRED: ["ACTIVE", "ARCHIVED"],
  REVOKED: ["ARCHIVED"],
  ARCHIVED: [],
};

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async list(
    tenantId: string,
    filters: {
      status?: string | undefined;
      userId?: string | undefined;
      q?: string | undefined;
    },
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const conditions = [eq(userTenantMemberships.tenantId, tenantId)];
      if (filters.status) {
        conditions.push(eq(userTenantMemberships.status, filters.status));
      }
      if (filters.userId) {
        conditions.push(eq(userTenantMemberships.userId, filters.userId));
      }
      const q = filters.q?.trim();
      if (q) {
        const search = or(
          ilike(users.primaryEmail, `%${q}%`),
          ilike(users.username, `%${q}%`),
          ilike(persons.displayName, `%${q}%`),
          ilike(persons.firstName, `%${q}%`),
          ilike(persons.lastName, `%${q}%`),
        );
        if (search) conditions.push(search);
      }
      const rows = await tx
        .select({
          id: userTenantMemberships.id,
          tenantId: userTenantMemberships.tenantId,
          userId: userTenantMemberships.userId,
          status: userTenantMemberships.status,
          isDefaultTenant: userTenantMemberships.isDefaultTenant,
          facilityIdsJson: userTenantMemberships.facilityIdsJson,
          activatedAt: userTenantMemberships.activatedAt,
          suspendedAt: userTenantMemberships.suspendedAt,
          expiresAt: userTenantMemberships.expiresAt,
          revokedAt: userTenantMemberships.revokedAt,
          recordVersion: userTenantMemberships.recordVersion,
          createdAt: userTenantMemberships.createdAt,
          updatedAt: userTenantMemberships.updatedAt,
          email: users.primaryEmail,
          userStatus: users.status,
          username: users.username,
          personId: users.personId,
          lastLoginAt: users.lastLoginAt,
          displayName: persons.displayName,
          firstName: persons.firstName,
          lastName: persons.lastName,
        })
        .from(userTenantMemberships)
        .innerJoin(users, eq(users.id, userTenantMemberships.userId))
        .leftJoin(persons, eq(persons.id, users.personId))
        .where(and(...conditions))
        .orderBy(users.primaryEmail);

      const membershipIds = rows.map((row) => row.id);
      const rolesByMembership = new Map<string, Array<{ roleCode: string; roleName: string }>>();
      if (membershipIds.length > 0) {
        const roleRows = await tx
          .select({
            membershipId: membershipRoleAssignments.membershipId,
            roleCode: roles.code,
            roleName: roles.name,
          })
          .from(membershipRoleAssignments)
          .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
          .where(
            and(
              eq(membershipRoleAssignments.tenantId, tenantId),
              inArray(membershipRoleAssignments.membershipId, membershipIds),
              inArray(membershipRoleAssignments.status, ["ACTIVE", "PENDING"]),
            ),
          )
          .orderBy(roles.code);
        for (const role of roleRows) {
          const list = rolesByMembership.get(role.membershipId) ?? [];
          list.push({ roleCode: role.roleCode, roleName: role.roleName });
          rolesByMembership.set(role.membershipId, list);
        }
      }

      return rows.map((row) => ({
        ...row,
        roles: rolesByMembership.get(row.id) ?? [],
      }));
    });
  }

  async get(tenantId: string, membershipId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) =>
      this.loadDetail(tx, tenantId, membershipId),
    );
  }

  async getRoles(tenantId: string, membershipId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireMembership(tx, tenantId, membershipId);
      return this.loadRoles(tx, membershipId);
    });
  }

  async getProducts(tenantId: string, membershipId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireMembership(tx, tenantId, membershipId);
      return this.loadProducts(tx, membershipId);
    });
  }

  async getHistory(tenantId: string, membershipId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      await this.requireMembership(tx, tenantId, membershipId);
      return tx.query.membershipHistory.findMany({
        where: eq(membershipHistory.membershipId, membershipId),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
    });
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createMembershipInputSchema.parse(input);

    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const user = await tx.query.users.findFirst({
          where: and(eq(users.id, data.userId), eq(users.tenantId, tenantId)),
        });
        // RLS already scopes this read; the explicit tenant predicate makes the
        // cross-tenant rejection a 404 rather than an empty result downstream.
        if (!user) {
          throw new ForgeError("NOT_FOUND", "User not found in this tenant");
        }

        const existing = await tx.query.userTenantMemberships.findFirst({
          where: and(
            eq(userTenantMemberships.tenantId, tenantId),
            eq(userTenantMemberships.userId, data.userId),
          ),
        });
        if (existing) {
          throw new ForgeError("CONFLICT", "User already has a membership in this tenant");
        }

        const now = new Date();
        const membershipId = createId();
        const activating = data.status === "ACTIVE";

        await tx.insert(userTenantMemberships).values({
          id: membershipId,
          tenantId,
          userId: data.userId,
          status: data.status,
          isDefaultTenant: data.isDefaultTenant,
          activatedAt: activating ? now : null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          createdByUserId: principal.userId,
          updatedByUserId: principal.userId,
          createdAt: now,
          updatedAt: now,
        });

        await this.applyRoles(tx, {
          tenantId,
          membershipId,
          principal,
          roles: data.roleCodes.map((roleCode) => ({ roleCode, organizationId: null })),
          activate: activating,
        });
        await this.applyProductsAndModules(tx, {
          tenantId,
          membershipId,
          principal,
          productCodes: data.productCodes,
          moduleCodes: data.moduleCodes,
        });

        await this.recordHistory(tx, {
          tenantId,
          membershipId,
          action: "membership.create",
          fromStatus: null,
          toStatus: data.status,
          principal,
        });
        await this.syncAccessProjection(tx, tenantId, data.userId, data.status, data.isDefaultTenant);

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "membership",
          aggregateId: membershipId,
          eventType: DOMAIN_EVENT_TYPES.MEMBERSHIP_CREATED,
          payload: { membershipId, tenantId, userId: data.userId, status: data.status },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });
        if (activating) {
          await this.emitActivated(tx, tenantId, membershipId, data.userId, principal);
        }

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "membership.create",
          resourceType: "membership",
          resourceId: membershipId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { membershipId, userId: data.userId, status: data.status },
        });

        return this.loadDetail(tx, tenantId, membershipId);
      },
      principal.userId,
    );
  }

  // -------------------------------------------------------------------------
  // Update and transitions
  // -------------------------------------------------------------------------

  async patch(
    tenantId: string,
    membershipId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchMembershipInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await this.requireMembership(tx, tenantId, membershipId);
        const version = this.assertVersion(tenantId, membershipId, before.recordVersion, expectedVersion);

        const [updated] = await tx
          .update(userTenantMemberships)
          .set({
            ...(data.isDefaultTenant === undefined ? {} : { isDefaultTenant: data.isDefaultTenant }),
            ...(data.expiresAt === undefined
              ? {}
              : { expiresAt: data.expiresAt === null ? null : new Date(data.expiresAt) }),
            recordVersion: version + 1,
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userTenantMemberships.id, membershipId),
              eq(userTenantMemberships.recordVersion, version),
            ),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "membership",
            resourceId: membershipId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "membership.update",
          resourceType: "membership",
          resourceId: membershipId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before,
          after: updated,
        });

        return this.loadDetail(tx, tenantId, membershipId);
      },
      principal.userId,
    );
  }

  async activate(
    tenantId: string,
    membershipId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return this.transition(tenantId, membershipId, principal, expectedVersion, {
      toStatus: "ACTIVE",
      action: "membership.activate",
      riskLevel: "HIGH",
      mutate: (now) => ({
        status: "ACTIVE",
        activatedAt: now,
        suspendedAt: null,
        suspensionReason: null,
        revokedAt: null,
      }),
    });
  }

  async suspend(
    tenantId: string,
    membershipId: string,
    reason: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return this.transition(tenantId, membershipId, principal, expectedVersion, {
      toStatus: "SUSPENDED",
      action: "membership.suspend",
      riskLevel: "CRITICAL",
      reason,
      mutate: (now) => ({ status: "SUSPENDED", suspendedAt: now, suspensionReason: reason }),
    });
  }

  async revoke(
    tenantId: string,
    membershipId: string,
    reason: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    return this.transition(tenantId, membershipId, principal, expectedVersion, {
      toStatus: "REVOKED",
      action: "membership.revoke",
      riskLevel: "CRITICAL",
      reason,
      mutate: (now) => ({ status: "REVOKED", revokedAt: now, suspensionReason: reason }),
    });
  }

  private async transition(
    tenantId: string,
    membershipId: string,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
    options: {
      toStatus: MembershipStatus;
      action: string;
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      reason?: string;
      mutate: (now: Date) => Record<string, unknown>;
    },
  ) {
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const before = await this.requireMembership(tx, tenantId, membershipId);
        const fromStatus = before.status as MembershipStatus;
        const permitted = ALLOWED_TRANSITIONS[fromStatus] ?? [];
        if (!permitted.includes(options.toStatus)) {
          throw new ForgeError(
            "CONFLICT",
            `Cannot move membership from ${fromStatus} to ${options.toStatus}`,
          );
        }
        const version = this.assertVersion(
          tenantId,
          membershipId,
          before.recordVersion,
          expectedVersion,
        );
        const now = new Date();

        const [updated] = await tx
          .update(userTenantMemberships)
          .set({
            ...options.mutate(now),
            recordVersion: version + 1,
            updatedByUserId: principal.userId,
            updatedAt: now,
          })
          .where(
            and(
              eq(userTenantMemberships.id, membershipId),
              eq(userTenantMemberships.recordVersion, version),
            ),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "membership",
            resourceId: membershipId,
            expectedVersion,
            actualVersion: null,
          });
        }

        // Role grants follow the membership: activation turns them on,
        // anything else turns them off so access is lost immediately.
        await tx
          .update(membershipRoleAssignments)
          .set({
            status: options.toStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
            grantedAt: options.toStatus === "ACTIVE" ? now : null,
            updatedAt: now,
          })
          .where(
            and(
              eq(membershipRoleAssignments.membershipId, membershipId),
              isNull(membershipRoleAssignments.revokedAt),
            ),
          );

        await this.recordHistory(tx, {
          tenantId,
          membershipId,
          action: options.action,
          fromStatus,
          toStatus: options.toStatus,
          principal,
          ...(options.reason === undefined ? {} : { reason: options.reason }),
        });
        await this.syncAccessProjection(
          tx,
          tenantId,
          before.userId,
          options.toStatus,
          updated.isDefaultTenant,
        );

        // Losing access invalidates any token already issued to the user.
        if (options.toStatus !== "ACTIVE") {
          await tx
            .update(users)
            .set({
              sessionVersion: (await this.currentSessionVersion(tx, before.userId)) + 1,
              sessionsRevokedAt: now,
              updatedAt: now,
            })
            .where(eq(users.id, before.userId));
        }

        const eventType =
          options.toStatus === "ACTIVE"
            ? DOMAIN_EVENT_TYPES.MEMBERSHIP_ACTIVATED
            : options.toStatus === "SUSPENDED"
              ? DOMAIN_EVENT_TYPES.MEMBERSHIP_SUSPENDED
              : DOMAIN_EVENT_TYPES.MEMBERSHIP_REVOKED;

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "membership",
          aggregateId: membershipId,
          eventType,
          payload: {
            membershipId,
            tenantId,
            userId: before.userId,
            previousStatus: fromStatus,
            status: options.toStatus,
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: options.action,
          resourceType: "membership",
          resourceId: membershipId,
          result: "SUCCESS",
          riskLevel: options.riskLevel,
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          before,
          after: updated,
          ...(options.reason === undefined ? {} : { metadata: { reason: options.reason } }),
        });

        return this.loadDetail(tx, tenantId, membershipId);
      },
      principal.userId,
    );
  }

  // -------------------------------------------------------------------------
  // Role and entitlement grants
  // -------------------------------------------------------------------------

  async setRoles(
    tenantId: string,
    membershipId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = setMembershipRolesInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const membership = await this.requireMembership(tx, tenantId, membershipId);
        const version = this.assertVersion(
          tenantId,
          membershipId,
          membership.recordVersion,
          expectedVersion,
        );

        await tx
          .delete(membershipRoleAssignments)
          .where(eq(membershipRoleAssignments.membershipId, membershipId));

        await this.applyRoles(tx, {
          tenantId,
          membershipId,
          principal,
          roles: data.roles.map((role) => ({
            roleCode: role.roleCode,
            organizationId: role.organizationId ?? null,
          })),
          activate: membership.status === "ACTIVE",
        });

        await tx
          .update(userTenantMemberships)
          .set({ recordVersion: version + 1, updatedByUserId: principal.userId, updatedAt: new Date() })
          .where(
            and(
              eq(userTenantMemberships.id, membershipId),
              eq(userTenantMemberships.recordVersion, version),
            ),
          );

        await this.recordHistory(tx, {
          tenantId,
          membershipId,
          action: "membership.roles.set",
          fromStatus: membership.status,
          toStatus: membership.status,
          principal,
          metadata: { roleCodes: data.roles.map((r) => r.roleCode) },
        });

        await this.outbox.write(tx, {
          tenantId,
          aggregateType: "membership",
          aggregateId: membershipId,
          eventType: DOMAIN_EVENT_TYPES.MEMBERSHIP_ROLES_CHANGED,
          payload: {
            membershipId,
            tenantId,
            userId: membership.userId,
            roleCodes: data.roles.map((r) => r.roleCode),
          },
          correlationId: principal.correlationId,
          actorUserId: principal.userId,
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "membership.roles.set",
          resourceType: "membership",
          resourceId: membershipId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { roleCodes: data.roles.map((r) => r.roleCode) },
        });

        return this.loadRoles(tx, membershipId);
      },
      principal.userId,
    );
  }

  async setFacilityScope(
    tenantId: string,
    membershipId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = setMembershipFacilityScopeInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const membership = await this.requireMembership(tx, tenantId, membershipId);
        const version = this.assertVersion(
          tenantId,
          membershipId,
          membership.recordVersion,
          expectedVersion,
        );
        const unique = [...new Set(data.facilityIds)];
        if (unique.length > 0) {
          const rows = await tx
            .select({ id: facilities.id })
            .from(facilities)
            .where(and(eq(facilities.tenantId, tenantId), inArray(facilities.id, unique)));
          if (rows.length !== unique.length) {
            throw new ForgeError(
              "BAD_REQUEST",
              "One or more facilityIds do not belong to this tenant",
            );
          }
        }

        const [updated] = await tx
          .update(userTenantMemberships)
          .set({
            facilityIdsJson: unique,
            recordVersion: version + 1,
            updatedByUserId: principal.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userTenantMemberships.id, membershipId),
              eq(userTenantMemberships.recordVersion, version),
            ),
          )
          .returning();
        if (!updated) {
          throw concurrencyConflict({
            tenantId,
            resourceType: "membership",
            resourceId: membershipId,
            expectedVersion,
            actualVersion: null,
          });
        }

        await this.recordHistory(tx, {
          tenantId,
          membershipId,
          action: "membership.facility_scope.set",
          fromStatus: membership.status,
          toStatus: membership.status,
          principal,
          metadata: { facilityIds: unique },
        });

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "membership.facility_scope.set",
          resourceType: "membership",
          resourceId: membershipId,
          result: "SUCCESS",
          riskLevel: "MEDIUM",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { facilityIds: unique },
        });

        return this.loadDetail(tx, tenantId, membershipId);
      },
      principal.userId,
    );
  }

  async setProducts(
    tenantId: string,
    membershipId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = setMembershipProductsInputSchema.parse(input);
    return withTenantTransaction(
      this.db,
      tenantId,
      async (tx) => {
        const membership = await this.requireMembership(tx, tenantId, membershipId);
        const version = this.assertVersion(
          tenantId,
          membershipId,
          membership.recordVersion,
          expectedVersion,
        );

        await tx
          .delete(membershipProductAccess)
          .where(eq(membershipProductAccess.membershipId, membershipId));
        await tx
          .delete(membershipModuleAccess)
          .where(eq(membershipModuleAccess.membershipId, membershipId));

        await this.applyProductsAndModules(tx, {
          tenantId,
          membershipId,
          principal,
          productCodes: data.productCodes,
          moduleCodes: data.moduleCodes,
        });

        await tx
          .update(userTenantMemberships)
          .set({ recordVersion: version + 1, updatedByUserId: principal.userId, updatedAt: new Date() })
          .where(
            and(
              eq(userTenantMemberships.id, membershipId),
              eq(userTenantMemberships.recordVersion, version),
            ),
          );

        await this.audit.writeInTransaction(tx, {
          tenantId,
          actorUserId: principal.userId,
          actorPersonId: principal.personId,
          actorType: "USER",
          action: "membership.products.set",
          resourceType: "membership",
          resourceId: membershipId,
          result: "SUCCESS",
          riskLevel: "HIGH",
          correlationId: principal.correlationId,
          requestId: principal.requestId,
          after: { productCodes: data.productCodes, moduleCodes: data.moduleCodes },
        });

        return this.loadProducts(tx, membershipId);
      },
      principal.userId,
    );
  }

  // -------------------------------------------------------------------------
  // Shared internals (also used by the invitation acceptance flow)
  // -------------------------------------------------------------------------

  /**
   * Creates role grants for a membership after checking that the caller is
   * allowed to hand them out. Tenant administrators may not grant creator-only
   * permissions, nor any permission they do not themselves hold.
   */
  async applyRoles(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      membershipId: string;
      principal: ForgePrincipal;
      roles: ReadonlyArray<{ roleCode: string; organizationId: string | null }>;
      activate: boolean;
    },
  ): Promise<void> {
    if (input.roles.length === 0) {
      return;
    }
    const codes = [...new Set(input.roles.map((r) => r.roleCode))];
    const roleRows = await tx
      .select({ id: roles.id, code: roles.code, organizationId: roles.organizationId })
      .from(roles)
      .where(and(eq(roles.tenantId, input.tenantId), inArray(roles.code, codes)));

    const roleByCode = new Map(roleRows.map((row) => [row.code, row]));
    const missing = codes.filter((code) => !roleByCode.has(code));
    if (missing.length > 0) {
      throw new ForgeError("NOT_FOUND", `Unknown role code: ${missing.join(", ")}`);
    }

    await this.assertGrantable(tx, input.principal, [...roleByCode.values()].map((r) => r.id));

    const now = new Date();
    for (const requested of input.roles) {
      const role = roleByCode.get(requested.roleCode)!;
      await tx
        .insert(membershipRoleAssignments)
        .values({
          id: createId(),
          tenantId: input.tenantId,
          membershipId: input.membershipId,
          roleId: role.id,
          organizationId: requested.organizationId,
          status: input.activate ? "ACTIVE" : "PENDING",
          grantedByUserId: input.principal.userId,
          grantedAt: input.activate ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }
  }

  /** Rejects escalation: a non-platform caller cannot grant beyond its own set. */
  private async assertGrantable(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    roleIds: string[],
  ): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }
    const granted = await tx
      .select({ code: permissions.code, effect: rolePermissions.effect })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(inArray(rolePermissions.roleId, roleIds));

    for (const row of granted) {
      if (row.effect === "DENY") {
        continue;
      }
      if (isCreatorOnlyPermission(row.code) && !principal.isPlatformAdmin) {
        throw new ForgeError(
          "FORBIDDEN",
          "Tenant administrators cannot grant creator permissions",
        );
      }
      if (!principal.isPlatformAdmin && !principal.permissions.has(row.code)) {
        throw new ForgeError(
          "FORBIDDEN",
          "Cannot grant a permission the caller does not hold",
        );
      }
    }
  }

  /**
   * Grants product and module access, intersected with what the tenant is
   * actually entitled to. A membership can never exceed its tenant.
   *
   * When productCodes is empty, grants every ACTIVE tenant product so newly
   * provisioned memberships are usable without manual post-provision patching.
   * Explicit empty arrays after a non-empty replace still clear via callers that
   * delete rows first; this path only fills defaults on create/invite when omitted.
   */
  async applyProductsAndModules(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      membershipId: string;
      principal: ForgePrincipal;
      productCodes: readonly string[];
      moduleCodes: readonly string[];
      /** When true (default), empty productCodes expands to the tenant catalog. */
      defaultToTenantProducts?: boolean;
    },
  ): Promise<void> {
    const now = new Date();
    const defaultToTenantProducts = input.defaultToTenantProducts !== false;

    let productCodes = [...input.productCodes];
    if (productCodes.length === 0 && defaultToTenantProducts) {
      const catalog = await tx
        .select({ code: platformProducts.code })
        .from(tenantProducts)
        .innerJoin(platformProducts, eq(platformProducts.id, tenantProducts.productId))
        .where(and(eq(tenantProducts.tenantId, input.tenantId), eq(tenantProducts.status, "ACTIVE")));
      productCodes = catalog.map((row) => row.code);
    }

    if (productCodes.length > 0) {
      const entitled = await tx
        .select({ id: platformProducts.id, code: platformProducts.code })
        .from(tenantProducts)
        .innerJoin(platformProducts, eq(platformProducts.id, tenantProducts.productId))
        .where(
          and(
            eq(tenantProducts.tenantId, input.tenantId),
            eq(tenantProducts.status, "ACTIVE"),
            inArray(platformProducts.code, productCodes),
          ),
        );
      const entitledCodes = new Set(entitled.map((row) => row.code));
      const notEntitled = productCodes.filter((code) => !entitledCodes.has(code));
      if (notEntitled.length > 0) {
        throw new ForgeError(
          "ENTITLEMENT_REQUIRED",
          `Tenant is not entitled to product: ${notEntitled.join(", ")}`,
        );
      }
      for (const product of entitled) {
        await tx
          .insert(membershipProductAccess)
          .values({
            id: createId(),
            tenantId: input.tenantId,
            membershipId: input.membershipId,
            productId: product.id,
            status: "ACTIVE",
            grantedByUserId: input.principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
    }

    let moduleCodes = [...input.moduleCodes];
    if (moduleCodes.length === 0 && defaultToTenantProducts && productCodes.length > 0) {
      const catalog = await tx
        .select({ code: platformModules.code })
        .from(tenantModuleEntitlements)
        .innerJoin(platformModules, eq(platformModules.id, tenantModuleEntitlements.moduleId))
        .where(
          and(
            eq(tenantModuleEntitlements.tenantId, input.tenantId),
            inArray(tenantModuleEntitlements.status, ["ACTIVE", "GRACE"]),
          ),
        );
      moduleCodes = catalog.map((row) => row.code);
    }

    if (moduleCodes.length > 0) {
      const entitled = await tx
        .select({ id: platformModules.id, code: platformModules.code })
        .from(tenantModuleEntitlements)
        .innerJoin(platformModules, eq(platformModules.id, tenantModuleEntitlements.moduleId))
        .where(
          and(
            eq(tenantModuleEntitlements.tenantId, input.tenantId),
            inArray(tenantModuleEntitlements.status, ["ACTIVE", "GRACE"]),
            inArray(platformModules.code, moduleCodes),
          ),
        );
      const entitledCodes = new Set(entitled.map((row) => row.code));
      const notEntitled = moduleCodes.filter((code) => !entitledCodes.has(code));
      if (notEntitled.length > 0) {
        throw new ForgeError(
          "ENTITLEMENT_REQUIRED",
          `Tenant is not entitled to module: ${notEntitled.join(", ")}`,
        );
      }
      for (const mod of entitled) {
        await tx
          .insert(membershipModuleAccess)
          .values({
            id: createId(),
            tenantId: input.tenantId,
            membershipId: input.membershipId,
            moduleId: mod.id,
            status: "ACTIVE",
            grantedByUserId: input.principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
    }
  }

  /** Activates a membership from inside another aggregate's transaction. */
  async activateInTransaction(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      membershipId: string;
      userId: string;
      principal: ForgePrincipal;
    },
  ): Promise<void> {
    const now = new Date();
    const current = await tx.query.userTenantMemberships.findFirst({
      where: eq(userTenantMemberships.id, input.membershipId),
    });
    if (!current) {
      throw new ForgeError("NOT_FOUND", "Membership not found");
    }

    await tx
      .update(userTenantMemberships)
      .set({
        status: "ACTIVE",
        activatedAt: now,
        recordVersion: current.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(userTenantMemberships.id, input.membershipId));

    await tx
      .update(membershipRoleAssignments)
      .set({ status: "ACTIVE", grantedAt: now, updatedAt: now })
      .where(
        and(
          eq(membershipRoleAssignments.membershipId, input.membershipId),
          isNull(membershipRoleAssignments.revokedAt),
        ),
      );

    await this.recordHistory(tx, {
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      action: "membership.activate",
      fromStatus: current.status,
      toStatus: "ACTIVE",
      principal: input.principal,
    });
    await this.syncAccessProjection(
      tx,
      input.tenantId,
      input.userId,
      "ACTIVE",
      current.isDefaultTenant,
    );
    await this.emitActivated(tx, input.tenantId, input.membershipId, input.userId, input.principal);
  }

  async recordHistory(
    tx: DatabaseTransaction,
    input: {
      tenantId: string;
      membershipId: string;
      action: string;
      fromStatus: string | null;
      toStatus: string;
      principal: ForgePrincipal;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    await tx.insert(membershipHistory).values({
      id: createId(),
      tenantId: input.tenantId,
      membershipId: input.membershipId,
      action: input.action,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      reason: input.reason ?? null,
      changedByUserId: input.principal.userId,
      correlationId: input.principal.correlationId,
      metadataJson: input.metadata ?? {},
      createdAt: new Date(),
    });
  }

  private async emitActivated(
    tx: DatabaseTransaction,
    tenantId: string,
    membershipId: string,
    userId: string,
    principal: ForgePrincipal,
  ): Promise<void> {
    await this.outbox.write(tx, {
      tenantId,
      aggregateType: "membership",
      aggregateId: membershipId,
      eventType: DOMAIN_EVENT_TYPES.MEMBERSHIP_ACTIVATED,
      payload: { membershipId, tenantId, userId, status: "ACTIVE" },
      correlationId: principal.correlationId,
      actorUserId: principal.userId,
    });
  }

  /**
   * Keeps the Sprint 1D `user_tenant_access` table aligned with the membership
   * aggregate so existing authorization reads stay correct during the transition.
   */
  private async syncAccessProjection(
    tx: DatabaseTransaction,
    tenantId: string,
    userId: string,
    membershipStatus: string,
    isDefaultTenant: boolean,
  ): Promise<void> {
    const accessStatus = membershipStatus === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
    const now = new Date();
    const existing = await tx.query.userTenantAccess.findFirst({
      where: and(eq(userTenantAccess.tenantId, tenantId), eq(userTenantAccess.userId, userId)),
    });
    if (existing) {
      await tx
        .update(userTenantAccess)
        .set({ status: accessStatus, isDefaultTenant, updatedAt: now })
        .where(eq(userTenantAccess.id, existing.id));
      return;
    }
    await tx.insert(userTenantAccess).values({
      id: createId(),
      tenantId,
      userId,
      status: accessStatus,
      isDefaultTenant,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async currentSessionVersion(tx: DatabaseTransaction, userId: string): Promise<number> {
    const row = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    return row?.sessionVersion ?? 1;
  }

  private assertVersion(
    tenantId: string,
    membershipId: string,
    current: number,
    expected: ExpectedVersion,
  ): number {
    if (expected !== "*" && current !== expected) {
      throw concurrencyConflict({
        tenantId,
        resourceType: "membership",
        resourceId: membershipId,
        expectedVersion: expected,
        actualVersion: current,
      });
    }
    return current;
  }

  private async requireMembership(
    tx: DatabaseTransaction,
    tenantId: string,
    membershipId: string,
  ) {
    const row = await tx.query.userTenantMemberships.findFirst({
      where: and(
        eq(userTenantMemberships.id, membershipId),
        eq(userTenantMemberships.tenantId, tenantId),
      ),
    });
    if (!row) {
      throw new ForgeError("NOT_FOUND", "Membership not found");
    }
    return row;
  }

  private async loadDetail(tx: DatabaseTransaction, tenantId: string, membershipId: string) {
    const membership = await this.requireMembership(tx, tenantId, membershipId);
    const user = await tx.query.users.findFirst({ where: eq(users.id, membership.userId) });
    const person = user?.personId
      ? await tx.query.persons.findFirst({ where: eq(persons.id, user.personId) })
      : undefined;
    const [roleRows, access] = await Promise.all([
      this.loadRoles(tx, membershipId),
      this.loadProducts(tx, membershipId),
    ]);
    return {
      ...membership,
      email: user?.primaryEmail ?? null,
      userStatus: user?.status ?? null,
      username: user?.username ?? null,
      personId: user?.personId ?? null,
      lastLoginAt: user?.lastLoginAt ?? null,
      displayName: person?.displayName ?? null,
      firstName: person?.firstName ?? null,
      lastName: person?.lastName ?? null,
      roles: roleRows,
      products: access.products,
      modules: access.modules,
    };
  }

  private async loadRoles(tx: DatabaseTransaction, membershipId: string) {
    return tx
      .select({
        id: membershipRoleAssignments.id,
        roleId: membershipRoleAssignments.roleId,
        roleCode: roles.code,
        roleName: roles.name,
        organizationId: membershipRoleAssignments.organizationId,
        status: membershipRoleAssignments.status,
        grantedAt: membershipRoleAssignments.grantedAt,
        revokedAt: membershipRoleAssignments.revokedAt,
      })
      .from(membershipRoleAssignments)
      .innerJoin(roles, eq(roles.id, membershipRoleAssignments.roleId))
      .where(eq(membershipRoleAssignments.membershipId, membershipId))
      .orderBy(roles.code);
  }

  private async loadProducts(tx: DatabaseTransaction, membershipId: string) {
    const products = await tx
      .select({
        id: membershipProductAccess.id,
        productId: membershipProductAccess.productId,
        code: platformProducts.code,
        name: platformProducts.name,
        status: membershipProductAccess.status,
      })
      .from(membershipProductAccess)
      .innerJoin(platformProducts, eq(platformProducts.id, membershipProductAccess.productId))
      .where(eq(membershipProductAccess.membershipId, membershipId))
      .orderBy(platformProducts.code);

    const modules = await tx
      .select({
        id: membershipModuleAccess.id,
        moduleId: membershipModuleAccess.moduleId,
        code: platformModules.code,
        name: platformModules.name,
        status: membershipModuleAccess.status,
      })
      .from(membershipModuleAccess)
      .innerJoin(platformModules, eq(platformModules.id, membershipModuleAccess.moduleId))
      .where(eq(membershipModuleAccess.membershipId, membershipId))
      .orderBy(platformModules.code);

    return { products, modules };
  }
}
