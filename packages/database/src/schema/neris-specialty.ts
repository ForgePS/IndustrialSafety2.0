/**
 * NERIS Phase 3 specialty repeatable records, attachments, and master-data proposals.
 */
import {
  boolean,
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
import { nerisIncidents } from "./neris-incidents.js";
import { rmsOccupancies, rmsPersonnel, rmsPreplans, rmsUnits } from "./rms-master.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const forgeDocuments = pgTable(
  "forge_documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    storedFilename: varchar("stored_filename", { length: 500 }).notNull(),
    objectKey: varchar("object_key", { length: 1000 }).notNull(),
    bucketName: varchar("bucket_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull().default(0),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    securityClassification: varchar("security_classification", { length: 40 })
      .notNull()
      .default("INTERNAL"),
    malwareScanStatus: varchar("malware_scan_status", { length: 40 }).notNull().default("PENDING"),
    malwareScanDetail: text("malware_scan_detail"),
    retentionRule: varchar("retention_rule", { length: 80 }).notNull().default("INCIDENT_DEFAULT"),
    uploadStatus: varchar("upload_status", { length: 40 }).notNull().default("INITIALIZED"),
    source: varchar("source", { length: 40 }).notNull().default("RMS_WEB"),
    captureAt: timestamp("capture_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("forge_documents_tenant_idx").on(table.tenantId),
    uniqueIndex("forge_documents_tenant_object_uidx").on(table.tenantId, table.objectKey),
  ],
);

export const nerisIncidentAttachments = pgTable(
  "neris_incident_attachments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => forgeDocuments.id),
    specialtySection: varchar("specialty_section", { length: 64 }),
    repeatableRecordType: varchar("repeatable_record_type", { length: 64 }),
    repeatableRecordId: uuid("repeatable_record_id"),
    category: varchar("category", { length: 80 }).notNull().default("OTHER"),
    caption: text("caption"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("neris_incident_attachments_incident_idx").on(table.incidentId),
    index("neris_incident_attachments_record_idx").on(
      table.repeatableRecordType,
      table.repeatableRecordId,
    ),
  ],
);

export const nerisIncidentExposures = pgTable(
  "neris_incident_exposures",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    exposureNumber: integer("exposure_number").notNull(),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    completionStatus: varchar("completion_status", { length: 40 }).notNull().default("INCOMPLETE"),
    addressLine1: varchar("address_line1", { length: 300 }),
    addressLine2: varchar("address_line2", { length: 300 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 64 }),
    postalCode: varchar("postal_code", { length: 32 }),
    locationDescription: text("location_description"),
    occupancyId: uuid("occupancy_id").references(() => rmsOccupancies.id),
    preplanId: uuid("preplan_id").references(() => rmsPreplans.id),
    propertyUse: varchar("property_use", { length: 120 }),
    constructionDetails: text("construction_details"),
    fireSpreadMechanism: varchar("fire_spread_mechanism", { length: 120 }),
    fireOriginRelationship: varchar("fire_origin_relationship", { length: 120 }),
    damageDescription: text("damage_description"),
    propertyLoss: numeric("property_loss"),
    contentLoss: numeric("content_loss"),
    propertyValue: numeric("property_value"),
    contentValue: numeric("content_value"),
    lossExceptionNote: text("loss_exception_note"),
    suppressionActions: text("suppression_actions"),
    alarmSystemsSummary: text("alarm_systems_summary"),
    protectionSystemsSummary: text("protection_systems_summary"),
    civilianCasualtyCount: integer("civilian_casualty_count").notNull().default(0),
    fireServiceCasualtyCount: integer("fire_service_casualty_count").notNull().default(0),
    narrative: text("narrative"),
    locationExceptionNote: text("location_exception_note"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_exposures_number_uidx").on(table.incidentId, table.exposureNumber),
    index("neris_incident_exposures_incident_idx").on(table.incidentId, table.status),
  ],
);

export const nerisIncidentCivilianCasualties = pgTable(
  "neris_incident_civilian_casualties",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    exposureId: uuid("exposure_id").references(() => nerisIncidentExposures.id),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    reviewStatus: varchar("review_status", { length: 40 }).notNull().default("OPEN"),
    personKnown: boolean("person_known").notNull().default(false),
    /** Restricted — require civilian_casualty.view; masked in list views. */
    displayName: varchar("display_name", { length: 200 }),
    age: integer("age"),
    ageRange: varchar("age_range", { length: 40 }),
    sex: varchar("sex", { length: 40 }),
    civilianRole: varchar("civilian_role", { length: 80 }),
    relationshipToProperty: varchar("relationship_to_property", { length: 120 }),
    locationAtInjury: text("location_at_injury"),
    locationFound: text("location_found"),
    activityAtInjury: varchar("activity_at_injury", { length: 120 }),
    injuryCause: varchar("injury_cause", { length: 120 }),
    injuryType: varchar("injury_type", { length: 120 }),
    injurySeverity: varchar("injury_severity", { length: 80 }),
    conditionAtArrival: varchar("condition_at_arrival", { length: 120 }),
    rescueInvolvement: boolean("rescue_involvement").notNull().default(false),
    contributingFactors: text("contributing_factors"),
    mobilityLimitations: text("mobility_limitations"),
    evacuationLimitations: text("evacuation_limitations"),
    protectiveEquipment: text("protective_equipment"),
    smokeAlarmAwareness: varchar("smoke_alarm_awareness", { length: 80 }),
    treatmentProvided: text("treatment_provided"),
    transportStatus: varchar("transport_status", { length: 80 }),
    destinationReference: varchar("destination_reference", { length: 200 }),
    transportExceptionNote: text("transport_exception_note"),
    outcome: varchar("outcome", { length: 80 }),
    fatality: boolean("fatality").notNull().default(false),
    /** Future ePCR encounter link — no clinical payload stored here. */
    epcrEncounterRef: varchar("epcr_encounter_ref", { length: 120 }),
    narrative: text("narrative"),
    unknownPersonHandling: varchar("unknown_person_handling", { length: 80 }),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("neris_incident_civilian_casualties_incident_idx").on(table.incidentId, table.status),
  ],
);

