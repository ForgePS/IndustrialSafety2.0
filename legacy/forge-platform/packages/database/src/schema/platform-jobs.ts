import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Shared SaaS background jobs (MK-S19).
 * Domain-specific import_jobs remain authoritative for Universal Import.
 */
export const platformJobs = pgTable(
  "platform_jobs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: varchar("type", { length: 80 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    progress: integer("progress").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    correlationId: varchar("correlation_id", { length: 120 }).notNull(),
    requestId: varchar("request_id", { length: 120 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failure: text("failure"),
    resultJson: jsonb("result_json").notNull().default({}),
    artifactObjectKey: text("artifact_object_key"),
    artifactContentType: varchar("artifact_content_type", { length: 120 }),
    artifactFilename: varchar("artifact_filename", { length: 200 }),
    /** Inline artifact for local/dev or when S3 write is unavailable (capped by service). */
    artifactInline: text("artifact_inline"),
    artifactExpiresAt: timestamp("artifact_expires_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("platform_jobs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("platform_jobs_tenant_status_idx").on(table.tenantId, table.status),
    index("platform_jobs_tenant_type_idx").on(table.tenantId, table.type),
  ],
);

export type PlatformJobRow = typeof platformJobs.$inferSelect;
