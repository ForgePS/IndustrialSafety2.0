import { type AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  date,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    forgePersonNumber: varchar("forge_person_number", { length: 64 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    middleName: varchar("middle_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    suffix: varchar("suffix", { length: 40 }),
    preferredName: varchar("preferred_name", { length: 100 }),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    dateOfBirth: date("date_of_birth"),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordSource: varchar("record_source", { length: 64 }).notNull().default("MANUAL"),
    mergedIntoPersonId: uuid("merged_into_person_id").references((): AnyPgColumn => persons.id),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("persons_tenant_forge_number_uidx").on(table.tenantId, table.forgePersonNumber),
  ],
);

export const personSensitiveData = pgTable(
  "person_sensitive_data",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    dataType: varchar("data_type", { length: 64 }).notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    valueFingerprint: varchar("value_fingerprint", { length: 128 }).notNull(),
    keyVersion: varchar("key_version", { length: 64 }).notNull(),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("person_sensitive_data_person_type_uidx").on(table.personId, table.dataType),
  ],
);

export const personIdentifiers = pgTable(
  "person_identifiers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    identifierType: varchar("identifier_type", { length: 64 }).notNull(),
    identifierValue: varchar("identifier_value", { length: 255 }).notNull(),
    normalizedValue: varchar("normalized_value", { length: 255 }).notNull(),
    issuingAuthority: varchar("issuing_authority", { length: 200 }),
    stateProvince: varchar("state_province", { length: 120 }),
    countryCode: varchar("country_code", { length: 2 }),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("person_identifiers_tenant_type_norm_uidx").on(
      table.tenantId,
      table.identifierType,
      table.normalizedValue,
    ),
  ],
);

export const personContacts = pgTable("person_contacts", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id),
  contactType: varchar("contact_type", { length: 64 }).notNull(),
  label: varchar("label", { length: 100 }),
  value: varchar("value", { length: 320 }).notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const personAddresses = pgTable("person_addresses", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id),
  addressType: varchar("address_type", { length: 64 }).notNull().default("HOME"),
  addressLine1: varchar("address_line_1", { length: 300 }),
  addressLine2: varchar("address_line_2", { length: 300 }),
  city: varchar("city", { length: 120 }),
  stateProvince: varchar("state_province", { length: 120 }),
  postalCode: varchar("postal_code", { length: 32 }),
  countryCode: varchar("country_code", { length: 2 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
});

export const personMergeHistory = pgTable("person_merge_history", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sourcePersonId: uuid("source_person_id")
    .notNull()
    .references(() => persons.id),
  targetPersonId: uuid("target_person_id")
    .notNull()
    .references(() => persons.id),
  reason: text("reason"),
  fieldResolutionJson: jsonb("field_resolution_json").notNull().default({}),
  mergedByUserId: uuid("merged_by_user_id").notNull(),
  mergedAt: timestamp("merged_at", { withTimezone: true }).notNull(),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversedByUserId: uuid("reversed_by_user_id"),
});

export const personDuplicateCandidates = pgTable(
  "person_duplicate_candidates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personAId: uuid("person_a_id")
      .notNull()
      .references(() => persons.id),
    personBId: uuid("person_b_id")
      .notNull()
      .references(() => persons.id),
    score: numeric("score", { precision: 5, scale: 4 }).notNull(),
    matchingSignalsJson: jsonb("matching_signals_json").notNull().default([]),
    status: varchar("status", { length: 32 }).notNull().default("OPEN"),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("person_duplicate_candidates_pair_uidx").on(
      table.tenantId,
      table.personAId,
      table.personBId,
    ),
  ],
);
