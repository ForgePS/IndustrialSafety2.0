import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";

/** Forge product catalog (platform-global). */
export const platformProducts = pgTable(
  "platform_products",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("platform_products_code_uidx").on(table.code)],
);

/** Modules within a platform product (platform-global). */
export const platformModules = pgTable(
  "platform_modules",
  {
    id: uuid("id").primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => platformProducts.id),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    isCore: boolean("is_core").notNull().default(false),
    /** MODULE-CATALOG-S2: People & Workforce, Compliance, etc. */
    category: varchar("category", { length: 128 }).notNull().default("General"),
    /** CUSTOMER_MODULE | PLATFORM_CORE | INTERNAL_TOOL | SHARED_SERVICE */
    classification: varchar("classification", { length: 64 }).notNull().default("CUSTOMER_MODULE"),
    /** READY | IN_DEVELOPMENT | MIGRATING | COMING_SOON | RETIRED | UNAVAILABLE */
    implementationStatus: varchar("implementation_status", { length: 64 })
      .notNull()
      .default("READY"),
    /** When false, module is hidden from ordinary customer assignment toggles. */
    customerAssignable: boolean("customer_assignable").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(100),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("platform_modules_product_code_uidx").on(table.productId, table.code)],
);

/** Permission codes used by the authorization engine (platform-global). */
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 128 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    scopeType: varchar("scope_type", { length: 64 }).notNull().default("TENANT"),
    riskLevel: varchar("risk_level", { length: 32 }).notNull().default("NORMAL"),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("permissions_code_uidx").on(table.code)],
);

/** Global role templates instantiated or assigned within tenants. */
export const roleTemplates = pgTable(
  "role_templates",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    roleType: varchar("role_type", { length: 64 }).notNull().default("TENANT"),
    isSystem: boolean("is_system").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("role_templates_code_uidx").on(table.code)],
);

export const roleTemplatePermissions = pgTable(
  "role_template_permissions",
  {
    roleTemplateId: uuid("role_template_id")
      .notNull()
      .references(() => roleTemplates.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("role_template_permissions_uidx").on(table.roleTemplateId, table.permissionId),
  ],
);

export const organizationTypes = pgTable(
  "organization_types",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("organization_types_code_uidx").on(table.code)],
);

export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    billingInterval: varchar("billing_interval", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    basePriceCents: integer("base_price_cents"),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    configurationJson: jsonb("configuration_json").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("subscription_plans_code_uidx").on(table.code)],
);

export const featureDefinitions = pgTable(
  "feature_definitions",
  {
    id: uuid("id").primaryKey(),
    key: varchar("key", { length: 128 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    valueType: varchar("value_type", { length: 32 }).notNull().default("BOOLEAN"),
    defaultValueJson: jsonb("default_value_json").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("feature_definitions_key_uidx").on(table.key)],
);
