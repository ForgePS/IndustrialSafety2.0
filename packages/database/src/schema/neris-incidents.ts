import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
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
import { nerisFields, nerisSchemaVersions, nerisValueOptions } from "./neris.js";
import { rmsPersonnel, rmsShifts, rmsStations, rmsUnits } from "./rms-master.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const nerisIncidentNumberConfigs = pgTable(
  "neris_incident_number_configs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 120 }).notNull().default("DEFAULT"),
    formatTemplate: varchar("format_template", { length: 200 })
      .notNull()
      .default("{YEAR4}-{SEQ:6}"),
    resetMode: varchar("reset_mode", { length: 32 }).notNull().default("CALENDAR"),
    scope: varchar("scope", { length: 32 }).notNull().default("NONE"),
    prefix: varchar("prefix", { length: 64 }),
    suffix: varchar("suffix", { length: 64 }),
    agencyCode: varchar("agency_code", { length: 64 }),
    fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
    allowManual: boolean("allow_manual").notNull().default(false),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_number_configs_tenant_name_uidx").on(table.tenantId, table.name),
  ],
);

export const nerisIncidentNumberSequences = pgTable(
  "neris_incident_number_sequences",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    configId: uuid("config_id")
      .notNull()
      .references(() => nerisIncidentNumberConfigs.id),
    periodKey: varchar("period_key", { length: 32 }).notNull(),
    stationId: uuid("station_id").references(() => rmsStations.id),
    categoryKey: varchar("category_key", { length: 64 }),
    nextValue: integer("next_value").notNull().default(1),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_number_sequences_scope_uidx").on(
      table.configId,
      table.periodKey,
      table.stationId,
      table.categoryKey,
    ),
  ],
);

export const nerisIncidentNumbers = pgTable(
  "neris_incident_numbers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    number: varchar("number", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("ASSIGNED"),
    source: varchar("source", { length: 32 }).notNull().default("AUTO"),
    sequenceValue: integer("sequence_value"),
    periodKey: varchar("period_key", { length: 32 }),
    stationId: uuid("station_id").references(() => rmsStations.id),
    incidentId: uuid("incident_id"),
    voidReason: text("void_reason"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_numbers_tenant_number_uidx").on(table.tenantId, table.number),
    index("neris_incident_numbers_incident_idx").on(table.incidentId),
  ],
);

export const nerisIncidents = pgTable(
  "neris_incidents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentNumber: varchar("incident_number", { length: 64 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("DRAFT"),
    schemaVersionId: uuid("schema_version_id").references(() => nerisSchemaVersions.id),
    incidentDate: date("incident_date"),
    alarmAt: timestamp("alarm_at", { withTimezone: true }),
    stationId: uuid("station_id").references(() => rmsStations.id),
    shiftId: uuid("shift_id").references(() => rmsShifts.id),
    responseDistrict: varchar("response_district", { length: 120 }),
    incidentSource: varchar("incident_source", { length: 64 }),
    dispatchDescription: text("dispatch_description"),
    mutualAidStatus: varchar("mutual_aid_status", { length: 64 }),
    aidDirection: varchar("aid_direction", { length: 64 }),
    incidentCommanderPersonnelId: uuid("incident_commander_personnel_id").references(
      () => rmsPersonnel.id,
    ),
    reportOwnerUserId: uuid("report_owner_user_id").references(() => users.id),
    primaryIncidentTypeCode: varchar("primary_incident_type_code", { length: 120 }),
    secondaryIncidentTypeCodes: jsonb("secondary_incident_type_codes")
      .$type<string[]>()
      .default([]),
    operatingMode: varchar("operating_mode", { length: 32 }).notNull().default("MANUAL_ONLY"),
    voidReason: text("void_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
  },
  (table) => [
    uniqueIndex("neris_incidents_tenant_number_uidx").on(table.tenantId, table.incidentNumber),
    index("neris_incidents_tenant_status_idx").on(table.tenantId, table.status),
    index("neris_incidents_tenant_date_idx").on(table.tenantId, table.incidentDate),
  ],
);

export const nerisIncidentStatusHistory = pgTable(
  "neris_incident_status_history",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    fromStatus: varchar("from_status", { length: 40 }),
    toStatus: varchar("to_status", { length: 40 }).notNull(),
    reason: text("reason"),
    actorUserId: uuid("actor_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("neris_incident_status_history_incident_idx").on(table.incidentId, table.createdAt),
  ],
);

export const nerisIncidentSections = pgTable(
  "neris_incident_sections",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    sectionKey: varchar("section_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("INCOMPLETE"),
    completionPercent: integer("completion_percent").notNull().default(0),
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_sections_incident_key_uidx").on(table.incidentId, table.sectionKey),
  ],
);

