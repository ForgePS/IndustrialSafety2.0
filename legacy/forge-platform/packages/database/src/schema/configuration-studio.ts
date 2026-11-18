import {
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

export const configObjects = pgTable(
  "config_objects",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    namespace: varchar("namespace", { length: 64 }).notNull(),
    objectKey: varchar("object_key", { length: 120 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    currentPublishedVersionId: uuid("current_published_version_id"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("config_objects_tenant_ns_key_uidx").on(
      table.tenantId,
      table.namespace,
      table.objectKey,
    ),
    index("config_objects_tenant_ns_idx").on(table.tenantId, table.namespace),
  ],
);

export const configVersions = pgTable(
  "config_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    objectId: uuid("object_id")
      .notNull()
      .references(() => configObjects.id),
    version: integer("version").notNull(),
    state: varchar("state", { length: 32 }).notNull().default("DRAFT"),
    payloadJson: jsonb("payload_json").notNull().default({}),
    contentHash: varchar("content_hash", { length: 128 }).notNull(),
    changeSummary: text("change_summary"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id),
    supersedesVersionId: uuid("supersedes_version_id"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("config_versions_object_version_uidx").on(table.objectId, table.version),
    index("config_versions_tenant_state_idx").on(table.tenantId, table.state, table.createdAt),
    index("config_versions_object_state_idx").on(table.objectId, table.state),
  ],
);
