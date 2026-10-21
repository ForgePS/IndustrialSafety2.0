import {
  boolean,
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
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/** Mass-notification emergency alert (SMS / Mvix CAP / in-app). */
export const industrialEmergencyAlerts = pgTable(
  "industrial_emergency_alerts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertNumber: varchar("alert_number", { length: 64 }).notNull(),
    alertType: varchar("alert_type", { length: 64 }).notNull().default("GENERAL"),
    severity: varchar("severity", { length: 32 }).notNull().default("SEVERE"),
    headline: varchar("headline", { length: 300 }).notNull(),
    shortMessage: varchar("short_message", { length: 500 }).notNull(),
    detailedMessage: text("detailed_message"),
    instructions: text("instructions"),
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    isDrill: boolean("is_drill").notNull().default(false),
    requiresAcknowledgment: boolean("requires_acknowledgment").notNull().default(false),
    audienceJson: jsonb("audience_json").notNull().default({}),
    channelsJson: jsonb("channels_json").notNull().default(["SMS", "IN_APP", "MVIX"]),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alerts_tenant_number_uidx").on(
      table.tenantId,
      table.alertNumber,
    ),
    index("industrial_emergency_alerts_tenant_status_idx").on(
      table.tenantId,
      table.status,
      table.issuedAt,
    ),
    index("industrial_emergency_alerts_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const industrialEmergencyAlertVersions = pgTable(
  "industrial_emergency_alert_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => industrialEmergencyAlerts.id),
    versionNumber: integer("version_number").notNull(),
    changeType: varchar("change_type", { length: 32 }).notNull().default("ISSUE"),
    headline: varchar("headline", { length: 300 }).notNull(),
    shortMessage: varchar("short_message", { length: 500 }).notNull(),
    detailedMessage: text("detailed_message"),
    instructions: text("instructions"),
    severity: varchar("severity", { length: 32 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alert_versions_uidx").on(
      table.alertId,
      table.versionNumber,
    ),
    index("industrial_emergency_alert_versions_tenant_idx").on(table.tenantId, table.alertId),
  ],
);

export const industrialEmergencyAlertTemplates = pgTable(
  "industrial_emergency_alert_templates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    alertType: varchar("alert_type", { length: 64 }).notNull().default("GENERAL"),
    severity: varchar("severity", { length: 32 }).notNull().default("SEVERE"),
    headline: varchar("headline", { length: 300 }).notNull(),
    shortMessage: varchar("short_message", { length: 500 }).notNull(),
    detailedMessage: text("detailed_message"),
    instructions: text("instructions"),
    channelsJson: jsonb("channels_json").notNull().default(["SMS", "IN_APP", "MVIX"]),
    requiresAcknowledgment: boolean("requires_acknowledgment").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("industrial_emergency_alert_templates_tenant_idx").on(table.tenantId, table.enabled),
  ],
);

export const industrialEmergencyAlertRecipients = pgTable(
  "industrial_emergency_alert_recipients",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => industrialEmergencyAlerts.id),
    userId: uuid("user_id").references(() => users.id),
    personnelId: uuid("personnel_id"),
    recipientType: varchar("recipient_type", { length: 32 }).notNull().default("EMPLOYEE"),
    locationId: uuid("location_id"),
    departmentId: uuid("department_id"),
    phoneNumberSnapshot: varchar("phone_number_snapshot", { length: 32 }),
    smsEligible: boolean("sms_eligible").notNull().default(false),
    exclusionReason: varchar("exclusion_reason", { length: 200 }),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("industrial_emergency_alert_recipients_alert_idx").on(table.alertId),
    index("industrial_emergency_alert_recipients_tenant_idx").on(table.tenantId, table.alertId),
  ],
);

export const industrialEmergencyAlertChannels = pgTable(
  "industrial_emergency_alert_channels",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => industrialEmergencyAlerts.id),
    channel: varchar("channel", { length: 32 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    targetCount: integer("target_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alert_channels_uidx").on(table.alertId, table.channel),
    index("industrial_emergency_alert_channels_tenant_idx").on(table.tenantId, table.alertId),
  ],
);

export const industrialEmergencyAlertDeliveries = pgTable(
  "industrial_emergency_alert_deliveries",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => industrialEmergencyAlerts.id),
    alertVersionId: uuid("alert_version_id").references(
      () => industrialEmergencyAlertVersions.id,
    ),
    recipientId: uuid("recipient_id").references(() => industrialEmergencyAlertRecipients.id),
    channel: varchar("channel", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 64 }),
    providerMessageId: varchar("provider_message_id", { length: 200 }),
    status: varchar("status", { length: 32 }).notNull().default("QUEUED"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureCode: varchar("failure_code", { length: 64 }),
    failureReason: text("failure_reason"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("industrial_emergency_alert_deliveries_alert_idx").on(
      table.alertId,
      table.channel,
      table.status,
    ),
    index("industrial_emergency_alert_deliveries_tenant_idx").on(
      table.tenantId,
      table.createdAt,
    ),
  ],
);

