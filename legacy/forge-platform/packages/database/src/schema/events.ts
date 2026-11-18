import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { createdAtColumn } from "./common.js";
import { tenants } from "./tenants.js";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    aggregateType: varchar("aggregate_type", { length: 128 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 200 }).notNull(),
    eventVersion: integer("event_version").notNull().default(1),
    payloadJson: jsonb("payload_json").notNull(),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    correlationId: varchar("correlation_id", { length: 128 }).notNull(),
    causationId: varchar("causation_id", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: createdAtColumn,
  },
  (table) => [index("outbox_events_pending_poll_idx").on(table.status, table.availableAt)],
);

/**
 * Idempotency ledger for inbound event handling (ADR-024). The unique index on
 * (event_id, handler_name) is the concurrency control: a duplicate delivery
 * fails to insert and the worker short-circuits instead of re-running the handler.
 */
export const eventProcessingRecords = pgTable(
  "event_processing_records",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    eventId: uuid("event_id").notNull(),
    eventType: varchar("event_type", { length: 200 }).notNull(),
    handlerName: varchar("handler_name", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("PROCESSING"),
    attemptCount: integer("attempt_count").notNull().default(1),
    correlationId: varchar("correlation_id", { length: 128 }),
    durationMs: integer("duration_ms"),
    /** Redacted failure summary. Never contains payload or secret material. */
    errorMessage: text("error_message"),
    firstSeenAt: createdAtColumn,
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("event_processing_records_event_handler_uidx").on(table.eventId, table.handlerName),
    index("event_processing_records_status_idx").on(table.status, table.firstSeenAt),
  ],
);

export const eventDeliveryLog = pgTable("event_delivery_log", {
  id: uuid("id").primaryKey(),
  outboxEventId: uuid("outbox_event_id")
    .notNull()
    .references(() => outboxEvents.id),
  destination: varchar("destination", { length: 255 }).notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  status: varchar("status", { length: 32 }).notNull(),
  responseMetadataJson: jsonb("response_metadata_json").notNull().default({}),
  errorMessage: text("error_message"),
  createdAt: createdAtColumn,
});