export const nerisIncidentRepeatableGroups = pgTable(
  "neris_incident_repeatable_groups",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    groupKey: varchar("group_key", { length: 120 }).notNull(),
    moduleKey: varchar("module_key", { length: 120 }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_repeatable_groups_uidx").on(table.incidentId, table.groupKey),
  ],
);

export const nerisIncidentRepeatableItems = pgTable(
  "neris_incident_repeatable_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => nerisIncidentRepeatableGroups.id),
    ordinal: integer("ordinal").notNull().default(0),
    label: varchar("label", { length: 200 }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("neris_incident_repeatable_items_group_idx").on(table.groupId, table.ordinal)],
);

export const nerisIncidentFieldValues = pgTable(
  "neris_incident_field_values",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => nerisFields.id),
    sectionKey: varchar("section_key", { length: 64 }).notNull(),
    repeatableItemId: uuid("repeatable_item_id").references(() => nerisIncidentRepeatableItems.id),
    valueText: text("value_text"),
    valueNumber: numeric("value_number"),
    valueBoolean: boolean("value_boolean"),
    valueTimestamp: timestamp("value_timestamp", { withTimezone: true }),
    valueOptionId: uuid("value_option_id").references(() => nerisValueOptions.id),
    valueJson: jsonb("value_json"),
    prefillSource: varchar("prefill_source", { length: 40 }),
    userConfirmed: boolean("user_confirmed").notNull().default(false),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_field_values_uidx").on(
      table.incidentId,
      table.fieldId,
      table.sectionKey,
      table.repeatableItemId,
    ),
    index("neris_incident_field_values_incident_idx").on(table.incidentId),
  ],
);

export const nerisIncidentUnits = pgTable(
  "neris_incident_units",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => rmsUnits.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    unitRole: varchar("unit_role", { length: 80 }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    enRouteAt: timestamp("en_route_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("neris_incident_units_incident_unit_uidx").on(table.incidentId, table.unitId),
  ],
);

export const nerisIncidentPersonnel = pgTable(
  "neris_incident_personnel",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => rmsPersonnel.id),
    unitAssignmentId: uuid("unit_assignment_id").references(() => nerisIncidentUnits.id),
    role: varchar("role", { length: 80 }),
    rank: varchar("rank", { length: 80 }),
    primaryAction: varchar("primary_action", { length: 120 }),
    exposureInvolved: boolean("exposure_involved").notNull().default(false),
    isIncidentCommander: boolean("is_incident_commander").notNull().default(false),
    isReportingOfficer: boolean("is_reporting_officer").notNull().default(false),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("neris_incident_personnel_incident_person_uidx").on(
      table.incidentId,
      table.personnelId,
    ),
  ],
);

export const nerisIncidentLocations = pgTable(
  "neris_incident_locations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    locationType: varchar("location_type", { length: 80 }),
    municipality: varchar("municipality", { length: 120 }),
    county: varchar("county", { length: 120 }),
    state: varchar("state", { length: 64 }),
    postalCode: varchar("postal_code", { length: 32 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    crossStreets: varchar("cross_streets", { length: 300 }),
    mileMarker: varchar("mile_marker", { length: 64 }),
    highway: varchar("highway", { length: 120 }),
    apartmentSuite: varchar("apartment_suite", { length: 80 }),
    locationDescription: text("location_description"),
    addressVerificationStatus: varchar("address_verification_status", { length: 40 }),
    jurisdiction: varchar("jurisdiction", { length: 120 }),
    occupancyId: uuid("occupancy_id"),
    preplanId: uuid("preplan_id"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("neris_incident_locations_incident_uidx").on(table.incidentId)],
);

export const nerisIncidentAddresses = pgTable(
  "neris_incident_addresses",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    locationId: uuid("location_id").references(() => nerisIncidentLocations.id),
    addressLine1: varchar("address_line1", { length: 300 }),
    addressLine2: varchar("address_line2", { length: 300 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 64 }),
    postalCode: varchar("postal_code", { length: 32 }),
    country: varchar("country", { length: 64 }).default("US"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_addresses_incident_idx").on(table.incidentId)],
);

export const nerisIncidentTimestamps = pgTable(
  "neris_incident_timestamps",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    unitAssignmentId: uuid("unit_assignment_id").references(() => nerisIncidentUnits.id),
    timestampKind: varchar("timestamp_kind", { length: 64 }).notNull(),
    originalValue: timestamp("original_value", { withTimezone: true }),
    correctedValue: timestamp("corrected_value", { withTimezone: true }),
    isEstimated: boolean("is_estimated").notNull().default(false),
    correctionReason: text("correction_reason"),
    source: varchar("source", { length: 40 }).notNull().default("MANUAL"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("neris_incident_timestamps_incident_idx").on(table.incidentId, table.timestampKind),
  ],
);

export const nerisIncidentValidationRuns = pgTable(
  "neris_incident_validation_runs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    trigger: varchar("trigger", { length: 64 }).notNull().default("MANUAL"),
    blockingErrorCount: integer("blocking_error_count").notNull().default(0),
    warningCount: integer("warning_count").notNull().default(0),
    guidanceCount: integer("guidance_count").notNull().default(0),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("neris_incident_validation_runs_incident_idx").on(table.incidentId, table.createdAt),
  ],
);

export const nerisIncidentValidationResults = pgTable(
  "neris_incident_validation_results",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    runId: uuid("run_id")
      .notNull()
      .references(() => nerisIncidentValidationRuns.id),
    source: varchar("source", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 32 }).notNull(),
    moduleKey: varchar("module_key", { length: 120 }),
    sectionKey: varchar("section_key", { length: 64 }),
    fieldId: uuid("field_id").references(() => nerisFields.id),
    message: text("message").notNull(),
    technicalReference: varchar("technical_reference", { length: 200 }),
    suggestedCorrection: text("suggested_correction"),
    specialtyRecordType: varchar("specialty_record_type", { length: 64 }),
    specialtyRecordId: uuid("specialty_record_id"),
    attachmentId: uuid("attachment_id"),
    correctionPath: varchar("correction_path", { length: 300 }),
    isBlocking: boolean("is_blocking").notNull().default(false),
    reviewStatus: varchar("review_status", { length: 32 }).notNull().default("OPEN"),
    createdAt: createdAtColumn,
  },
  (table) => [index("neris_incident_validation_results_run_idx").on(table.runId, table.severity)],
);

