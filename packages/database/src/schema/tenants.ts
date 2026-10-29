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

/**
 * Tenant root row. created_by / updated_by reference users (circular FK);
 * migration SQL adds those FKs after both tables exist.
 * slug / tenant_key are varchar in Drizzle; migration uses citext.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey(),
    tenantKey: varchar("tenant_key", { length: 64 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    legalName: varchar("legal_name", { length: 300 }).notNull(),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    tenantType: varchar("tenant_type", { length: 64 }).notNull().default("CUSTOMER"),
    status: varchar("status", { length: 32 }).notNull().default("PROVISIONING"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Chicago"),
    defaultLocale: varchar("default_locale", { length: 16 }).notNull().default("en-US"),
    dataRegion: varchar("data_region", { length: 32 }).notNull().default("us-east-1"),
    /** When true, external SMS/email/alerts/DOT/print side effects are blocked. */
    isDemoTenant: boolean("is_demo_tenant").notNull().default(false),
    suspensionReason: text("suspension_reason"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
  },
  (table) => [
    uniqueIndex("tenants_tenant_key_uidx").on(table.tenantKey),
    uniqueIndex("tenants_slug_uidx").on(table.slug),
  ],
);

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    domain: varchar("domain", { length: 255 }).notNull(),
    domainType: varchar("domain_type", { length: 64 }).notNull().default("CUSTOM"),
    verificationStatus: varchar("verification_status", { length: 32 }).notNull().default("PENDING"),
    verificationTokenHash: varchar("verification_token_hash", { length: 128 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("tenant_domains_domain_uidx").on(table.domain)],
);

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    namespace: varchar("namespace", { length: 64 }).notNull(),
    settingKey: varchar("setting_key", { length: 128 }).notNull(),
    valueJson: jsonb("value_json").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    isSensitive: boolean("is_sensitive").notNull().default(false),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    updatedByUserId: uuid("updated_by_user_id"),
  },
  (table) => [
    uniqueIndex("tenant_settings_tenant_ns_key_uidx").on(
      table.tenantId,
      table.namespace,
      table.settingKey,
    ),
  ],
);

export const tenantBranding = pgTable(
  "tenant_branding",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    displayName: varchar("display_name", { length: 200 }),
    shortName: varchar("short_name", { length: 80 }),
    logoDocumentId: uuid("logo_document_id"),
    logoDarkDocumentId: uuid("logo_dark_document_id"),
    iconDocumentId: uuid("icon_document_id"),
    primaryColor: varchar("primary_color", { length: 32 }),
    secondaryColor: varchar("secondary_color", { length: 32 }),
    accentColor: varchar("accent_color", { length: 32 }),
    approvedColorsJson: jsonb("approved_colors_json").notNull().default([]),
    contactName: varchar("contact_name", { length: 200 }),
    contactPhone: varchar("contact_phone", { length: 40 }),
    emailSenderName: varchar("email_sender_name", { length: 200 }),
    supportEmail: varchar("support_email", { length: 320 }),
    reportIdentity: varchar("report_identity", { length: 300 }),
    documentFooter: text("document_footer"),
    customCssEnabled: boolean("custom_css_enabled").notNull().default(false),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("tenant_branding_tenant_uidx").on(table.tenantId)],
);
