/**
 * Industrial domain Drizzle schema (INDUSTRIAL-DDL-S1).
 * Mirrors packages/database/drizzle/0040_industrial_domain_s1.sql core tables.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  bigint,
  date,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const sourceCols = {
  sourceSystem: varchar("source_system", { length: 64 }).notNull().default("FIREBASE"),
  sourceProject: varchar("source_project", { length: 128 }),
  sourceCollection: varchar("source_collection", { length: 128 }),
  sourceDocumentId: varchar("source_document_id", { length: 256 }),
  sourcePath: varchar("source_path", { length: 512 }),
  sourcePayload: jsonb("source_payload").notNull().default({}),
};

export const industrialSites = pgTable(
  "industrial_sites",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 300 }).notNull(),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    siteKey: varchar("site_key", { length: 120 }),
    timezone: varchar("timezone", { length: 64 }),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_sites_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("industrial_sites_source_uidx").on(
      t.tenantId,
      t.sourceCollection,
      t.sourceDocumentId,
    ),
  ],
);

export const industrialDepartments = pgTable(
  "industrial_departments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    name: varchar("name", { length: 300 }).notNull(),
    divisionName: varchar("division_name", { length: 300 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    contactPersonnelId: uuid("contact_personnel_id"),
    contactName: varchar("contact_name", { length: 300 }),
    contactEmail: varchar("contact_email", { length: 320 }),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_departments_tenant_site_idx").on(t.tenantId, t.siteId),
    index("industrial_departments_tenant_site_division_idx").on(
      t.tenantId,
      t.siteId,
      t.divisionName,
    ),
  ],
);

export const industrialPositions = pgTable(
  "industrial_positions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_positions_tenant_dept_idx").on(t.tenantId, t.departmentId),
    uniqueIndex("industrial_positions_tenant_name_uidx").on(t.tenantId, t.name),
  ],
);

export const industrialEmploymentTypes = pgTable(
  "industrial_employment_types",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 1000 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("industrial_employment_types_tenant_name_uidx").on(t.tenantId, t.name)],
);

export const industrialPersonnel = pgTable(
  "industrial_personnel",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    positionId: uuid("position_id").references(() => industrialPositions.id),
    employmentTypeId: uuid("employment_type_id").references(() => industrialEmploymentTypes.id),
    employeeNumber: varchar("employee_number", { length: 120 }),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    firstName: varchar("first_name", { length: 150 }),
    middleName: varchar("middle_name", { length: 150 }),
    lastName: varchar("last_name", { length: 150 }),
    suffix: varchar("suffix", { length: 32 }),
    preferredName: varchar("preferred_name", { length: 150 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    companyPhone: varchar("company_phone", { length: 40 }),
    companyEmail: varchar("company_email", { length: 320 }),
    /** Emergency Alerts SMS opt-in (10DLC). Notification number is `phone`. */
    smsAuthorizedAt: timestamp("sms_authorized_at", { withTimezone: true }),
    smsAuthorizedByUserId: uuid("sms_authorized_by_user_id").references(() => users.id),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    hireDate: date("hire_date"),
    dateOfBirth: date("date_of_birth"),
    // Home address + sex for WC / OSHA Form 301 seeding (migration 0099).
    street: varchar("street", { length: 300 }),
    city: varchar("city", { length: 120 }),
    state: varchar("state", { length: 64 }),
    zip: varchar("zip", { length: 32 }),
    gender: varchar("gender", { length: 32 }),
    supervisorName: varchar("supervisor_name", { length: 300 }),
    // Add Person template parity with legacy Firebase personnelRecords (migration 0043).
    // Free-text assignment names coexist with the site/department/position FKs: imported
    // records often carry names with no matching lookup row.
    jobTitle: varchar("job_title", { length: 300 }),
    departmentName: varchar("department_name", { length: 300 }),
    companyName: varchar("company_name", { length: 300 }),
    divisionName: varchar("division_name", { length: 300 }),
    fileBase: varchar("file_base", { length: 300 }),
    userAuthId: varchar("user_auth_id", { length: 320 }),
    digitalSource: varchar("digital_source", { length: 200 }),
    isCompanyDriver: boolean("is_company_driver").notNull().default(false),
    isDotDriver: boolean("is_dot_driver").notNull().default(false),
    tracksPrescriptionSafetyGlasses: boolean("tracks_prescription_safety_glasses")
      .notNull()
      .default(false),
    prescriptionSafetyGlassesIssuedDate: date("prescription_safety_glasses_issued_date"),
    prescriptionSafetyGlassesExpiresDate: date("prescription_safety_glasses_expires_date"),
    prescriptionSafetyGlassesExtraPairApproved: boolean(
      "prescription_safety_glasses_extra_pair_approved",
    )
      .notNull()
      .default(false),
    prescriptionSafetyGlassesExtraPairApprovedBy: varchar(
      "prescription_safety_glasses_extra_pair_approved_by",
      { length: 300 },
    ),
    prescriptionSafetyGlassesExtraPairApprovedDate: date(
      "prescription_safety_glasses_extra_pair_approved_date",
    ),
    prescriptionSafetyGlassesExtraPairReason: text("prescription_safety_glasses_extra_pair_reason"),
    safetyFootwearClass: varchar("safety_footwear_class", { length: 32 }),
    safetyFootwearIssuedDate: date("safety_footwear_issued_date"),
    safetyFootwearExpiresDate: date("safety_footwear_expires_date"),
    safetyFootwearExtraPairApproved: boolean("safety_footwear_extra_pair_approved")
      .notNull()
      .default(false),
    safetyFootwearExtraPairApprovedBy: varchar("safety_footwear_extra_pair_approved_by", {
      length: 300,
    }),
    safetyFootwearExtraPairApprovedDate: date("safety_footwear_extra_pair_approved_date"),
    safetyFootwearExtraPairReason: text("safety_footwear_extra_pair_reason"),
    tracksFirstAid: boolean("tracks_first_aid").notNull().default(false),
    cprCertificationExpiresDate: date("cpr_certification_expires_date"),
    firstAidCertificationExpiresDate: date("first_aid_certification_expires_date"),
    cprCertificationDocumentId: uuid("cpr_certification_document_id"),
    firstAidCertificationDocumentId: uuid("first_aid_certification_document_id"),
    notes: text("notes"),
    signatureUrl: text("signature_url"),
    // Medical + dual emergency contacts (migration 0045).
    allergies: text("allergies"),
    medicalHistory: text("medical_history"),
    emergencyContact1Name: varchar("emergency_contact_1_name", { length: 300 }),
    emergencyContact1Phone: varchar("emergency_contact_1_phone", { length: 40 }),
    emergencyContact1Relationship: varchar("emergency_contact_1_relationship", { length: 120 }),
    emergencyContact2Name: varchar("emergency_contact_2_name", { length: 300 }),
    emergencyContact2Phone: varchar("emergency_contact_2_phone", { length: 40 }),
    emergencyContact2Relationship: varchar("emergency_contact_2_relationship", { length: 120 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_personnel_tenant_status_idx").on(t.tenantId, t.status)],
);

export const industrialEquipment = pgTable(
  "industrial_equipment",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    name: varchar("name", { length: 300 }).notNull(),
    equipmentNumber: varchar("equipment_number", { length: 120 }),
    equipmentType: varchar("equipment_type", { length: 120 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_equipment_tenant_status_idx").on(t.tenantId, t.status)],
);

export const industrialLotoProcedures = pgTable(
  "industrial_loto_procedures",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    equipmentId: uuid("equipment_id").references(() => industrialEquipment.id),
    title: varchar("title", { length: 500 }).notNull(),
    procedureNumber: varchar("procedure_number", { length: 120 }),
    revision: varchar("revision", { length: 64 }),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_loto_procedures_tenant_status_idx").on(t.tenantId, t.status)],
);

export const industrialLotoLibraries = pgTable("industrial_loto_libraries", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  kind: varchar("kind", { length: 64 }).notNull(),
  shortName: varchar("short_name", { length: 200 }),
  text: text("text"),
  active: boolean("active").notNull().default(true),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialLotoRecords = pgTable("industrial_loto_records", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  procedureId: uuid("procedure_id").references(() => industrialLotoProcedures.id),
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 64 }).notNull().default("OPEN"),
  dueDate: date("due_date"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialCorrectiveActions = pgTable(
  "industrial_corrective_actions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    parentEntityType: varchar("parent_entity_type", { length: 64 }).notNull(),
    parentEntityId: uuid("parent_entity_id"),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    finding: text("finding"),
    requiredAction: text("required_action"),
    priority: varchar("priority", { length: 32 }),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    assignedPersonnelId: uuid("assigned_personnel_id").references(() => industrialPersonnel.id),
    ownerName: varchar("owner_name", { length: 300 }),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    evidenceNotes: text("evidence_notes"),
    closeoutTokenHash: varchar("closeout_token_hash", { length: 128 }),
    closeoutTokenExpiresAt: timestamp("closeout_token_expires_at", { withTimezone: true }),
    closeoutCompletedByName: varchar("closeout_completed_by_name", { length: 300 }),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_corrective_actions_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_corrective_actions_due_idx").on(t.tenantId, t.dueDate),
    uniqueIndex("industrial_corrective_actions_closeout_token_uidx").on(t.closeoutTokenHash),
  ],
);

export const industrialFleetVehicles = pgTable(
  "industrial_fleet_vehicles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    assetNumber: varchar("asset_number", { length: 64 }),
    assetType: varchar("asset_type", { length: 64 }).notNull().default("FLEET_VEHICLE"),
    customAssetTypeLabel: varchar("custom_asset_type_label", { length: 120 }),
    year: integer("year"),
    make: varchar("make", { length: 120 }),
    model: varchar("model", { length: 120 }),
    trim: varchar("trim", { length: 120 }),
    color: varchar("color", { length: 64 }),
    vin: varchar("vin", { length: 32 }),
    serialNumber: varchar("serial_number", { length: 120 }),
    licensePlate: varchar("license_plate", { length: 64 }),
    licenseState: varchar("license_state", { length: 32 }),
    renewalDate: date("renewal_date"),
    registrationRenewalMonth: integer("registration_renewal_month"),
    locationName: varchar("location_name", { length: 300 }),
    assignedDriverId: uuid("assigned_driver_id"),
    assignedDriverPersonnelId: uuid("assigned_driver_personnel_id").references(
      () => industrialPersonnel.id,
    ),
    assignedDriverName: varchar("assigned_driver_name", { length: 300 }),
    countyAssessed: varchar("county_assessed", { length: 120 }),
    countyAssessmentStatus: varchar("county_assessment_status", { length: 64 }),
    countyAssessmentNotes: text("county_assessment_notes"),
    insured: boolean("insured"),
    insuranceStatus: varchar("insurance_status", { length: 64 }),
    mileage: integer("mileage"),
    mileageUpdatedAt: timestamp("mileage_updated_at", { withTimezone: true }),
    engineHours: integer("engine_hours"),
    engineHoursUpdatedAt: timestamp("engine_hours_updated_at", { withTimezone: true }),
    notes: text("notes"),
    vehicleFringe: boolean("vehicle_fringe"),
    notOnVehicleFringeSs: boolean("not_on_vehicle_fringe_ss"),
    commuteUseStatus: varchar("commute_use_status", { length: 64 }),
    commuteUseNotes: text("commute_use_notes"),
    form2290Status: varchar("form_2290_status", { length: 64 }),
    form2290Notes: text("form_2290_notes"),
    irpStatus: varchar("irp_status", { length: 64 }),
    irpNotes: text("irp_notes"),
    dispositionStatus: varchar("disposition_status", { length: 64 }),
    dispositionDate: date("disposition_date"),
    dispositionNotes: text("disposition_notes"),
    outOfService: boolean("out_of_service").notNull().default(false),
    outOfServiceReason: text("out_of_service_reason"),
    /**
     * When true, this asset is DOT-regulated and must complete DVIRs before
     * operation. Non-commercial assets leave this false and skip DVIR.
     */
    dotRegulated: boolean("dot_regulated").notNull().default(false),
    /** SHA-256 hex of the public DVIR QR token (plaintext returned once on issue). */
    dvirPublicTokenHash: varchar("dvir_public_token_hash", { length: 128 }),
    dvirPublicTokenIssuedAt: timestamp("dvir_public_token_issued_at", { withTimezone: true }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_fleet_vehicles_tenant_vin_uidx").on(t.tenantId, t.vin),
    index("industrial_fleet_vehicles_tenant_type_idx").on(t.tenantId, t.assetType),
    index("industrial_fleet_vehicles_tenant_renewal_idx").on(t.tenantId, t.renewalDate),
    uniqueIndex("industrial_fleet_vehicles_dvir_token_uidx").on(t.dvirPublicTokenHash),
  ],
);

export const industrialFleetDrivers = pgTable("industrial_fleet_drivers", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
  personnelName: varchar("personnel_name", { length: 300 }),
  employeeNumber: varchar("employee_number", { length: 120 }),
  licenseNumber: varchar("license_number", { length: 120 }),
  licenseState: varchar("license_state", { length: 32 }),
  licenseExpiryDate: date("license_expiry_date"),
  dateOfBirth: date("date_of_birth"),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  initialMvrDate: date("initial_mvr_date"),
  lastMvrDate: date("last_mvr_date"),
  nextMvrDueDate: date("next_mvr_due_date"),
  insuranceEffectiveDate: date("insurance_effective_date"),
  insuranceRemovedDate: date("insurance_removed_date"),
  notes: text("notes"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialFleetDriverSettings = pgTable("industrial_fleet_driver_settings", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  insurerName: varchar("insurer_name", { length: 300 }),
  insurerEmail: text("insurer_email"),
  annualSampleDate: varchar("annual_sample_date", { length: 16 }),
  lastSampleYear: integer("last_sample_year"),
  emailOnRemoval: boolean("email_on_removal").notNull().default(false),
  settings: jsonb("settings").notNull().default({}),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialFleetAssignmentHistory = pgTable(
  "industrial_fleet_assignment_history",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => industrialFleetVehicles.id),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
    driverId: uuid("driver_id").references(() => industrialFleetDrivers.id),
    driverName: varchar("driver_name", { length: 300 }),
    action: varchar("action", { length: 64 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_fleet_assignment_history_vehicle_idx").on(
      t.tenantId,
      t.vehicleId,
      t.effectiveAt,
    ),
  ],
);

export const industrialFleetMileageHistory = pgTable(
  "industrial_fleet_mileage_history",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => industrialFleetVehicles.id),
    mileage: integer("mileage").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_fleet_mileage_history_vehicle_idx").on(t.tenantId, t.vehicleId, t.recordedAt),
  ],
);

export const industrialFleetEngineHoursHistory = pgTable(
  "industrial_fleet_engine_hours_history",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => industrialFleetVehicles.id),
    engineHours: integer("engine_hours").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_fleet_engine_hours_history_vehicle_idx").on(
      t.tenantId,
      t.vehicleId,
      t.recordedAt,
    ),
  ],
);

