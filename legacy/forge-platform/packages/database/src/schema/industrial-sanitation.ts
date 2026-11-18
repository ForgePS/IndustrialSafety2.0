/**
 * Grain Facility Sanitation Inspection Module (migration 0091).
 * Lifecycle: inspect → identify → correct → verify → reinspect → close → analyze.
 */
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import {
  industrialCorrectiveActions,
  industrialDepartments,
  industrialEquipment,
  industrialPersonnel,
  industrialSites,
} from "./industrial.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/** Per-site sanitation compliance profile (facility types + frameworks). */
export const industrialSanitationFacilityProfiles = pgTable(
  "industrial_sanitation_facility_profiles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => industrialSites.id),
    facilityTypes: jsonb("facility_types").notNull().default([]),
    complianceFrameworks: jsonb("compliance_frameworks").notNull().default([]),
    dustActionThresholdInches: doublePrecision("dust_action_threshold_inches")
      .notNull()
      .default(0.125),
    dustMeasurementUnit: varchar("dust_measurement_unit", { length: 16 })
      .notNull()
      .default("INCHES"),
    priorityHousekeepingEnabled: boolean("priority_housekeeping_enabled").notNull().default(false),
    independentVerificationRequired: boolean("independent_verification_required")
      .notNull()
      .default(true),
    settings: jsonb("settings").notNull().default({}),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_sanitation_facility_profiles_site_uidx")
      .on(t.tenantId, t.siteId)
      .where(sql`${t.archivedAt} is null`),
    index("industrial_sanitation_facility_profiles_tenant_idx").on(t.tenantId, t.status),
  ],
);

export const industrialSanitationZones = pgTable(
  "industrial_sanitation_zones",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    code: varchar("code", { length: 64 }),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isFoodContact: boolean("is_food_contact").notNull().default(false),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_zones_tenant_site_idx").on(t.tenantId, t.siteId, t.sortOrder),
  ],
);

export const industrialSanitationLocations = pgTable(
  "industrial_sanitation_locations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id, {
      onDelete: "set null",
    }),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    building: varchar("building", { length: 200 }),
    area: varchar("area", { length: 300 }),
    name: varchar("name", { length: 500 }).notNull(),
    locationType: varchar("location_type", { length: 64 }).notNull().default("AREA"),
    isPriorityHousekeeping: boolean("is_priority_housekeeping").notNull().default(false),
    priorityReason: varchar("priority_reason", { length: 200 }),
    qrToken: varchar("qr_token", { length: 120 }),
    mapX: doublePrecision("map_x"),
    mapY: doublePrecision("map_y"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_locations_tenant_site_idx").on(t.tenantId, t.siteId, t.name),
    index("industrial_sanitation_locations_zone_idx").on(t.tenantId, t.zoneId),
    uniqueIndex("industrial_sanitation_locations_qr_uidx")
      .on(t.tenantId, t.qrToken)
      .where(sql`${t.qrToken} is not null and ${t.archivedAt} is null`),
  ],
);

/** Versioned inspection / checklist templates (builtin + tenant). */
export const industrialSanitationTemplates = pgTable(
  "industrial_sanitation_templates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    ownershipScope: varchar("ownership_scope", { length: 32 }).notNull().default("PLATFORM_GLOBAL"),
    code: varchar("code", { length: 120 }),
    name: varchar("name", { length: 300 }).notNull(),
    category: varchar("category", { length: 120 }).notNull().default("GENERAL"),
    description: text("description"),
    versionNumber: integer("version_number").notNull().default(1),
    facilityApplicability: jsonb("facility_applicability").notNull().default([]),
    templateJson: jsonb("template_json").notNull().default({}),
    scoringConfig: jsonb("scoring_config").notNull().default({}),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_templates_tenant_idx").on(t.tenantId, t.status, t.category),
    index("industrial_sanitation_templates_code_idx").on(t.code),
  ],
);

