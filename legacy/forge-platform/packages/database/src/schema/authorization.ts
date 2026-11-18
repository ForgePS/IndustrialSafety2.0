import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { organizations } from "./organizations.js";
import { permissions, roleTemplates } from "./platform.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    roleTemplateId: uuid("role_template_id").references(() => roleTemplates.id),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    isSystemManaged: boolean("is_system_managed").notNull().default(false),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    // NULLS NOT DISTINCT applied in migration SQL for null-safe (tenant, org, code).
    uniqueIndex("roles_tenant_org_code_uidx").on(table.tenantId, table.organizationId, table.code),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
    effect: varchar("effect", { length: 16 }).notNull().default("ALLOW"),
    conditionsJson: jsonb("conditions_json"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("role_permissions_role_perm_effect_uidx").on(
      table.roleId,
      table.permissionId,
      table.effect,
    ),
  ],
);

export const userRoleAssignments = pgTable("user_role_assignments", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  roleId: uuid("role_id")
    .notNull()
    .references(() => roles.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  grantedByUserId: uuid("granted_by_user_id")
    .notNull()
    .references(() => users.id),
  reason: text("reason"),
  createdAt: createdAtColumn,
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
});

export const authorizationDecisionLog = pgTable("authorization_decision_log", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  permissionCode: varchar("permission_code", { length: 128 }).notNull(),
  resourceType: varchar("resource_type", { length: 128 }).notNull(),
  resourceId: uuid("resource_id"),
  decision: varchar("decision", { length: 32 }).notNull(),
  reasonCode: varchar("reason_code", { length: 128 }).notNull(),
  contextJson: jsonb("context_json").notNull().default({}),
  correlationId: varchar("correlation_id", { length: 128 }).notNull(),
  createdAt: createdAtColumn,
});