export const nerisIncidentFireServiceCasualties = pgTable(
  "neris_incident_fire_service_casualties",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    exposureId: uuid("exposure_id").references(() => nerisIncidentExposures.id),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    safetyReviewStatus: varchar("safety_review_status", { length: 40 }).notNull().default("OPEN"),
    personnelId: uuid("personnel_id").references(() => rmsPersonnel.id),
    /** Snapshot so identity survives employment changes. */
    personnelDisplayName: varchar("personnel_display_name", { length: 200 }),
    personnelUnknownException: text("personnel_unknown_exception"),
    unitId: uuid("unit_id").references(() => rmsUnits.id),
    assignment: varchar("assignment", { length: 120 }),
    rank: varchar("rank", { length: 80 }),
    incidentActivity: varchar("incident_activity", { length: 120 }),
    injuryLocation: text("injury_location"),
    injuryType: varchar("injury_type", { length: 120 }),
    injurySeverity: varchar("injury_severity", { length: 80 }),
    exposureCategory: varchar("exposure_category", { length: 120 }),
    ppeUse: varchar("ppe_use", { length: 80 }),
    scbaUse: varchar("scba_use", { length: 80 }),
    passStatus: varchar("pass_status", { length: 80 }),
    mayday: boolean("mayday").notNull().default(false),
    maydayDetails: text("mayday_details"),
    rapidIntervention: boolean("rapid_intervention").notNull().default(false),
    equipmentFailure: text("equipment_failure"),
    apparatusInvolvement: text("apparatus_involvement"),
    treatmentStatus: varchar("treatment_status", { length: 80 }),
    transportStatus: varchar("transport_status", { length: 80 }),
    lostTimeStatus: varchar("lost_time_status", { length: 80 }),
    returnToDutyStatus: varchar("return_to_duty_status", { length: 80 }),
    contributingFactors: text("contributing_factors"),
    nearMissClassification: varchar("near_miss_classification", { length: 80 }),
    followUpRequirements: text("follow_up_requirements"),
    narrative: text("narrative"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("neris_incident_ff_casualties_incident_idx").on(table.incidentId, table.status),
  ],
);