export const industrialSanitationInspections = pgTable(
  "industrial_sanitation_inspections",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id),
    equipmentId: uuid("equipment_id").references(() => industrialEquipment.id),
    templateId: uuid("template_id").references(() => industrialSanitationTemplates.id),
    templateVersion: integer("template_version").notNull().default(1),
    inspectionNumber: varchar("inspection_number", { length: 64 }),
    inspectionType: varchar("inspection_type", { length: 120 }).notNull().default("GENERAL"),
    title: varchar("title", { length: 500 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("IN_PROGRESS"),
    complianceStatus: varchar("compliance_status", { length: 64 }),
    scorePercent: doublePrecision("score_percent"),
    severityMax: varchar("severity_max", { length: 32 }),
    inspectorPersonnelId: uuid("inspector_personnel_id").references(() => industrialPersonnel.id),
    inspectorUserId: uuid("inspector_user_id").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    shift: varchar("shift", { length: 64 }),
    productLine: varchar("product_line", { length: 200 }),
    productionOrder: varchar("production_order", { length: 120 }),
    responsesJson: jsonb("responses_json").notNull().default({}),
    summaryJson: jsonb("summary_json").notNull().default({}),
    signaturesJson: jsonb("signatures_json").notNull().default([]),
    offlineClientId: varchar("offline_client_id", { length: 120 }),
    parentInspectionId: uuid("parent_inspection_id"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_inspections_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.completedAt,
    ),
    index("industrial_sanitation_inspections_tenant_site_idx").on(
      t.tenantId,
      t.siteId,
      t.inspectionType,
    ),
    index("industrial_sanitation_inspections_number_idx").on(t.tenantId, t.inspectionNumber),
    uniqueIndex("industrial_sanitation_inspections_offline_uidx")
      .on(t.tenantId, t.offlineClientId)
      .where(sql`${t.offlineClientId} is not null`),
  ],
);

export const industrialSanitationFindings = pgTable(
  "industrial_sanitation_findings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    inspectionId: uuid("inspection_id").references(() => industrialSanitationInspections.id, {
      onDelete: "cascade",
    }),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id),
    equipmentId: uuid("equipment_id").references(() => industrialEquipment.id),
    findingNumber: varchar("finding_number", { length: 64 }),
    category: varchar("category", { length: 120 }).notNull().default("GENERAL"),
    subcategory: varchar("subcategory", { length: 120 }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    severity: varchar("severity", { length: 32 }).notNull().default("MINOR"),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    questionKey: varchar("question_key", { length: 120 }),
    regulationRefs: jsonb("regulation_refs").notNull().default([]),
    photosJson: jsonb("photos_json").notNull().default([]),
    isRecurring: boolean("is_recurring").notNull().default(false),
    recurrenceCount: integer("recurrence_count").notNull().default(0),
    stopWork: boolean("stop_work").notNull().default(false),
    productHold: boolean("product_hold").notNull().default(false),
    correctiveActionId: uuid("corrective_action_id").references(
      () => industrialCorrectiveActions.id,
    ),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_findings_tenant_status_idx").on(t.tenantId, t.status, t.severity),
    index("industrial_sanitation_findings_inspection_idx").on(t.tenantId, t.inspectionId),
    index("industrial_sanitation_findings_location_idx").on(t.tenantId, t.locationId, t.category),
  ],
);

export const industrialSanitationDustMeasurements = pgTable(
  "industrial_sanitation_dust_measurements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    inspectionId: uuid("inspection_id").references(() => industrialSanitationInspections.id, {
      onDelete: "set null",
    }),
    findingId: uuid("finding_id").references(() => industrialSanitationFindings.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    measurementNumber: varchar("measurement_number", { length: 64 }),
    surface: varchar("surface", { length: 200 }),
    measurementPoint: varchar("measurement_point", { length: 300 }),
    dustDepth: doublePrecision("dust_depth").notNull(),
    unit: varchar("unit", { length: 16 }).notNull().default("INCHES"),
    dustDepthInches: doublePrecision("dust_depth_inches").notNull(),
    measurementMethod: varchar("measurement_method", { length: 120 }),
    exceedsActionLevel: boolean("exceeds_action_level").notNull().default(false),
    actionThresholdInches: doublePrecision("action_threshold_inches").notNull().default(0.125),
    isPriorityArea: boolean("is_priority_area").notNull().default(false),
    inspectorPersonnelId: uuid("inspector_personnel_id").references(() => industrialPersonnel.id),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
    photosJson: jsonb("photos_json").notNull().default([]),
    comments: text("comments"),
    remeasurementOfId: uuid("remeasurement_of_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_dust_tenant_alert_idx").on(
      t.tenantId,
      t.exceedsActionLevel,
      t.measuredAt,
    ),
    index("industrial_sanitation_dust_location_idx").on(t.tenantId, t.locationId, t.measuredAt),
  ],
);