export const industrialFleetMaintenance = pgTable(
  "industrial_fleet_maintenance",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => industrialFleetVehicles.id),
    title: varchar("title", { length: 500 }).notNull(),
    maintenanceType: varchar("maintenance_type", { length: 64 }).notNull().default("REPAIR"),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    costCents: integer("cost_cents"),
    notes: text("notes"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_fleet_maintenance_vehicle_idx").on(t.tenantId, t.vehicleId, t.status)],
);

export const industrialFleetDocuments = pgTable(
  "industrial_fleet_documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => industrialFleetVehicles.id),
    title: varchar("title", { length: 500 }).notNull(),
    documentType: varchar("document_type", { length: 64 }).notNull().default("OTHER"),
    storageKey: varchar("storage_key", { length: 512 }),
    contentType: varchar("content_type", { length: 120 }),
    notes: text("notes"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_fleet_documents_vehicle_idx").on(t.tenantId, t.vehicleId)],
);

export const industrialWorkersCompCases = pgTable(
  "industrial_workers_comp_cases",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
    incidentId: uuid("incident_id"),
    caseNumber: varchar("case_number", { length: 120 }),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    severity: varchar("severity", { length: 64 }),
    workflowStage: varchar("workflow_stage", { length: 120 }),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    daysAway: integer("days_away"),
    restrictedDays: integer("restricted_days"),
    claimSummary: jsonb("claim_summary").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_wc_cases_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_wc_cases_personnel_idx").on(t.tenantId, t.personnelId),
    index("industrial_wc_cases_incident_idx").on(t.tenantId, t.incidentId),
  ],
);

