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
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Industrial Reporting Engine tables (vision §65–§72).
 * Built-in catalog keys live in app code; tenant rows hold saved/templates/schedules.
 */

export const reportDefinitions = pgTable(
  "report_definitions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Stable key for built-ins (e.g. incidents.summary); null for ad-hoc saved. */
    reportKey: varchar("report_key", { length: 120 }),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    origin: varchar("origin", { length: 32 }).notNull().default("saved"),
    category: varchar("category", { length: 80 }),
    moduleCode: varchar("module_code", { length: 80 }),
    reportType: varchar("report_type", { length: 32 }).notNull().default("standard"),
    sourceKey: varchar("source_key", { length: 120 }),
    payloadJson: jsonb("payload_json").notNull().default({}),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("report_definitions_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("report_definitions_tenant_key_idx").on(table.tenantId, table.reportKey),
    index("report_definitions_tenant_origin_idx").on(table.tenantId, table.origin),
  ],
);

export const reportFavorites = pgTable(
  "report_favorites",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    /** Built-in key or saved definition id */
    reportKey: varchar("report_key", { length: 120 }),
    reportDefinitionId: uuid("report_definition_id").references(() => reportDefinitions.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("report_favorites_user_key_uidx").on(table.tenantId, table.userId, table.reportKey),
    index("report_favorites_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);

export const reportExecutions = pgTable(
  "report_executions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reportKey: varchar("report_key", { length: 120 }).notNull(),
    reportDefinitionId: uuid("report_definition_id").references(() => reportDefinitions.id),
    reportName: varchar("report_name", { length: 200 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("SUCCEEDED"),
    rowCount: integer("row_count").notNull().default(0),
    durationMs: integer("duration_ms"),
    runInputJson: jsonb("run_input_json").notNull().default({}),
    errorMessage: text("error_message"),
    executedByUserId: uuid("executed_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("report_executions_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("report_executions_tenant_key_idx").on(table.tenantId, table.reportKey),
  ],
);

export const reportExports = pgTable(
  "report_exports",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    executionId: uuid("execution_id").references(() => reportExecutions.id),
    reportKey: varchar("report_key", { length: 120 }).notNull(),
    reportName: varchar("report_name", { length: 200 }).notNull(),
    format: varchar("format", { length: 16 }).notNull(),
    filename: varchar("filename", { length: 240 }).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("READY"),
    artifactInline: text("artifact_inline"),
    artifactObjectKey: text("artifact_object_key"),
    jobId: uuid("job_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("report_exports_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("report_exports_tenant_job_idx").on(table.tenantId, table.jobId),
  ],
);

export const reportSchedules = pgTable(
  "report_schedules",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reportDefinitionId: uuid("report_definition_id")
      .notNull()
      .references(() => reportDefinitions.id),
    name: varchar("name", { length: 200 }).notNull(),
    cronExpression: varchar("cron_expression", { length: 120 }).notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    format: varchar("format", { length: 16 }).notNull().default("csv"),
    enabled: boolean("enabled").notNull().default(true),
    runInputJson: jsonb("run_input_json").notNull().default({}),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("report_schedules_tenant_enabled_idx").on(table.tenantId, table.enabled)],
);

export const reportRecipients = pgTable(
  "report_recipients",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => reportSchedules.id),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }),
    createdAt: createdAtColumn,
  },
  (table) => [index("report_recipients_schedule_idx").on(table.scheduleId)],
);

export const reportShares = pgTable(
  "report_shares",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    reportDefinitionId: uuid("report_definition_id")
      .notNull()
      .references(() => reportDefinitions.id),
    sharedWithUserId: uuid("shared_with_user_id").references(() => users.id),
    sharedWithRoleId: uuid("shared_with_role_id"),
    permission: varchar("permission", { length: 32 }).notNull().default("view"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [index("report_shares_tenant_def_idx").on(table.tenantId, table.reportDefinitionId)],
);