export const industrialEmergencyAlertAcknowledgments = pgTable(
  "industrial_emergency_alert_acknowledgments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => industrialEmergencyAlerts.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => industrialEmergencyAlertRecipients.id),
    userId: uuid("user_id").references(() => users.id),
    status: varchar("status", { length: 32 }).notNull().default("ACKNOWLEDGED"),
    method: varchar("method", { length: 32 }).notNull().default("IN_APP"),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
    responseText: text("response_text"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alert_acks_uidx").on(table.alertId, table.recipientId),
    index("industrial_emergency_alert_acks_tenant_idx").on(table.tenantId, table.alertId),
  ],
);

export const industrialEmergencyAlertCapFeeds = pgTable(
  "industrial_emergency_alert_cap_feeds",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    locationId: uuid("location_id"),
    publicFeedId: varchar("public_feed_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull().default("Facility CAP Feed"),
    enabled: boolean("enabled").notNull().default(true),
    feedType: varchar("feed_type", { length: 32 }).notNull().default("MVIX"),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alert_cap_feeds_uidx").on(table.publicFeedId),
    index("industrial_emergency_alert_cap_feeds_tenant_idx").on(table.tenantId, table.enabled),
  ],
);

export const industrialEmergencyAlertMvixMappings = pgTable(
  "industrial_emergency_alert_mvix_mappings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    forgeLocationId: uuid("forge_location_id"),
    mvixDeviceId: varchar("mvix_device_id", { length: 120 }),
    mvixDeviceGroupId: varchar("mvix_device_group_id", { length: 120 }),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    integrationMethod: varchar("integration_method", { length: 32 }).notNull().default("CAP"),
    capFeedId: uuid("cap_feed_id").references(() => industrialEmergencyAlertCapFeeds.id),
    enabled: boolean("enabled").notNull().default(true),
    lastStatus: varchar("last_status", { length: 64 }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("industrial_emergency_alert_mvix_tenant_idx").on(table.tenantId, table.enabled),
  ],
);

export const industrialEmergencyAlertSettings = pgTable(
  "industrial_emergency_alert_settings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    smsProvider: varchar("sms_provider", { length: 64 }).notNull().default("STUB"),
    smsEnabled: boolean("sms_enabled").notNull().default(false),
    mvixEnabled: boolean("mvix_enabled").notNull().default(true),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    requireSendConfirmation: boolean("require_send_confirmation").notNull().default(true),
    defaultChannelsJson: jsonb("default_channels_json")
      .notNull()
      .default(["SMS", "IN_APP", "MVIX"]),
    settingsJson: jsonb("settings_json").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alert_settings_tenant_uidx").on(table.tenantId),
  ],
);

export const industrialEmergencyAlertAuditLogs = pgTable(
  "industrial_emergency_alert_audit_logs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    alertId: uuid("alert_id").references(() => industrialEmergencyAlerts.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: varchar("action", { length: 64 }).notNull(),
    detailJson: jsonb("detail_json").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("industrial_emergency_alert_audit_tenant_idx").on(table.tenantId, table.createdAt),
    index("industrial_emergency_alert_audit_alert_idx").on(table.alertId, table.createdAt),
  ],
);

/** Static / dynamic / temporary alert audience groups. */
export const industrialEmergencyAlertGroups = pgTable(
  "industrial_emergency_alert_groups",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    groupType: varchar("group_type", { length: 32 }).notNull().default("STATIC"),
    locationId: uuid("location_id"),
    departmentId: uuid("department_id"),
    dynamic: boolean("dynamic").notNull().default(false),
    ruleJson: jsonb("rule_json").notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("industrial_emergency_alert_groups_tenant_idx").on(table.tenantId, table.enabled),
    index("industrial_emergency_alert_groups_tenant_name_idx").on(table.tenantId, table.name),
  ],
);

export const industrialEmergencyAlertGroupMembers = pgTable(
  "industrial_emergency_alert_group_members",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => industrialEmergencyAlertGroups.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id").notNull(),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("industrial_emergency_alert_group_members_uidx").on(
      table.groupId,
      table.personnelId,
    ),
    index("industrial_emergency_alert_group_members_tenant_idx").on(
      table.tenantId,
      table.groupId,
    ),
  ],
);