export const industrialWorkersCompCarriers = pgTable("industrial_workers_comp_carriers", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 300 }).notNull(),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  contact: jsonb("contact").notNull().default({}),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialWorkersCompWorkStatusPeriods = pgTable(
  "industrial_workers_comp_work_status_periods",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => industrialWorkersCompCases.id),
    status: varchar("status", { length: 64 }).notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_wc_work_status_case_idx").on(t.tenantId, t.caseId),
    index("industrial_wc_work_status_created_by_idx").on(t.tenantId, t.createdByUserId),
  ],
);

export const industrialWorkersCompRestrictions = pgTable(
  "industrial_workers_comp_restrictions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => industrialWorkersCompCases.id),
    description: text("description"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_wc_restrictions_case_idx").on(t.tenantId, t.caseId)],
);

export const industrialWorkersCompMedicalEncounters = pgTable(
  "industrial_workers_comp_medical_encounters",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => industrialWorkersCompCases.id),
    appointmentDate: date("appointment_date"),
    provider: varchar("provider", { length: 300 }),
    providerSpecialty: varchar("provider_specialty", { length: 200 }),
    diagnosis: text("diagnosis"),
    treatment: text("treatment"),
    medication: text("medication"),
    examFindings: text("exam_findings"),
    assessment: text("assessment"),
    symptoms: text("symptoms"),
    notes: text("notes"),
    restrictedPayload: jsonb("restricted_payload").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_wc_medical_case_idx").on(t.tenantId, t.caseId),
    index("industrial_wc_medical_created_by_idx").on(t.tenantId, t.createdByUserId),
  ],
);

