import {
  boolean,
  date,
  index,
  integer,
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
import { persons } from "./persons.js";
import { tenants } from "./tenants.js";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personId: uuid("person_id").references(() => persons.id),
    username: varchar("username", { length: 100 }),
    primaryEmail: varchar("primary_email", { length: 320 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("INVITED"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /**
     * Last authenticated API activity. Used for messaging/platform online indicators.
     * Updated on a throttle from AuthContextService; cleared on logout-all.
     */
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    /** Monotonic counter bumped alongside every session revocation (ADR-029). */
    sessionVersion: integer("session_version").notNull().default(1),
    /**
     * Access tokens issued before this instant are refused. Set by logout-all,
     * account disablement and membership suspension (ADR-029).
     */
    sessionsRevokedAt: timestamp("sessions_revoked_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lastFailedLoginAt: timestamp("last_failed_login_at", { withTimezone: true }),
    lastAuthFailureReason: varchar("last_auth_failure_reason", { length: 64 }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("users_tenant_email_uidx").on(table.tenantId, table.primaryEmail),
  ],
);

export const authenticationIdentities = pgTable(
  "authentication_identities",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerSubject: varchar("provider_subject", { length: 255 }).notNull(),
    providerTenant: varchar("provider_tenant", { length: 255 }),
    emailAtLinkTime: varchar("email_at_link_time", { length: 320 }),
    createdAt: createdAtColumn,
    lastAuthenticatedAt: timestamp("last_authenticated_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("authentication_identities_provider_subject_uidx").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

/**
 * Invitation aggregate (ADR-020).
 * States: DRAFT, PENDING, SENT, ACCEPTED, EXPIRED, REVOKED, FAILED.
 * A partial unique index (see migration 0003) permits only one non-terminal
 * invitation per tenant and email.
 */
export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 320 }).notNull(),
    personId: uuid("person_id").references(() => persons.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    /** SHA-256 of the invitation token. The token itself is never stored. */
    invitationTokenHash: varchar("invitation_token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    roleCodesJson: jsonb("role_codes_json").notNull().default([]),
    productCodesJson: jsonb("product_codes_json").notNull().default([]),
    moduleCodesJson: jsonb("module_codes_json").notNull().default([]),
    /** Tenant-owned facility IDs granted with the invitation (MK-S6). */
    facilityIdsJson: jsonb("facility_ids_json").notNull().default([]),
    cognitoUsername: varchar("cognito_username", { length: 255 }),
    cognitoSubject: varchar("cognito_subject", { length: 255 }),
    // FK added in SQL to avoid a schema module cycle with user_tenant_memberships.
    membershipId: uuid("membership_id"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    resendCount: integer("resend_count").notNull().default(0),
    lastResentAt: timestamp("last_resent_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Redacted failure summary. Never contains Cognito credentials or tokens. */
    failureReason: text("failure_reason"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("user_invitations_token_hash_uidx").on(table.invitationTokenHash),
    index("user_invitations_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    membershipType: varchar("membership_type", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isPrimary: boolean("is_primary").notNull().default(false),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("organization_memberships_org_person_type_uidx").on(
      table.organizationId,
      table.personId,
      table.membershipType,
    ),
  ],
);

export const userTenantAccess = pgTable(
  "user_tenant_access",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    isDefaultTenant: boolean("is_default_tenant").notNull().default(false),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("user_tenant_access_tenant_user_uidx").on(table.tenantId, table.userId),
  ],
);
