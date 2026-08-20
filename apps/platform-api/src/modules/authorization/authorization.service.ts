import { Inject, Injectable } from "@nestjs/common";
import {
  evaluateAuthorization,
  type AuthorizationDecision,
} from "@forge/authorization";
import { isCreatorOnlyPermission } from "@forge/contracts";
import {
  createId,
  permissions,
  rolePermissions,
  roles,
  userRoleAssignments,
  type Database,
  type DatabaseTransaction,
  withTenantTransaction,
} from "@forge/database";
import { ForgeError } from "@forge/errors";
import { DOMAIN_EVENT_TYPES } from "@forge/events";
import type { ForgePrincipal } from "@forge/tenant-context";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { concurrencyConflict } from "../../common/concurrency.js";
import { DATABASE } from "../../tokens.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthContextService } from "../auth-context/auth-context.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type ExpectedVersion = number | "*";

const createRoleSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  organizationId: z.string().uuid().optional(),
});

const patchRoleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const setPermissionsSchema = z.object({
  permissionCodes: z.array(z.string().min(1)).min(0),
});

const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  reason: z.string().max(2000).optional(),
});

const checkSchema = z.object({
  permissionCode: z.string().min(1),
  resourceType: z.string().min(1),
  resourceTenantId: z.string().uuid(),
  resourceOrganizationId: z.string().uuid().optional().nullable(),
});

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly authContext: AuthContextService,
  ) {}

  async listPermissions() {
    return this.db.query.permissions.findMany({
      orderBy: (t, { asc }) => [asc(t.code)],
    });
  }

  async createRole(tenantId: string, input: unknown, principal: ForgePrincipal) {
    const data = createRoleSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const id = createId();
      const now = new Date();
      const [row] = await tx
        .insert(roles)
        .values({
          id,
          tenantId,
          organizationId: data.organizationId,
          code: data.code,
          name: data.name,
          description: data.description,
          status: "ACTIVE",
          isSystemManaged: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!row) {
        throw new ForgeError("INTERNAL_ERROR", "Failed to create role");
      }
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "role.create",
        resourceType: "role",
        resourceId: id,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: row,
      });
      return row;
    }, principal.userId);
  }

  async listRoles(tenantId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const roleRows = await tx.query.roles.findMany({
        where: eq(roles.tenantId, tenantId),
        orderBy: (t, { asc }) => [asc(t.code)],
      });
      if (roleRows.length === 0) return [];
      const permRows = await tx
        .select({
          roleId: rolePermissions.roleId,
          code: permissions.code,
          name: permissions.name,
          effect: rolePermissions.effect,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(
          inArray(
            rolePermissions.roleId,
            roleRows.map((row) => row.id),
          ),
        )
        .orderBy(permissions.code);
      const byRole = new Map<string, Array<{ code: string; name: string; effect: string }>>();
      for (const perm of permRows) {
        const list = byRole.get(perm.roleId) ?? [];
        list.push({ code: perm.code, name: perm.name, effect: perm.effect });
        byRole.set(perm.roleId, list);
      }
      return roleRows.map((row) => ({
        ...row,
        permissions: byRole.get(row.id) ?? [],
      }));
    });
  }

  async getRole(tenantId: string, roleId: string) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const role = await tx.query.roles.findFirst({
        where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
      });
      if (!role) {
        throw new ForgeError("NOT_FOUND", "Role not found");
      }
      const perms = await tx
        .select({
          code: permissions.code,
          effect: rolePermissions.effect,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, roleId));
      return { ...role, permissions: perms };
    });
  }

  async patchRole(
    tenantId: string,
    roleId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = patchRoleSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const before = await tx.query.roles.findFirst({
        where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
      });
      if (!before) {
        throw new ForgeError("NOT_FOUND", "Role not found");
      }
      if (before.isSystemManaged) {
        throw new ForgeError("FORBIDDEN", "System-managed roles cannot be modified");
      }
      const version = before.recordVersion;
      if (expectedVersion !== "*" && version !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "role",
          resourceId: roleId,
          expectedVersion,
          actualVersion: version,
        });
      }
      const [updated] = await tx
        .update(roles)
        .set({ ...data, recordVersion: version + 1, updatedAt: new Date() })
        .where(and(eq(roles.id, roleId), eq(roles.recordVersion, version)))
        .returning();
      if (!updated) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "role",
          resourceId: roleId,
          expectedVersion,
          actualVersion: null,
        });
      }
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "role.update",
        resourceType: "role",
        resourceId: roleId,
        result: "SUCCESS",
        riskLevel: "MEDIUM",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: updated,
      });
      return updated;
    }, principal.userId);
  }

  async setRolePermissions(
    tenantId: string,
    roleId: string,
    input: unknown,
    principal: ForgePrincipal,
    expectedVersion: ExpectedVersion,
  ) {
    const data = setPermissionsSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const role = await tx.query.roles.findFirst({
        where: and(eq(roles.id, roleId), eq(roles.tenantId, tenantId)),
      });
      if (!role) {
        throw new ForgeError("NOT_FOUND", "Role not found");
      }
      if (role.isSystemManaged) {
        throw new ForgeError(
          "FORBIDDEN",
          "System-managed role permissions cannot be modified",
        );
      }
      this.assertPermissionCodesAssignable(principal, data.permissionCodes);
      const version = role.recordVersion;
      if (expectedVersion !== "*" && version !== expectedVersion) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "role",
          resourceId: roleId,
          expectedVersion,
          actualVersion: version,
        });
      }
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      if (data.permissionCodes.length > 0) {
        const permRows = await tx.query.permissions.findMany({
          where: inArray(permissions.code, data.permissionCodes),
        });
        if (permRows.length !== data.permissionCodes.length) {
          throw new ForgeError("BAD_REQUEST", "One or more permission codes are invalid");
        }
        await tx.insert(rolePermissions).values(
          permRows.map((p) => ({
            roleId,
            permissionId: p.id,
            effect: "ALLOW" as const,
            createdAt: new Date(),
          })),
        );
      }
      // Permission sets are versioned through their parent role's recordVersion.
      const [updated] = await tx
        .update(roles)
        .set({ recordVersion: version + 1, updatedAt: new Date() })
        .where(and(eq(roles.id, roleId), eq(roles.recordVersion, version)))
        .returning();
      if (!updated) {
        throw concurrencyConflict({
          tenantId,
          resourceType: "role",
          resourceId: roleId,
          expectedVersion,
          actualVersion: null,
        });
      }
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "role.permissions.set",
        resourceType: "role",
        resourceId: roleId,
        result: "SUCCESS",
        riskLevel: "HIGH",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: { permissionCodes: data.permissionCodes },
      });
      return {
        ...updated,
        permissions: data.permissionCodes.map((code) => ({ code, effect: "ALLOW" })),
      };
    }, principal.userId);
  }

  async assignRole(
    tenantId: string,
    userId: string,
    input: unknown,
    principal: ForgePrincipal,
  ) {
    const data = assignRoleSchema.parse(input);
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const role = await tx.query.roles.findFirst({
        where: and(eq(roles.id, data.roleId), eq(roles.tenantId, tenantId)),
      });
      if (!role) {
        throw new ForgeError("NOT_FOUND", "Role not found");
      }
      await this.assertRoleAssignable(tx, principal, data.roleId);
      const id = createId();
      const [row] = await tx
        .insert(userRoleAssignments)
        .values({
          id,
          tenantId,
          userId,
          roleId: data.roleId,
          organizationId: data.organizationId,
          grantedByUserId: principal.userId,
          reason: data.reason,
          createdAt: new Date(),
        })
        .returning();

      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "user_role_assignment",
        aggregateId: id,
        eventType: DOMAIN_EVENT_TYPES.ROLE_ASSIGNED,
        payload: { assignmentId: id, userId, roleId: data.roleId, tenantId },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      await this.audit.writeInTransaction(tx, {
        tenantId,
        actorUserId: principal.userId,
        actorPersonId: principal.personId,
        actorType: "USER",
        action: "role.assign",
        resourceType: "user_role_assignment",
        resourceId: id,
        result: "SUCCESS",
        riskLevel: "HIGH",
        correlationId: principal.correlationId,
        requestId: principal.requestId,
        after: row,
      });
      return row;
    }, principal.userId);
  }

  async revokeRole(
    tenantId: string,
    userId: string,
    assignmentId: string,
    principal: ForgePrincipal,
  ) {
    return withTenantTransaction(this.db, tenantId, async (tx) => {
      const [updated] = await tx
        .update(userRoleAssignments)
        .set({
          revokedAt: new Date(),
          revokedByUserId: principal.userId,
        })
        .where(
          and(
            eq(userRoleAssignments.id, assignmentId),
            eq(userRoleAssignments.tenantId, tenantId),
            eq(userRoleAssignments.userId, userId),
            isNull(userRoleAssignments.revokedAt),
          ),
        )
        .returning();
      if (!updated) {
        throw new ForgeError("NOT_FOUND", "Role assignment not found");
      }
      await this.outbox.write(tx, {
        tenantId,
        aggregateType: "user_role_assignment",
        aggregateId: assignmentId,
        eventType: DOMAIN_EVENT_TYPES.ROLE_REVOKED,
        payload: { assignmentId, userId, tenantId },
        correlationId: principal.correlationId,
        actorUserId: principal.userId,
      });
      return updated;
    }, principal.userId);
  }

  async check(input: unknown, principal: ForgePrincipal): Promise<AuthorizationDecision> {
    const data = checkSchema.parse(input);
    const operational = await this.authContext.getTenantOperationalState(data.resourceTenantId);
    return evaluateAuthorization({
      principal,
      permissionCode: data.permissionCode,
      resourceType: data.resourceType,
      resourceTenantId: data.resourceTenantId,
      resourceOrganizationId: data.resourceOrganizationId ?? null,
      tenantOperationalState: operational,
      roleEffects: [{ effect: "ALLOW", organizationId: null }],
      allowWhenSuspended: data.permissionCode.startsWith("platform.tenant"),
    });
  }

  /**
   * MK-S21: prevent privilege escalation by swapping permissions onto an already-held role.
   * Mirrors memberships.assertGrantable.
   */
  private assertPermissionCodesAssignable(
    principal: ForgePrincipal,
    permissionCodes: readonly string[],
  ): void {
    for (const code of permissionCodes) {
      if (isCreatorOnlyPermission(code) && !principal.isPlatformAdmin) {
        throw new ForgeError(
          "FORBIDDEN",
          "Tenant administrators cannot assign creator permissions to roles",
        );
      }
      if (!principal.isPlatformAdmin && !principal.permissions.has(code)) {
        throw new ForgeError(
          "FORBIDDEN",
          "Cannot assign a permission the caller does not hold",
        );
      }
    }
  }

  private async assertRoleAssignable(
    tx: DatabaseTransaction,
    principal: ForgePrincipal,
    roleId: string,
  ): Promise<void> {
    const granted = await tx
      .select({ code: permissions.code, effect: rolePermissions.effect })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));
    this.assertPermissionCodesAssignable(
      principal,
      granted.filter((row) => row.effect !== "DENY").map((row) => row.code),
    );
  }
}