export const industrialSanitationMasterSchedule = pgTable(
  "industrial_sanitation_master_schedule",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id),
    equipmentId: uuid("equipment_id").references(() => industrialEquipment.id),
    title: varchar("title", { length: 500 }).notNull(),
    cleaningTask: varchar("cleaning_task", { length: 500 }).notNull(),
    cleaningProcedure: text("cleaning_procedure"),
    frequency: varchar("frequency", { length: 64 }).notNull().default("DAILY"),
    frequencyCustom: varchar("frequency_custom", { length: 200 }),
    cleaningMethod: varchar("cleaning_method", { length: 200 }),
    assignedDepartmentId: uuid("assigned_department_id").references(() => industrialDepartments.id),
    assignedPersonnelId: uuid("assigned_personnel_id").references(() => industrialPersonnel.id),
    estimatedDurationMinutes: integer("estimated_duration_minutes"),
    requiredShutdown: boolean("required_shutdown").notNull().default(false),
    lotoRequired: boolean("loto_required").notNull().default(false),
    confinedSpaceRequired: boolean("confined_space_required").notNull().default(false),
    ppeRequired: jsonb("ppe_required").notNull().default([]),
    chemicalsRequired: jsonb("chemicals_required").notNull().default([]),
    toolsRequired: jsonb("tools_required").notNull().default([]),
    foodContactSurface: boolean("food_contact_surface").notNull().default(false),
    allergenConcern: boolean("allergen_concern").notNull().default(false),
    dustHazard: boolean("dust_hazard").notNull().default(false),
    verificationRequired: boolean("verification_required").notNull().default(true),
    verificationMethod: varchar("verification_method", { length: 120 }),
    sopDocumentId: uuid("sop_document_id"),
    referenceImagesJson: jsonb("reference_images_json").notNull().default([]),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    revisionNumber: integer("revision_number").notNull().default(1),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_mss_tenant_due_idx").on(t.tenantId, t.status, t.nextDueAt),
    index("industrial_sanitation_mss_site_idx").on(t.tenantId, t.siteId, t.frequency),
  ],
);

