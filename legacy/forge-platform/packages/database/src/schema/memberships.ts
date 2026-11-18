import {
  boolean,
  index,
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
import { platformModules, platformProducts } from "./platform.js";
import { roles } from "./authorization.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Authoritative record of a user's access to a tenant (ADR-021).
 * Only ACTIVE grants access. `user_tenant_access` is kept as a compatibility
 * projection maintained by the membership service.
 */
export const userTenantMemberships = pgTable(
  "user_tenant_memberships",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    isDefaultTenant: boolean("is_default_tenant").notNull().default(false),
    // FK added in SQL to avoid a schema module cycle with user_invitations.
    invitationId: uuid("invitation_id"),
    /** Tenant-owned facility IDs scoping this membership (MK-S6). */
    facilityIdsJson: jsonb("facility_ids_json").notNull().default([]),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspensionReason: text("suspension_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("user_tenant_memberships_tenant_user_uidx").on(table.tenantId, table.userId),
    index("user_tenant_memberships_user_status_idx").on(table.userId, table.status),
  ],
);

/** Roles granted through a membership. Activated only after membership activation. */
export const membershipRoleAssignments = pgTable(
  "membership_role_assignments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => userTenantMemberships.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    // NULLS NOT DISTINCT applied in SQL so a tenant-wide grant is unique too.
    uniqueIndex("membership_role_assignments_membership_role_org_uidx").on(
      table.membershipId,
      table.roleId,
      table.organizationId,
    ),
  ],
);

/** Product access granted through a membership; intersected with tenant entitlements. */
export const membershipProductAccess = pgTable(
  "membership_product_access",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => userTenantMemberships.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => platformProducts.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("membership_product_access_membership_product_uidx").on(
      table.membershipId,
      table.productId,
    ),
  ],
);

/** Module access granted through a membership; intersected with tenant entitlements. */
export const membershipModuleAccess = pgTable(
  "membership_module_access",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => userTenantMemberships.id),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => platformModules.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    grantedByUserId: uuid("granted_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("membership_module_access_membership_module_uidx").on(
      table.membershipId,
      table.moduleId,
    ),
  ],
);

/** Append-only membership transition log. Never updated or deleted by the application. */
export const membershipHistory = pgTable(
  "membership_history",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => userTenantMemberships.id),
    action: varchar("action", { length: 64 }).notNull(),
    fromStatus: varchar("from_status", { length: 32 }),
    toStatus: varchar("to_status", { length: 32 }).notNull(),
    reason: text("reason"),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id),
    correlationId: varchar("correlation_id", { length: 128 }).notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("membership_history_membership_created_idx").on(table.membershipId, table.createdAt),
  ],
);
