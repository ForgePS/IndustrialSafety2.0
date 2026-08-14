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
} from "drizzle-orm/pg-core";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";

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
    uniqueIndex("industrial_sites_source_uidx").on(t.tenantId, t.sourceCollection, t.sourceDocumentId),
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
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_departments_tenant_site_idx").on(t.tenantId, t.siteId)],
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
    lastName: varchar("last_name", { length: 150 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    hireDate: date("hire_date"),
    supervisorName: varchar("supervisor_name", { length: 300 }),
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
    priority: varchar("priority", { length: 32 }),
    status: varchar("status", { length: 64 }).notNull().default("OPEN"),
    assignedPersonnelId: uuid("assigned_personnel_id").references(() => industrialPersonnel.id),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_corrective_actions_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_corrective_actions_due_idx").on(t.tenantId, t.dueDate),
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
    year: integer("year"),
    make: varchar("make", { length: 120 }),
    model: varchar("model", { length: 120 }),
    color: varchar("color", { length: 64 }),
    vin: varchar("vin", { length: 32 }),
    licensePlate: varchar("license_plate", { length: 64 }),
    renewalDate: date("renewal_date"),
    locationName: varchar("location_name", { length: 300 }),
    countyAssessed: varchar("county_assessed", { length: 120 }),
    insured: boolean("insured"),
    mileage: integer("mileage"),
    notes: text("notes"),
    vehicleFringe: boolean("vehicle_fringe"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("industrial_fleet_vehicles_tenant_vin_uidx").on(t.tenantId, t.vin)],
);

export const industrialFleetDrivers = pgTable("industrial_fleet_drivers", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
  personnelName: varchar("personnel_name", { length: 300 }),
  licenseNumber: varchar("license_number", { length: 120 }),
  licenseState: varchar("license_state", { length: 32 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const industrialWorkersCompCases = pgTable("industrial_workers_comp_cases", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
  caseNumber: varchar("case_number", { length: 120 }),
  status: varchar("status", { length: 64 }).notNull().default("OPEN"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

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
    diagnosis: text("diagnosis"),
    treatment: text("treatment"),
    restrictedPayload: jsonb("restricted_payload").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
);

export const qrLinks = pgTable("qr_links", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  siteId: uuid("site_id").references(() => industrialSites.id),
  label: varchar("label", { length: 300 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  targetType: varchar("target_type", { length: 120 }),
  targetId: uuid("target_id"),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

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

export const platformDocuments = pgTable("platform_documents", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: varchar("name", { length: 300 }).notNull(),
  category: varchar("category", { length: 120 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
  metadata: jsonb("metadata").notNull().default({}),
  ...sourceCols,
  createdAt: createdAtColumn,
  updatedAt: updatedAtColumn,
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

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
  title: varchar("title", { length: 500 }),
  status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
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