export const industrialSanitationCleaningTasks = pgTable(
  "industrial_sanitation_cleaning_tasks",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    masterScheduleId: uuid("master_schedule_id").references(
      () => industrialSanitationMasterSchedule.id,
      { onDelete: "set null" },
    ),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id),
    equipmentId: uuid("equipment_id").references(() => industrialEquipment.id),
    taskNumber: varchar("task_number", { length: 64 }),
    title: varchar("title", { length: 500 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("SCHEDULED"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assignedPersonnelId: uuid("assigned_personnel_id").references(() => industrialPersonnel.id),
    assignedUserId: uuid("assigned_user_id").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    chemicalsUsed: jsonb("chemicals_used").notNull().default([]),
    equipmentUsed: jsonb("equipment_used").notNull().default([]),
    beforePhotosJson: jsonb("before_photos_json").notNull().default([]),
    afterPhotosJson: jsonb("after_photos_json").notNull().default([]),
    issuesFound: text("issues_found"),
    notes: text("notes"),
    cleanerSignatureJson: jsonb("cleaner_signature_json"),
    verificationRequired: boolean("verification_required").notNull().default(true),
    lotoRequired: boolean("loto_required").notNull().default(false),
    lotoRecordId: uuid("loto_record_id"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_cleaning_tenant_status_idx").on(t.tenantId, t.status, t.dueAt),
    index("industrial_sanitation_cleaning_assignee_idx").on(t.tenantId, t.assignedUserId, t.status),
    index("industrial_sanitation_cleaning_mss_idx").on(t.tenantId, t.masterScheduleId),
  ],
);

export const industrialSanitationVerifications = pgTable(
  "industrial_sanitation_verifications",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    cleaningTaskId: uuid("cleaning_task_id").references(
      () => industrialSanitationCleaningTasks.id,
      {
        onDelete: "cascade",
      },
    ),
    inspectionId: uuid("inspection_id").references(() => industrialSanitationInspections.id, {
      onDelete: "set null",
    }),
    findingId: uuid("finding_id").references(() => industrialSanitationFindings.id, {
      onDelete: "set null",
    }),
    method: varchar("method", { length: 64 }).notNull().default("VISUAL"),
    result: varchar("result", { length: 64 }).notNull().default("PASS"),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id),
    verifiedByPersonnelId: uuid("verified_by_personnel_id").references(
      () => industrialPersonnel.id,
    ),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    photosJson: jsonb("photos_json").notNull().default([]),
    resultData: jsonb("result_data").notNull().default({}),
    signatureJson: jsonb("signature_json"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_verifications_task_idx").on(t.tenantId, t.cleaningTaskId),
    index("industrial_sanitation_verifications_result_idx").on(t.tenantId, t.result, t.verifiedAt),
  ],
);

export const industrialSanitationSpills = pgTable(
  "industrial_sanitation_spills",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    spillNumber: varchar("spill_number", { length: 64 }),
    building: varchar("building", { length: 200 }),
    area: varchar("area", { length: 300 }),
    exactLocation: varchar("exact_location", { length: 500 }),
    product: varchar("product", { length: 300 }),
    estimatedQuantity: varchar("estimated_quantity", { length: 120 }),
    cause: text("cause"),
    equipmentInvolved: varchar("equipment_involved", { length: 300 }),
    slipFallHazard: boolean("slip_fall_hazard").notNull().default(false),
    dustHazard: boolean("dust_hazard").notNull().default(false),
    contaminationConcern: boolean("contamination_concern").notNull().default(false),
    pestConcern: boolean("pest_concern").notNull().default(false),
    productionImpact: text("production_impact"),
    status: varchar("status", { length: 64 }).notNull().default("REPORTED"),
    photosJson: jsonb("photos_json").notNull().default([]),
    actionsJson: jsonb("actions_json").notNull().default([]),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    cleanedAt: timestamp("cleaned_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    correctiveActionId: uuid("corrective_action_id").references(
      () => industrialCorrectiveActions.id,
    ),
    notes: text("notes"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_spills_tenant_status_idx").on(t.tenantId, t.status, t.reportedAt),
    index("industrial_sanitation_spills_site_idx").on(t.tenantId, t.siteId),
  ],
);

export const industrialSanitationPestDevices = pgTable(
  "industrial_sanitation_pest_devices",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id),
    deviceNumber: varchar("device_number", { length: 64 }),
    qrToken: varchar("qr_token", { length: 120 }),
    deviceType: varchar("device_type", { length: 64 }).notNull().default("TRAP"),
    pestType: varchar("pest_type", { length: 64 }),
    building: varchar("building", { length: 200 }),
    area: varchar("area", { length: 300 }),
    mapX: doublePrecision("map_x"),
    mapY: doublePrecision("map_y"),
    serviceFrequency: varchar("service_frequency", { length: 64 }).notNull().default("WEEKLY"),
    vendor: varchar("vendor", { length: 200 }),
    lastInspectedAt: timestamp("last_inspected_at", { withTimezone: true }),
    nextInspectionAt: timestamp("next_inspection_at", { withTimezone: true }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_pest_devices_tenant_idx").on(t.tenantId, t.siteId, t.status),
    uniqueIndex("industrial_sanitation_pest_devices_qr_uidx")
      .on(t.tenantId, t.qrToken)
      .where(sql`${t.qrToken} is not null and ${t.archivedAt} is null`),
  ],
);

export const industrialSanitationPestFindings = pgTable(
  "industrial_sanitation_pest_findings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    deviceId: uuid("device_id").references(() => industrialSanitationPestDevices.id, {
      onDelete: "set null",
    }),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    inspectionId: uuid("inspection_id").references(() => industrialSanitationInspections.id, {
      onDelete: "set null",
    }),
    pestSpecies: varchar("pest_species", { length: 120 }),
    pestCategory: varchar("pest_category", { length: 64 }).notNull().default("OTHER"),
    numberObserved: integer("number_observed"),
    activityLevel: varchar("activity_level", { length: 64 }),
    evidence: text("evidence"),
    droppings: boolean("droppings").notNull().default(false),
    nesting: boolean("nesting").notNull().default(false),
    entryPoint: varchar("entry_point", { length: 300 }),
    productExposure: boolean("product_exposure").notNull().default(false),
    photosJson: jsonb("photos_json").notNull().default([]),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    correctiveActionId: uuid("corrective_action_id").references(
      () => industrialCorrectiveActions.id,
    ),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_pest_findings_tenant_idx").on(t.tenantId, t.status, t.observedAt),
    index("industrial_sanitation_pest_findings_device_idx").on(t.tenantId, t.deviceId),
  ],
);