export const nerisIncidentHazmatSubstances = pgTable(
  "neris_incident_hazmat_substances",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    productName: varchar("product_name", { length: 200 }).notNull(),
    unNaNumber: varchar("un_na_number", { length: 32 }),
    casNumber: varchar("cas_number", { length: 40 }),
    hazardClass: varchar("hazard_class", { length: 80 }),
    physicalState: varchar("physical_state", { length: 40 }),
    quantityReleased: numeric("quantity_released"),
    quantityThreatened: numeric("quantity_threatened"),
    unitOfMeasure: varchar("unit_of_measure", { length: 40 }),
    releaseStatus: varchar("release_status", { length: 80 }),
    exposureRoutes: jsonb("exposure_routes").$type<string[]>().default([]),
    environmentalImpact: text("environmental_impact"),
    waterwayImpact: text("waterway_impact"),
    responsibleParty: text("responsible_party"),
    narrative: text("narrative"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_hazmat_substances_incident_idx").on(table.incidentId)],
);

export const nerisIncidentHazmatContainers = pgTable(
  "neris_incident_hazmat_containers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    substanceId: uuid("substance_id").references(() => nerisIncidentHazmatSubstances.id),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    containerType: varchar("container_type", { length: 120 }).notNull(),
    capacity: numeric("capacity"),
    capacityUnit: varchar("capacity_unit", { length: 40 }),
    productName: varchar("product_name", { length: 200 }),
    damage: text("damage"),
    leakLocation: varchar("leak_location", { length: 120 }),
    pressureStatus: varchar("pressure_status", { length: 80 }),
    controlAction: text("control_action"),
    recoveryStatus: varchar("recovery_status", { length: 80 }),
    disposalStatus: varchar("disposal_status", { length: 80 }),
    narrative: text("narrative"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_hazmat_containers_incident_idx").on(table.incidentId)],
);

export const nerisIncidentAlarmSystems = pgTable(
  "neris_incident_alarm_systems",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    exposureId: uuid("exposure_id").references(() => nerisIncidentExposures.id),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    systemType: varchar("system_type", { length: 80 }).notNull().default("ALARM"),
    deviceType: varchar("device_type", { length: 120 }),
    location: varchar("location", { length: 200 }),
    presence: varchar("presence", { length: 40 }),
    activation: varchar("activation", { length: 80 }),
    operation: varchar("operation", { length: 80 }),
    effectiveness: varchar("effectiveness", { length: 80 }),
    impairment: boolean("impairment").notNull().default(false),
    failureReason: text("failure_reason"),
    numberActivated: integer("number_activated"),
    numberActivatedUnknown: boolean("number_activated_unknown").notNull().default(false),
    manualIntervention: boolean("manual_intervention").notNull().default(false),
    contractor: varchar("contractor", { length: 200 }),
    correctiveAction: text("corrective_action"),
    inspectionReferral: text("inspection_referral"),
    reviewComments: text("review_comments"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_alarm_systems_incident_idx").on(table.incidentId)],
);

export const nerisIncidentProtectionSystems = pgTable(
  "neris_incident_protection_systems",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    exposureId: uuid("exposure_id").references(() => nerisIncidentExposures.id),
    status: varchar("status", { length: 40 }).notNull().default("ACTIVE"),
    systemType: varchar("system_type", { length: 80 }).notNull(),
    location: varchar("location", { length: 200 }),
    presence: varchar("presence", { length: 40 }),
    activation: varchar("activation", { length: 80 }),
    operation: varchar("operation", { length: 80 }),
    effectiveness: varchar("effectiveness", { length: 80 }),
    impairment: boolean("impairment").notNull().default(false),
    failureReason: text("failure_reason"),
    numberActivated: integer("number_activated"),
    numberActivatedUnknown: boolean("number_activated_unknown").notNull().default(false),
    manualIntervention: boolean("manual_intervention").notNull().default(false),
    contractor: varchar("contractor", { length: 200 }),
    correctiveAction: text("corrective_action"),
    inspectionReferral: text("inspection_referral"),
    reviewComments: text("review_comments"),
    recordVersion: recordVersionColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedByUserId: uuid("archived_by_user_id"),
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [index("neris_incident_protection_systems_incident_idx").on(table.incidentId)],
);

export const nerisIncidentOccupancyLinks = pgTable(
  "neris_incident_occupancy_links",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    exposureId: uuid("exposure_id").references(() => nerisIncidentExposures.id),
    occupancyId: uuid("occupancy_id").references(() => rmsOccupancies.id),
    preplanId: uuid("preplan_id").references(() => rmsPreplans.id),
    prefillSource: varchar("prefill_source", { length: 40 }).notNull().default("OCCUPANCY"),
    snapshotJson: jsonb("snapshot_json").notNull().default({}),
    incidentCorrectionsJson: jsonb("incident_corrections_json").notNull().default({}),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    updatedByUserId: uuid("updated_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("neris_incident_occupancy_links_incident_idx").on(table.incidentId),
    uniqueIndex("neris_incident_occupancy_links_scope_uidx").on(
      table.incidentId,
      table.exposureId,
      table.occupancyId,
    ),
  ],
);

export const nerisProposedMasterUpdates = pgTable(
  "neris_proposed_master_updates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: uuid("target_id").notNull(),
    status: varchar("status", { length: 40 }).notNull().default("PROPOSED"),
    proposedChangesJson: jsonb("proposed_changes_json").notNull().default({}),
    reviewNote: text("review_note"),
    reviewedByUserId: uuid("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedByUserId: uuid("applied_by_user_id"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    index("neris_proposed_master_updates_tenant_status_idx").on(table.tenantId, table.status),
    index("neris_proposed_master_updates_incident_idx").on(table.incidentId),
  ],
);

export const nerisIncidentSectionApprovals = pgTable(
  "neris_incident_section_approvals",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    sectionKey: varchar("section_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("APPROVED"),
    reviewerRole: varchar("reviewer_role", { length: 80 }),
    note: text("note"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_incident_section_approvals_uidx").on(table.incidentId, table.sectionKey),
  ],
);

/** Exposure numbering sequence per incident (transaction-safe). */
export const nerisIncidentExposureSequences = pgTable(
  "neris_incident_exposure_sequences",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    nextValue: integer("next_value").notNull().default(1),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("neris_incident_exposure_sequences_incident_uidx").on(table.incidentId)],
);

/** Soft-typed casualty access audit (no restricted payload). */
export const nerisCasualtyAccessAudit = pgTable(
  "neris_casualty_access_audit",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => nerisIncidents.id),
    casualtyType: varchar("casualty_type", { length: 40 }).notNull(),
    casualtyId: uuid("casualty_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    action: varchar("action", { length: 40 }).notNull(),
    correlationId: varchar("correlation_id", { length: 64 }),
    createdAt: createdAtColumn,
  },
  (table) => [index("neris_casualty_access_audit_incident_idx").on(table.incidentId)],
);
