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

/**
 * Tenant API keys (MK-S15). Persist hash only; raw key returned once at create.
 */
export const tenantApiKeys = pgTable(
  "tenant_api_keys",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 120 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 32 }).notNull(),
    displayHint: varchar("display_hint", { length: 64 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    scopesJson: jsonb("scopes_json").notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("tenant_api_keys_key_hash_uidx").on(table.keyHash),
    index("tenant_api_keys_tenant_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export type TenantApiKey = typeof tenantApiKeys.$inferSelect;

/**
 * Outbound customer webhook endpoints (MK-S15). Distinct from CAD/billing inbound webhooks.
 * Signing secret is stored for outbound HMAC and never returned after create/rotate.
 */
export const tenantWebhookEndpoints = pgTable(
  "tenant_webhook_endpoints",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 120 }).notNull(),
    endpointUrl: text("endpoint_url").notNull(),
    eventTypesJson: jsonb("event_types_json").notNull().default([]),
    signingSecret: text("signing_secret").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("tenant_webhook_endpoints_tenant_idx").on(table.tenantId, table.createdAt)],
);

export type TenantWebhookEndpoint = typeof tenantWebhookEndpoints.$inferSelect;

export const tenantWebhookDeliveries = pgTable(
  "tenant_webhook_deliveries",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => tenantWebhookEndpoints.id),
    eventType: varchar("event_type", { length: 120 }).notNull(),
    payloadJson: jsonb("payload_json").notNull().default({}),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    httpStatus: integer("http_status"),
    durationMs: integer("duration_ms"),
    responseBodyPreview: text("response_body_preview"),
    errorMessage: text("error_message"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("tenant_webhook_deliveries_endpoint_created_idx").on(table.endpointId, table.createdAt),
    index("tenant_webhook_deliveries_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export type TenantWebhookDelivery = typeof tenantWebhookDeliveries.$inferSelect;