/**
 * Signed Producers paper forms on a workers' compensation case (Employee Injury Guidelines
 * acknowledgment, HIPAA Authorization). Signed content is immutable; HIPAA rows also require the
 * WC medical-access RLS flag. See drizzle/0112_industrial_workers_comp_forms_s1.sql.
 */
export const industrialWorkersCompForms = pgTable(
  "industrial_workers_comp_forms",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => industrialWorkersCompCases.id),
    formKey: varchar("form_key", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("SIGNED"),
    formData: jsonb("form_data").notNull().default({}),
    signatureDataUrl: text("signature_data_url").notNull(),
    signerName: varchar("signer_name", { length: 200 }).notNull(),
    signerRelationship: varchar("signer_relationship", { length: 120 }),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id"),
    voidReason: text("void_reason"),
    emailLog: jsonb("email_log").notNull().default([]),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_wc_forms_case_idx").on(t.tenantId, t.caseId, t.formKey)],
);

/** Per-Thursday status notes required on open workers' compensation cases. */
export const industrialWorkersCompWeeklyUpdates = pgTable(
  "industrial_workers_comp_weekly_updates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    caseId: uuid("case_id")
      .notNull()
      .references(() => industrialWorkersCompCases.id),
    weekOf: date("week_of").notNull(),
    notes: text("notes").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_wc_weekly_updates_case_week_uidx").on(t.tenantId, t.caseId, t.weekOf),
    index("industrial_wc_weekly_updates_week_idx").on(t.tenantId, t.weekOf),
    index("industrial_wc_weekly_updates_case_idx").on(t.tenantId, t.caseId),
  ],
);

/** Disciplinary actions on a personnel file; active points deduct from the safety score. */
export const industrialPersonnelDisciplinaryActions = pgTable(
  "industrial_personnel_disciplinary_actions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => industrialPersonnel.id),
    actionType: varchar("action_type", { length: 32 }).notNull(),
    category: varchar("category", { length: 32 }).notNull().default("SAFETY"),
    actionDate: date("action_date").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    issuedByName: varchar("issued_by_name", { length: 200 }),
    points: integer("points").notNull().default(0),
    countsUntil: date("counts_until"),
    status: varchar("status", { length: 16 }).notNull().default("ACTIVE"),
    rescindedAt: timestamp("rescinded_at", { withTimezone: true }),
    rescindedReason: text("rescinded_reason"),
    rescindedByUserId: uuid("rescinded_by_user_id").references(() => users.id),
    attachments: jsonb("attachments").notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_personnel_discipline_person_idx").on(t.tenantId, t.personnelId, t.actionDate),
  ],
);

