import {
  boolean,
  date,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { persons } from "./persons.js";
import { tenants } from "./tenants.js";

export const rmsStations = pgTable(
  "rms_stations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stationNumber: varchar("station_number", { length: 32 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    addressLine1: varchar("address_line1", { length: 300 }),
    addressLine2: varchar("address_line2", { length: 300 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 64 }),
    postalCode: varchar("postal_code", { length: 32 }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Chicago"),
    defaultResponseDistrict: varchar("default_response_district", { length: 120 }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [
    uniqueIndex("rms_stations_tenant_number_uidx").on(table.tenantId, table.stationNumber),
    index("rms_stations_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const rmsShifts = pgTable(
  "rms_shifts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    scheduleReference: varchar("schedule_reference", { length: 200 }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [uniqueIndex("rms_shifts_tenant_code_uidx").on(table.tenantId, table.code)],
);

export const rmsApparatus = pgTable(
  "rms_apparatus",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    apparatusNumber: varchar("apparatus_number", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    apparatusType: varchar("apparatus_type", { length: 64 }).notNull(),
    stationId: uuid("station_id").references(() => rmsStations.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    nerisClassification: varchar("neris_classification", { length: 120 }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [
    uniqueIndex("rms_apparatus_tenant_number_uidx").on(table.tenantId, table.apparatusNumber),
    index("rms_apparatus_station_idx").on(table.stationId),
  ],
);

export const rmsUnits = pgTable(
  "rms_units",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    unitNumber: varchar("unit_number", { length: 64 }).notNull(),
    callSign: varchar("call_sign", { length: 64 }).notNull(),
    unitType: varchar("unit_type", { length: 64 }).notNull(),
    apparatusId: uuid("apparatus_id").references(() => rmsApparatus.id),
    stationId: uuid("station_id").references(() => rmsStations.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [
    uniqueIndex("rms_units_tenant_number_uidx").on(table.tenantId, table.unitNumber),
    index("rms_units_station_idx").on(table.stationId),
  ],
);

export const rmsPersonnel = pgTable(
  "rms_personnel",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    rank: varchar("rank", { length: 80 }),
    qualificationSummary: text("qualification_summary"),
    stationId: uuid("station_id").references(() => rmsStations.id),
    shiftId: uuid("shift_id").references(() => rmsShifts.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    incidentEligible: boolean("incident_eligible").notNull().default(true),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [
    uniqueIndex("rms_personnel_tenant_person_uidx").on(table.tenantId, table.personId),
    index("rms_personnel_station_idx").on(table.stationId),
  ],
);

export const rmsDailyRosters = pgTable(
  "rms_daily_rosters",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    rosterDate: date("roster_date").notNull(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => rmsShifts.id),
    stationId: uuid("station_id")
      .notNull()
      .references(() => rmsStations.id),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("rms_daily_rosters_tenant_date_shift_station_uidx").on(
      table.tenantId,
      table.rosterDate,
      table.shiftId,
      table.stationId,
    ),
  ],
);

export const rmsRosterAssignments = pgTable(
  "rms_roster_assignments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    rosterId: uuid("roster_id")
      .notNull()
      .references(() => rmsDailyRosters.id),
    unitId: uuid("unit_id").references(() => rmsUnits.id),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => rmsPersonnel.id),
    assignmentRole: varchar("assignment_role", { length: 80 }).notNull().default("MEMBER"),
    isOfficer: boolean("is_officer").notNull().default(false),
    incidentCommanderEligible: boolean("incident_commander_eligible").notNull().default(false),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("rms_roster_assignments_roster_personnel_uidx").on(
      table.rosterId,
      table.personnelId,
    ),
    index("rms_roster_assignments_unit_idx").on(table.unitId),
  ],
);

export const rmsOccupancies = pgTable(
  "rms_occupancies",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 300 }).notNull(),
    addressLine1: varchar("address_line1", { length: 300 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 64 }),
    postalCode: varchar("postal_code", { length: 32 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    primaryContact: varchar("primary_contact", { length: 200 }),
    occupancyType: varchar("occupancy_type", { length: 120 }),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    preplanId: uuid("preplan_id"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [
    index("rms_occupancies_tenant_name_idx").on(table.tenantId, table.name),
    index("rms_occupancies_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const rmsPreplans = pgTable(
  "rms_preplans",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    occupancyId: uuid("occupancy_id")
      .notNull()
      .references(() => rmsOccupancies.id),
    versionLabel: varchar("version_label", { length: 64 }).notNull().default("1"),
    approvalStatus: varchar("approval_status", { length: 32 }).notNull().default("DRAFT"),
    tacticalSummary: text("tactical_summary"),
    hazards: text("hazards"),
    accessNotes: text("access_notes"),
    utilityNotes: text("utility_notes"),
    primaryStationId: uuid("primary_station_id").references(() => rmsStations.id),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
  },
  (table) => [
    uniqueIndex("rms_preplans_occupancy_version_uidx").on(table.occupancyId, table.versionLabel),
    index("rms_preplans_tenant_status_idx").on(table.tenantId, table.approvalStatus),
  ],
);