export const industrialSanitationChemicals = pgTable(
  "industrial_sanitation_chemicals",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    name: varchar("name", { length: 300 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 200 }),
    sdsDocumentId: uuid("sds_document_id"),
    intendedUse: text("intended_use"),
    approvedAreas: jsonb("approved_areas").notNull().default([]),
    restrictedAreas: jsonb("restricted_areas").notNull().default([]),
    concentration: varchar("concentration", { length: 120 }),
    applicationMethod: varchar("application_method", { length: 200 }),
    contactTime: varchar("contact_time", { length: 120 }),
    ppeRequired: jsonb("ppe_required").notNull().default([]),
    foodContactApproved: boolean("food_contact_approved").notNull().default(false),
    storageLocation: varchar("storage_location", { length: 300 }),
    expirationDate: timestamp("expiration_date", { withTimezone: true }),
    lotNumber: varchar("lot_number", { length: 120 }),
    status: varchar("status", { length: 64 }).notNull().default("APPROVED"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_sanitation_chemicals_tenant_idx").on(t.tenantId, t.siteId, t.status)],
);

export const industrialSanitationEnvironmentalSamples = pgTable(
  "industrial_sanitation_environmental_samples",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    zoneId: uuid("zone_id").references(() => industrialSanitationZones.id),
    sampleNumber: varchar("sample_number", { length: 64 }),
    samplePoint: varchar("sample_point", { length: 300 }),
    sampleType: varchar("sample_type", { length: 64 }).notNull().default("ATP"),
    testName: varchar("test_name", { length: 200 }),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
    collectedByUserId: uuid("collected_by_user_id").references(() => users.id),
    laboratory: varchar("laboratory", { length: 200 }),
    lotBatch: varchar("lot_batch", { length: 120 }),
    result: varchar("result", { length: 200 }),
    resultUnits: varchar("result_units", { length: 64 }),
    detectionLimit: varchar("detection_limit", { length: 64 }),
    passFail: varchar("pass_fail", { length: 32 }),
    attachmentsJson: jsonb("attachments_json").notNull().default([]),
    correctiveActionId: uuid("corrective_action_id").references(
      () => industrialCorrectiveActions.id,
    ),
    status: varchar("status", { length: 64 }).notNull().default("PENDING"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_env_samples_tenant_idx").on(t.tenantId, t.status, t.collectedAt),
  ],
);

export const industrialSanitationCompressedAirRequests = pgTable(
  "industrial_sanitation_compressed_air_requests",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    requestNumber: varchar("request_number", { length: 64 }),
    areaIdentified: varchar("area_identified", { length: 500 }).notNull(),
    cleaningReason: text("cleaning_reason"),
    equipmentStatusConfirmed: boolean("equipment_status_confirmed").notNull().default(false),
    ignitionSourcesAddressed: boolean("ignition_sources_addressed").notNull().default(false),
    otherIgnitionControlled: boolean("other_ignition_controlled").notNull().default(false),
    ppeConfirmed: boolean("ppe_confirmed").notNull().default(false),
    areaBarricaded: boolean("area_barricaded").notNull().default(false),
    dustCollectionReviewed: boolean("dust_collection_reviewed").notNull().default(false),
    status: varchar("status", { length: 64 }).notNull().default("REQUESTED"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    denialReason: text("denial_reason"),
    notes: text("notes"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_sanitation_compressed_air_tenant_idx").on(t.tenantId, t.status)],
);

export const industrialSanitationConcernReports = pgTable(
  "industrial_sanitation_concern_reports",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    locationId: uuid("location_id").references(() => industrialSanitationLocations.id),
    concernType: varchar("concern_type", { length: 64 }).notNull(),
    description: text("description"),
    photosJson: jsonb("photos_json").notNull().default([]),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    routedDepartmentId: uuid("routed_department_id").references(() => industrialDepartments.id),
    findingId: uuid("finding_id").references(() => industrialSanitationFindings.id),
    reportedByUserId: uuid("reported_by_user_id").references(() => users.id),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sanitation_concerns_tenant_idx").on(t.tenantId, t.status, t.reportedAt),
  ],
);

export const industrialSanitationSequenceCounters = pgTable(
  "industrial_sanitation_sequence_counters",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sequenceKey: varchar("sequence_key", { length: 64 }).notNull(),
    year: integer("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_sanitation_sequence_counters_uidx").on(
      t.tenantId,
      t.sequenceKey,
      t.year,
    ),
  ],
);

/** Tenant-scoped Sanitation workspace tab visibility (Admin / Creator). */
export const industrialSanitationUiSettings = pgTable(
  "industrial_sanitation_ui_settings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    disabledTabs: jsonb("disabled_tabs").notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [uniqueIndex("industrial_sanitation_ui_settings_tenant_uidx").on(t.tenantId)],
);
