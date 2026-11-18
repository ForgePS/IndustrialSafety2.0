import {
  boolean,
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
import {
  featureDefinitions,
  platformModules,
  platformProducts,
  subscriptionPlans,
} from "./platform.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const tenantProducts = pgTable(
  "tenant_products",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => platformProducts.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }).notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    configurationJson: jsonb("configuration_json").notNull().default({}),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("tenant_products_tenant_product_uidx").on(table.tenantId, table.productId),
  ],
);

export const tenantModuleEntitlements = pgTable(
  "tenant_module_entitlements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => platformModules.id),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    sourceType: varchar("source_type", { length: 64 }).notNull().default("MANUAL"),
    sourceId: uuid("source_id"),
    quantityLimit: integer("quantity_limit"),
    usagePeriod: varchar("usage_period", { length: 32 }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    configurationJson: jsonb("configuration_json").notNull().default({}),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("tenant_module_entitlements_tenant_module_uidx").on(table.tenantId, table.moduleId),
  ],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  planId: uuid("plan_id")
    .notNull()
    .references(() => subscriptionPlans.id),
  status: varchar("status", { length: 32 }).notNull().default("TRIAL"),
  billingProvider: varchar("billing_provider", { length: 64 }).notNull().default("NONE"),
  externalSubscriptionId: varchar("external_subscription_id", { length: 255 }),
  billingCustomerId: uuid("billing_customer_id"),
  billingType: varchar("billing_type", { length: 64 }).notNull().default("MONTHLY"),
  seatQuantity: integer("seat_quantity"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  recordVersion: recordVersionColumn,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const subscriptionEvents = pgTable("subscription_events", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id),
  eventType: varchar("event_type", { length: 128 }).notNull(),
  payloadJson: jsonb("payload_json").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: createdAtColumn,
});

export const featureOverrides = pgTable("feature_overrides", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  organizationId: uuid("organization_id").references(() => organizations.id),
  userId: uuid("user_id").references(() => users.id),
  featureDefinitionId: uuid("feature_definition_id")
    .notNull()
    .references(() => featureDefinitions.id),
  valueJson: jsonb("value_json").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  reason: text("reason"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  recordVersion: recordVersionColumn,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});