/** Append-only Emergency Alerts SMS consent records (QR self-service signup or admin). */
export const industrialPersonnelSmsConsents = pgTable(
  "industrial_personnel_sms_consents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personnelId: uuid("personnel_id")
      .notNull()
      .references(() => industrialPersonnel.id),
    action: varchar("action", { length: 16 }).notNull(),
    method: varchar("method", { length: 32 }).notNull(),
    phoneNumber: varchar("phone_number", { length: 40 }),
    previousPhoneNumber: varchar("previous_phone_number", { length: 40 }),
    consentText: text("consent_text"),
    consentVersion: varchar("consent_version", { length: 32 }),
    signatureName: varchar("signature_name", { length: 300 }),
    employeeNumber: varchar("employee_number", { length: 120 }),
    qrLinkId: uuid("qr_link_id").references((): AnyPgColumn => qrLinks.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 500 }),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_personnel_sms_consents_person_idx").on(
      t.tenantId,
      t.personnelId,
      t.createdAt,
    ),
  ],
);

export const qrLinks = pgTable(
  "qr_links",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    label: varchar("label", { length: 300 }),
    displayCode: varchar("display_code", { length: 64 }),
    description: text("description"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    tokenHash: varchar("token_hash", { length: 128 }),
    tokenIssuedAt: timestamp("token_issued_at", { withTimezone: true }),
    accessMode: varchar("access_mode", { length: 64 }).notNull().default("AUTHENTICATED_ONLY"),
    actionConfig: jsonb("action_config").notNull().default({}),
    targetType: varchar("target_type", { length: 120 }),
    targetId: uuid("target_id"),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    currentVersionId: uuid("current_version_id"),
    replacementQrId: uuid("replacement_qr_id").references((): AnyPgColumn => qrLinks.id),
    createdByUserId: uuid("created_by_user_id"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    scanCount: integer("scan_count").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("qr_links_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("qr_links_source_uidx").on(t.tenantId, t.sourceCollection, t.sourceDocumentId),
    uniqueIndex("qr_links_token_hash_uidx").on(t.tokenHash),
    index("qr_links_tenant_target_idx").on(t.tenantId, t.targetType, t.targetId),
    index("qr_links_display_code_idx").on(t.tenantId, t.displayCode),
  ],
);

export const qrLinkVersions = pgTable(
  "qr_link_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    qrLinkId: uuid("qr_link_id")
      .notNull()
      .references(() => qrLinks.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull().default(1),
    payload: jsonb("payload").notNull().default({}),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("qr_link_versions_link_idx").on(t.tenantId, t.qrLinkId)],
);

export const industrialQrLinkScanEvents = pgTable(
  "industrial_qr_link_scan_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    qrLinkId: uuid("qr_link_id").references(() => qrLinks.id, { onDelete: "set null" }),
    versionId: uuid("version_id").references(() => qrLinkVersions.id, { onDelete: "set null" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    action: varchar("action", { length: 64 }),
    result: varchar("result", { length: 64 }),
    responseStatus: integer("response_status"),
    anonymous: boolean("anonymous").notNull().default(false),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
    userId: uuid("user_id"),
    siteId: uuid("site_id").references(() => industrialSites.id),
    correlationId: varchar("correlation_id", { length: 120 }),
    metadata: jsonb("metadata").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_qr_scan_events_link_idx").on(t.tenantId, t.qrLinkId, t.scannedAt),
    index("industrial_qr_link_scan_events_action_idx").on(t.tenantId, t.action, t.scannedAt),
  ],
);

export const industrialQrLinkAuditEvents = pgTable(
  "industrial_qr_link_audit_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    qrLinkId: uuid("qr_link_id").references(() => qrLinks.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id"),
    details: jsonb("details").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_qr_link_audit_events_link_idx").on(t.tenantId, t.qrLinkId, t.eventAt)],
);

export const industrialScanQrCodes = pgTable("industrial_scan_qr_codes", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  qrCodeId: varchar("qr_code_id", { length: 120 }),
  labelText: varchar("label_text", { length: 300 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const platformDocuments = pgTable(
  "platform_documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 120 }),
    documentNumber: varchar("document_number", { length: 120 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    workflowStatus: varchar("workflow_status", { length: 64 }).notNull().default("DRAFT"),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    currentApprovedVersionId: uuid("current_approved_version_id"),
    metadata: jsonb("metadata").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("platform_documents_tenant_status_idx").on(t.tenantId, t.status),
    index("platform_documents_tenant_workflow_idx").on(t.tenantId, t.workflowStatus),
    index("platform_documents_tenant_review_due_idx").on(t.tenantId, t.reviewDueAt),
  ],
);

export const industrialAttachments = pgTable(
  "industrial_attachments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: uuid("entity_id"),
    originalFilename: varchar("original_filename", { length: 255 }),
    contentType: varchar("content_type", { length: 200 }),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    storageBucket: varchar("storage_bucket", { length: 200 }),
    storageKey: text("storage_key").notNull(),
    sourceIdentity: varchar("source_identity", { length: 512 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_attachments_entity_idx").on(t.tenantId, t.entityType, t.entityId)],
);

export const industrialMigrationIdMap = pgTable(
  "industrial_migration_id_map",
  {
    id: uuid("id").primaryKey(),
    migrationRunId: varchar("migration_run_id", { length: 128 }).notNull(),
    sourceSystem: varchar("source_system", { length: 64 }).notNull(),
    sourceCollection: varchar("source_collection", { length: 128 }).notNull(),
    sourceDocumentPath: varchar("source_document_path", { length: 512 }).notNull(),
    sourceDocumentId: varchar("source_document_id", { length: 256 }).notNull(),
    sourceTenantKey: varchar("source_tenant_key", { length: 256 }),
    targetEntity: varchar("target_entity", { length: 128 }).notNull(),
    targetId: uuid("target_id").notNull(),
    awsTenantId: uuid("aws_tenant_id").references(() => tenants.id),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_migration_id_map_idem_uidx").on(
      t.sourceSystem,
      t.sourceCollection,
      t.sourceDocumentId,
      t.targetEntity,
    ),
  ],
);

export const industrialIncidents = pgTable("industrial_incidents", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialInspections = pgTable("industrial_inspections", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  departmentId: uuid("department_id").references(() => industrialDepartments.id),
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  templateId: uuid("template_id"),
  inspectionType: varchar("inspection_type", { length: 120 }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/** Platform / tenant EHS audit templates used as inspection checklists. */
export const platformEhsAuditTemplates = pgTable("platform_ehs_audit_templates", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id"),
  ownershipScope: varchar("ownership_scope", { length: 32 }).notNull().default("PLATFORM_GLOBAL"),
  name: varchar("name", { length: 300 }).notNull(),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  templateJson: jsonb("template_json").notNull().default({}),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialObservations = pgTable("industrial_observations", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialJsas = pgTable("industrial_jsas", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

/** Quiz LMS: published safety sources (Forge-authored content). */
export const industrialTrainingSources = pgTable(
  "industrial_training_sources",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: varchar("title", { length: 500 }).notNull(),
    edition: varchar("edition", { length: 120 }),
    description: text("description"),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    questionCount: integer("question_count").notNull().default(0),
    createdByUserId: uuid("created_by_user_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_training_sources_tenant_status_idx").on(t.tenantId, t.status)],
);

export const industrialTrainingCourseVersions = pgTable(
  "industrial_training_course_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull().default(1),
    versionLabel: varchar("version_label", { length: 120 }),
    effectiveDate: date("effective_date"),
    passingPercent: integer("passing_percent").notNull().default(70),
    quizPolicyJson: jsonb("quiz_policy_json").notNull().default({}),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_training_course_versions_uidx").on(t.sourceId, t.versionNumber),
    index("industrial_training_course_versions_tenant_idx").on(t.tenantId, t.sourceId, t.status),
  ],
);

export const industrialTrainingCourseSections = pgTable(
  "industrial_training_course_sections",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    versionId: uuid("version_id")
      .notNull()
      .references(() => industrialTrainingCourseVersions.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 300 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    required: boolean("required").notNull().default(true),
    contentJson: jsonb("content_json").notNull().default([]),
    estimatedMinutes: integer("estimated_minutes"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_training_course_sections_version_idx").on(
      t.tenantId,
      t.versionId,
      t.sortOrder,
    ),
  ],
);

export const industrialTrainingQuestions = pgTable(
  "industrial_training_questions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id, { onDelete: "cascade" }),
    stem: text("stem").notNull(),
    choices: jsonb("choices").notNull().default([]),
    correctIndex: integer("correct_index").notNull().default(0),
    explanation: text("explanation"),
    pageRef: varchar("page_ref", { length: 120 }),
    difficulty: varchar("difficulty", { length: 32 }).default("MEDIUM"),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_training_questions_source_idx").on(t.tenantId, t.sourceId)],
);

export const industrialTrainingQuizzes = pgTable(
  "industrial_training_quizzes",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id),
    createdByUserId: uuid("created_by_user_id"),
    mode: varchar("mode", { length: 32 }).notNull().default("STANDARD"),
    optionCount: integer("option_count").notNull().default(4),
    feedbackEnabled: boolean("feedback_enabled").notNull().default(true),
    timerSeconds: integer("timer_seconds"),
    settings: jsonb("settings").notNull().default({}),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    assignmentId: uuid("assignment_id").references(() => industrialTrainingAssignments.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("industrial_training_quizzes_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const industrialTrainingAttempts = pgTable(
  "industrial_training_attempts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => industrialTrainingQuizzes.id),
    userId: uuid("user_id"),
    employeeNumber: varchar("employee_number", { length: 120 }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id),
    status: varchar("status", { length: 64 }).notNull().default("IN_PROGRESS"),
    questionIds: jsonb("question_ids").notNull().default([]),
    answers: jsonb("answers").notNull().default([]),
    bookmarks: jsonb("bookmarks").notNull().default([]),
    currentIndex: integer("current_index").notNull().default(0),
    scoreCorrect: integer("score_correct").notNull().default(0),
    scoreTotal: integer("score_total").notNull().default(0),
    masteryState: jsonb("mastery_state").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    resumedAt: timestamp("resumed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    assignmentId: uuid("assignment_id").references(() => industrialTrainingAssignments.id, {
      onDelete: "set null",
    }),
    courseVersionId: uuid("course_version_id").references(
      () => industrialTrainingCourseVersions.id,
      {
        onDelete: "set null",
      },
    ),
    attemptNumber: integer("attempt_number").notNull().default(1),
  },
  (t) => [
    index("industrial_training_attempts_user_idx").on(t.tenantId, t.userId, t.status),
    index("industrial_training_attempts_employee_idx").on(t.tenantId, t.employeeNumber),
    index("industrial_training_attempts_quiz_idx").on(t.tenantId, t.quizId),
    index("industrial_training_attempts_assignment_idx").on(t.tenantId, t.assignmentId),
  ],
);

export const industrialTrainingUserStats = pgTable(
  "industrial_training_user_stats",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id, { onDelete: "cascade" }),
    seenCount: integer("seen_count").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    masteredCount: integer("mastered_count").notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    avgScore: varchar("avg_score", { length: 16 }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_training_user_stats_user_idx").on(t.tenantId, t.userId)],
);

/** Folders within a study source for organizing uploaded materials. */
export const industrialTrainingSourceFolders = pgTable(
  "industrial_training_source_folders",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_training_source_folders_source_idx").on(t.tenantId, t.sourceId, t.sortOrder),
  ],
);

/** Uploaded training media (PPT/PDF/video/docs) for agency study libraries. */
export const industrialTrainingMaterials = pgTable(
  "industrial_training_materials",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 64 }).notNull().default("GENERAL"),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    status: varchar("status", { length: 64 }).notNull().default("PENDING_UPLOAD"),
    visibility: varchar("visibility", { length: 32 }).notNull().default("PUBLISHED"),
    sourceId: uuid("source_id").references(() => industrialTrainingSources.id, {
      onDelete: "set null",
    }),
    folderId: uuid("folder_id").references(() => industrialTrainingSourceFolders.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_training_materials_tenant_idx").on(t.tenantId, t.status),
    index("industrial_training_materials_source_idx").on(t.tenantId, t.sourceId),
    index("industrial_training_materials_folder_idx").on(t.tenantId, t.sourceId, t.folderId),
  ],
);

export const industrialTrainingGroups = pgTable(
  "industrial_training_groups",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_training_groups_tenant_idx").on(t.tenantId)],
);

export const industrialTrainingGroupMembers = pgTable(
  "industrial_training_group_members",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => industrialTrainingGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id, {
      onDelete: "cascade",
    }),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_training_group_members_user_idx").on(t.tenantId, t.userId),
    uniqueIndex("industrial_training_group_members_uidx").on(t.groupId, t.userId),
    uniqueIndex("industrial_training_group_members_personnel_uidx").on(t.groupId, t.personnelId),
  ],
);

/** Tags a course (source) with training groups for catalog filtering by department/cohort. */
export const industrialTrainingSourceGroups = pgTable(
  "industrial_training_source_groups",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => industrialTrainingGroups.id, { onDelete: "cascade" }),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_training_source_groups_uidx").on(t.sourceId, t.groupId),
    index("industrial_training_source_groups_tenant_idx").on(t.tenantId, t.groupId),
    index("industrial_training_source_groups_source_idx").on(t.tenantId, t.sourceId),
  ],
);

export const industrialTrainingAssignments = pgTable(
  "industrial_training_assignments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id),
    courseVersionId: uuid("course_version_id").references(
      () => industrialTrainingCourseVersions.id,
      {
        onDelete: "set null",
      },
    ),
    materialId: uuid("material_id").references(() => industrialTrainingMaterials.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    passingPercent: integer("passing_percent").notNull().default(70),
    quizMode: varchar("quiz_mode", { length: 32 }).notNull().default("STANDARD"),
    optionCount: integer("option_count").notNull().default(4),
    feedbackEnabled: boolean("feedback_enabled").notNull().default(true),
    timerSeconds: integer("timer_seconds"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    publicTokenHash: varchar("public_token_hash", { length: 128 }),
    publicTokenIssuedAt: timestamp("public_token_issued_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_training_assignments_tenant_idx").on(t.tenantId, t.status),
    index("industrial_training_assignments_source_idx").on(t.tenantId, t.sourceId),
    uniqueIndex("industrial_training_assignments_public_token_uidx").on(t.publicTokenHash),
  ],
);

export const industrialTrainingAssignmentAssignees = pgTable(
  "industrial_training_assignment_assignees",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => industrialTrainingAssignments.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id, {
      onDelete: "set null",
    }),
    employeeNumber: varchar("employee_number", { length: 120 }),
    status: varchar("status", { length: 64 }).notNull().default("NOT_STARTED"),
    attemptId: uuid("attempt_id").references(() => industrialTrainingAttempts.id, {
      onDelete: "set null",
    }),
    bestPercent: integer("best_percent"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_training_assignment_assignees_user_idx").on(t.tenantId, t.userId, t.status),
    index("industrial_training_assignment_assignees_personnel_idx").on(
      t.tenantId,
      t.personnelId,
      t.status,
    ),
    index("industrial_training_assignment_assignees_employee_idx").on(
      t.tenantId,
      t.employeeNumber,
      t.status,
    ),
    uniqueIndex("industrial_training_assignment_assignees_uidx").on(t.assignmentId, t.userId),
    uniqueIndex("industrial_training_assignment_assignees_personnel_uidx").on(
      t.assignmentId,
      t.personnelId,
    ),
  ],
);

export const industrialTrainingAccessLinks = pgTable(
  "industrial_training_access_links",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    linkType: varchar("link_type", { length: 32 }).notNull().default("COMPANY_PORTAL"),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    sourceId: uuid("source_id").references(() => industrialTrainingSources.id, {
      onDelete: "set null",
    }),
    assignmentId: uuid("assignment_id").references(() => industrialTrainingAssignments.id, {
      onDelete: "set null",
    }),
    siteId: uuid("site_id").references(() => industrialSites.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => industrialDepartments.id, {
      onDelete: "set null",
    }),
    publicTokenHash: varchar("public_token_hash", { length: 128 }),
    publicTokenIssuedAt: timestamp("public_token_issued_at", { withTimezone: true }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    allowSelfEnrollment: boolean("allow_self_enrollment").notNull().default(false),
    assignedOnly: boolean("assigned_only").notNull().default(true),
    policyJson: jsonb("policy_json").notNull().default({}),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_training_access_links_token_uidx").on(t.publicTokenHash),
    index("industrial_training_access_links_tenant_idx").on(t.tenantId, t.status),
  ],
);

export const industrialTrainingProgress = pgTable(
  "industrial_training_progress",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => industrialTrainingAssignments.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => industrialTrainingAssignmentAssignees.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id, {
      onDelete: "set null",
    }),
    employeeNumber: varchar("employee_number", { length: 120 }).notNull(),
    versionId: uuid("version_id").references(() => industrialTrainingCourseVersions.id, {
      onDelete: "set null",
    }),
    percentComplete: integer("percent_complete").notNull().default(0),
    sectionsCompleted: jsonb("sections_completed").notNull().default([]),
    currentSectionId: uuid("current_section_id").references(
      () => industrialTrainingCourseSections.id,
      {
        onDelete: "set null",
      },
    ),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    contentCompletedAt: timestamp("content_completed_at", { withTimezone: true }),
    quizAvailable: boolean("quiz_available").notNull().default(false),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_training_progress_assignee_uidx").on(t.assigneeId),
    index("industrial_training_progress_tenant_idx").on(t.tenantId, t.employeeNumber),
  ],
);

export const industrialTrainingCompletions = pgTable(
  "industrial_training_completions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => industrialTrainingAssignments.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => industrialTrainingAssignmentAssignees.id, { onDelete: "cascade" }),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id, {
      onDelete: "set null",
    }),
    employeeNumber: varchar("employee_number", { length: 120 }).notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => industrialTrainingSources.id),
    versionId: uuid("version_id").references(() => industrialTrainingCourseVersions.id, {
      onDelete: "set null",
    }),
    attemptId: uuid("attempt_id").references(() => industrialTrainingAttempts.id, {
      onDelete: "set null",
    }),
    attemptNumber: integer("attempt_number").notNull().default(1),
    scorePercent: integer("score_percent").notNull(),
    passingPercent: integer("passing_percent").notNull(),
    result: varchar("result", { length: 32 }).notNull(),
    snapshotJson: jsonb("snapshot_json").notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_training_completions_tenant_idx").on(
      t.tenantId,
      t.personnelId,
      t.completedAt,
    ),
  ],
);

