import { type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { organizationTypes } from "./platform.js";
import { tenants } from "./tenants.js";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    organizationTypeId: uuid("organization_type_id")
      .notNull()
      .references(() => organizationTypes.id),
    parentOrganizationId: uuid("parent_organization_id").references(
      (): AnyPgColumn => organizations.id,
    ),
    externalKey: varchar("external_key", { length: 128 }),
    slug: varchar("slug", { length: 100 }).notNull(),
    legalName: varchar("legal_name", { length: 300 }).notNull(),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    timezone: varchar("timezone", { length: 64 }),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    website: varchar("website", { length: 500 }),
    addressLine1: varchar("address_line_1", { length: 300 }),
    addressLine2: varchar("address_line_2", { length: 300 }),
    city: varchar("city", { length: 120 }),
    stateProvince: varchar("state_province", { length: 120 }),
    postalCode: varchar("postal_code", { length: 32 }),
    countryCode: varchar("country_code", { length: 2 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("organizations_tenant_slug_uidx").on(table.tenantId, table.slug)],
);

export const organizationIdentifiers = pgTable(
  "organization_identifiers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    identifierType: varchar("identifier_type", { length: 64 }).notNull(),
    identifierValue: varchar("identifier_value", { length: 255 }).notNull(),
    issuingAuthority: varchar("issuing_authority", { length: 200 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("organization_identifiers_org_type_value_uidx").on(
      table.organizationId,
      table.identifierType,
      table.identifierValue,
    ),
  ],
);
