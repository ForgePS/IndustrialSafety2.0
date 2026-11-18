import { index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { organizations } from "./organizations.js";
import { tenants } from "./tenants.js";

/**
 * Canonical tenant facility / site (FORGE-SAAS MK-S1).
 * Product-specific site models (e.g. rms_stations) and Config Studio facility
 * documents remain product adapters — they must not become a second commercial root.
 */
export const facilities = pgTable(
  "facilities",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    facilityKey: varchar("facility_key", { length: 120 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    facilityType: varchar("facility_type", { length: 64 }).notNull().default("SITE"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    addressLine1: varchar("address_line_1", { length: 300 }),
    addressLine2: varchar("address_line_2", { length: 300 }),
    city: varchar("city", { length: 120 }),
    stateProvince: varchar("state_province", { length: 120 }),
    postalCode: varchar("postal_code", { length: 32 }),
    countryCode: varchar("country_code", { length: 2 }),
    timezone: varchar("timezone", { length: 64 }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
  },
  (table) => [
    uniqueIndex("facilities_tenant_key_uidx").on(table.tenantId, table.facilityKey),
    index("facilities_tenant_status_idx").on(table.tenantId, table.status),
    index("facilities_tenant_org_idx").on(table.tenantId, table.organizationId),
  ],
);