export const industrialTrainingAcknowledgements = pgTable(
  "industrial_training_acknowledgements",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    progressId: uuid("progress_id").references(() => industrialTrainingProgress.id, {
      onDelete: "set null",
    }),
    completionId: uuid("completion_id").references(() => industrialTrainingCompletions.id, {
      onDelete: "set null",
    }),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id, {
      onDelete: "set null",
    }),
    employeeNumber: varchar("employee_number", { length: 120 }).notNull(),
    versionId: uuid("version_id").references(() => industrialTrainingCourseVersions.id, {
      onDelete: "set null",
    }),
    acknowledgementText: text("acknowledgement_text").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
    requestMetadata: jsonb("request_metadata").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_training_acknowledgements_tenant_idx").on(t.tenantId, t.employeeNumber),
  ],
);

export const industrialTrainingPortalRateLimits = pgTable(
  "industrial_training_portal_rate_limits",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    bucketKey: varchar("bucket_key", { length: 256 }).notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: updatedAtColumn,
  },
  (t) => [uniqueIndex("industrial_training_portal_rate_limits_uidx").on(t.tenantId, t.bucketKey)],
);

export const industrialTrainingPortalSessions = pgTable(
  "industrial_training_portal_sessions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    assignmentId: uuid("assignment_id").references(() => industrialTrainingAssignments.id, {
      onDelete: "cascade",
    }),
    accessLinkId: uuid("access_link_id").references(() => industrialTrainingAccessLinks.id, {
      onDelete: "cascade",
    }),
    accessTokenHash: varchar("access_token_hash", { length: 128 }).notNull(),
    sessionTokenHash: varchar("session_token_hash", { length: 128 }).notNull(),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id, {
      onDelete: "set null",
    }),
    employeeNumber: varchar("employee_number", { length: 120 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAtColumn,
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_training_portal_sessions_token_uidx").on(t.sessionTokenHash),
    index("industrial_training_portal_sessions_assignment_idx").on(
      t.tenantId,
      t.assignmentId,
      t.employeeNumber,
    ),
    index("industrial_training_portal_sessions_expires_idx").on(t.expiresAt),
  ],
);

/** Company documents uploaded during onboarding / Setup Center (tenant-scoped). */
export const platformCompanyDocuments = pgTable(
  "platform_company_documents",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: uuid("document_id").notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    category: varchar("category", { length: 64 }).notNull().default("GENERAL"),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("platform_company_documents_tenant_idx").on(t.tenantId, t.status)],
);
