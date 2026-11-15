import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/**
 * Durable idempotency for unsafe mutations (ADR-022).
 *
 * A key is scoped by tenant, user, HTTP method and route template. The row is
 * claimed as PROCESSING before the handler runs, so a concurrent duplicate
 * loses the unique-index race instead of producing a second write.
 */
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    method: varchar("method", { length: 10 }).notNull(),
    route: varchar("route", { length: 512 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    /** SHA-256 of the canonicalised request body. */
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PROCESSING"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    resourceType: varchar("resource_type", { length: 128 }),
    resourceId: uuid("resource_id"),
    createdAt: createdAtColumn,
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("idempotency_records_scope_key_uidx").on(
      table.tenantId,
      table.userId,
      table.method,
      table.route,
      table.idempotencyKey,
    ),
    index("idempotency_records_expires_idx").on(table.expiresAt),
  ],
);
