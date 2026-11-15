import {
  boolean,
  date,
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
import { subscriptionPlans } from "./platform.js";
import { tenants } from "./tenants.js";
import { subscriptions } from "./entitlements.js";

export const billingCustomers = pgTable(
  "billing_customers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    billingEmail: varchar("billing_email", { length: 320 }),
    billingProvider: varchar("billing_provider", { length: 64 }).notNull().default("NONE"),
    externalCustomerId: varchar("external_customer_id", { length: 255 }),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("billing_customers_tenant_uidx").on(table.tenantId)],
);

export const prices = pgTable(
  "prices",
  {
    id: uuid("id").primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    code: varchar("code", { length: 64 }).notNull(),
    nickname: varchar("nickname", { length: 200 }).notNull(),
    interval: varchar("interval", { length: 32 }).notNull(),
    amountCents: integer("amount_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    billingType: varchar("billing_type", { length: 64 }).notNull().default("MONTHLY"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    configurationJson: jsonb("configuration_json").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("prices_plan_code_uidx").on(table.planId, table.code)],
);

export const subscriptionItems = pgTable("subscription_items", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id),
  priceId: uuid("price_id").references(() => prices.id),
  moduleCode: varchar("module_code", { length: 64 }),
  quantity: integer("quantity").notNull().default(1),
  billingType: varchar("billing_type", { length: 64 }).notNull().default("MONTHLY"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const billingContracts = pgTable("billing_contracts", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  billingCustomerId: uuid("billing_customer_id").references(() => billingCustomers.id),
  name: varchar("name", { length: 300 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  billingType: varchar("billing_type", { length: 64 })
    .notNull()
    .default("MANUAL_ENTERPRISE_CONTRACT"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  renewalOn: date("renewal_on"),
  setupFeeCents: integer("setup_fee_cents"),
  notes: text("notes"),
  pricingJson: jsonb("pricing_json").notNull().default({}),
  recordVersion: recordVersionColumn,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const billingOrders = pgTable("billing_orders", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  billingCustomerId: uuid("billing_customer_id").references(() => billingCustomers.id),
  contractId: uuid("contract_id").references(() => billingContracts.id),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  totalCents: integer("total_cents").notNull().default(0),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  recordVersion: recordVersionColumn,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const billingOrderItems = pgTable("billing_order_items", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  orderId: uuid("order_id")
    .notNull()
    .references(() => billingOrders.id),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitAmountCents: integer("unit_amount_cents").notNull().default(0),
  billingType: varchar("billing_type", { length: 64 }).notNull().default("ONE_TIME"),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: createdAtColumn,
});

export const billingInvoices = pgTable("billing_invoices", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  billingCustomerId: uuid("billing_customer_id").references(() => billingCustomers.id),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  orderId: uuid("order_id").references(() => billingOrders.id),
  status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  amountDueCents: integer("amount_due_cents").notNull().default(0),
  amountPaidCents: integer("amount_paid_cents").notNull().default(0),
  externalInvoiceId: varchar("external_invoice_id", { length: 255 }),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  recordVersion: recordVersionColumn,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const billingFeeLines = pgTable("billing_fee_lines", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  contractId: uuid("contract_id").references(() => billingContracts.id),
  orderId: uuid("order_id").references(() => billingOrders.id),
  feeType: varchar("fee_type", { length: 64 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  description: varchar("description", { length: 500 }),
  createdAt: createdAtColumn,
});

export const billingProviderEvents = pgTable(
  "billing_provider_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    provider: varchar("provider", { length: 64 }).notNull(),
    externalEventId: varchar("external_event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("RECEIVED"),
    signatureValid: boolean("signature_valid").notNull().default(false),
    payloadJson: jsonb("payload_json").notNull().default({}),
    processingError: text("processing_error"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("billing_provider_events_provider_event_uidx").on(
      table.provider,
      table.externalEventId,
    ),
  ],
);