export const nerisIncidentReviewAssignments = pgTable(
  "neris_incident_review_assignments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id),
    status: varchar("status", { length: 32 }).notNull().default("PENDING"),
    submissionNote: text("submission_note"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_review_assignments_incident_idx").on(table.incidentId)],
);

export const nerisIncidentReviewComments = pgTable(
  "neris_incident_review_comments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    assignmentId: uuid("assignment_id").references(() => nerisIncidentReviewAssignments.id),
    sectionKey: varchar("section_key", { length: 64 }),
    fieldId: uuid("field_id").references(() => nerisFields.id),
    specialtyRecordType: varchar("specialty_record_type", { length: 64 }),
    specialtyRecordId: uuid("specialty_record_id"),
    attachmentId: uuid("attachment_id"),
    validationResultId: uuid("validation_result_id"),
    reviewerRole: varchar("reviewer_role", { length: 80 }),
    assignedToUserId: uuid("assigned_to_user_id"),
    status: varchar("status", { length: 32 }).notNull().default("OPEN"),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id"),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_review_comments_incident_idx").on(table.incidentId)],
);

export const nerisIncidentSchemaSnapshots = pgTable(
  "neris_incident_schema_snapshots",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => nerisSchemaVersions.id),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    snapshotJson: jsonb("snapshot_json").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (table) => [uniqueIndex("neris_incident_schema_snapshots_incident_uidx").on(table.incidentId)],
);

export const nerisIncidentConfigurationSnapshots = pgTable(
  "neris_incident_configuration_snapshots",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    trigger: varchar("trigger", { length: 40 }).notNull(),
    snapshotJson: jsonb("snapshot_json").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("neris_incident_configuration_snapshots_incident_idx").on(
      table.incidentId,
      table.createdAt,
    ),
  ],
);

export const nerisIncidentActivity = pgTable(
  "neris_incident_activity",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    activityType: varchar("activity_type", { length: 64 }).notNull(),
    summary: text("summary").notNull(),
    detailsJson: jsonb("details_json").notNull().default({}),
    actorUserId: uuid("actor_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [index("neris_incident_activity_incident_idx").on(table.incidentId, table.createdAt)],
);

export const nerisIncidentNarratives = pgTable(
  "neris_incident_narratives",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    body: text("body").notNull().default(""),
    characterCount: integer("character_count").notNull().default(0),
    templateKey: varchar("template_key", { length: 64 }),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("neris_incident_narratives_incident_uidx").on(table.incidentId)],
);

export const nerisIncidentNarrativeVersions = pgTable(
  "neris_incident_narrative_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    narrativeId: uuid("narrative_id")
      .notNull()
      .references(() => nerisIncidentNarratives.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    body: text("body").notNull(),
    characterCount: integer("character_count").notNull().default(0),
    versionNumber: integer("version_number").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_narrative_versions_uidx").on(
      table.narrativeId,
      table.versionNumber,
    ),
  ],
);
