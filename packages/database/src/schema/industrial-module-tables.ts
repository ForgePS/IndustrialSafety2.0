/**
 * Model A module tables present in 0040 DDL but previously missing from Drizzle.
 * Used by flat /api/v1/industrial/* against normalized Model A tables.
 */
import {
  boolean,
  date,
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
import { createdAtColumn, updatedAtColumn } from "./common.js";
import {
  industrialDepartments,
  industrialPersonnel,
  industrialSites,
  sourceCols,
} from "./industrial.js";
import { tenants } from "./tenants.js";

/** Shared titled site-scoped record shape used by most Industrial module tables. */
function titledSiteRecordTable(name: string) {
  return pgTable(
    name,
    {
      id: uuid("id").primaryKey(),
      tenantId: uuid("tenant_id")
        .notNull()
        .references(() => tenants.id),
      siteId: uuid("site_id").references(() => industrialSites.id),
      departmentId: uuid("department_id").references(() => industrialDepartments.id),
      title: varchar("title", { length: 500 }),
      status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
      recordDate: date("record_date"),
      personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
      ...sourceCols,
      createdAt: createdAtColumn,
      updatedAt: updatedAtColumn,
      archivedAt: timestamp("archived_at", { withTimezone: true }),
    },
    (t) => [
      index(`${name}_tenant_status_idx`).on(t.tenantId, t.status),
      index(`${name}_tenant_site_idx`).on(t.tenantId, t.siteId),
      index(`${name}_tenant_updated_idx`).on(t.tenantId, t.updatedAt),
      uniqueIndex(`${name}_source_uidx`).on(t.tenantId, t.sourceCollection, t.sourceDocumentId),
    ],
  );
}

export const industrialFormDefinitions = pgTable(
  "industrial_form_definitions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    title: varchar("title", { length: 500 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    formKey: varchar("form_key", { length: 120 }),
    version: varchar("version", { length: 64 }),
    schemaJson: jsonb("schema_json").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_form_definitions_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("industrial_form_definitions_source_uidx").on(
      t.tenantId,
      t.sourceCollection,
      t.sourceDocumentId,
    ),
  ],
);

export const industrialFormSubmissions = pgTable(
  "industrial_form_submissions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    title: varchar("title", { length: 500 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    formDefinitionId: uuid("form_definition_id").references(() => industrialFormDefinitions.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    answers: jsonb("answers").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_form_submissions_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("industrial_form_submissions_source_uidx").on(
      t.tenantId,
      t.sourceCollection,
      t.sourceDocumentId,
    ),
  ],
);

export const industrialTrainingRecords = pgTable(
  "industrial_training_records",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    title: varchar("title", { length: 500 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    courseName: varchar("course_name", { length: 300 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    personnelId: uuid("personnel_id").references(() => industrialPersonnel.id),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_training_records_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_training_records_personnel_idx").on(t.tenantId, t.personnelId),
    uniqueIndex("industrial_training_records_source_uidx").on(
      t.tenantId,
      t.sourceCollection,
      t.sourceDocumentId,
    ),
  ],
);

export const industrialCertificateTemplates = pgTable(
  "industrial_certificate_templates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    title: varchar("title", { length: 500 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    templateKey: varchar("template_key", { length: 120 }),
    templateJson: jsonb("template_json").notNull().default({}),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_certificate_templates_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("industrial_certificate_templates_source_uidx").on(
      t.tenantId,
      t.sourceCollection,
      t.sourceDocumentId,
    ),
  ],
);

export const industrialTasks = pgTable(
  "industrial_tasks",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    title: varchar("title", { length: 500 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    assigneePersonnelId: uuid("assignee_personnel_id").references(() => industrialPersonnel.id),
    dueDate: date("due_date"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_tasks_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("industrial_tasks_source_uidx").on(t.tenantId, t.sourceCollection, t.sourceDocumentId),
  ],
);

export const industrialEmergencyResponseRecords = pgTable(
  "industrial_emergency_response_records",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    siteId: uuid("site_id").references(() => industrialSites.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    title: varchar("title", { length: 500 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    responseType: varchar("response_type", { length: 120 }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_emergency_response_records_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("industrial_emergency_response_records_source_uidx").on(
      t.tenantId,
      t.sourceCollection,
      t.sourceDocumentId,
    ),
  ],
);

export const industrialChemicalSafetyRecords = titledSiteRecordTable(
  "industrial_chemical_safety_records",
);
export const industrialConfinedSpaceRecords = titledSiteRecordTable(
  "industrial_confined_space_records",
);
export const industrialHotWorkRecords = titledSiteRecordTable("industrial_hot_work_records");
export const industrialContractorSafetyRecords = titledSiteRecordTable(
  "industrial_contractor_safety_records",
);
export const industrialCranesRiggingRecords = titledSiteRecordTable(
  "industrial_cranes_rigging_records",
);
export const industrialElectricalSafetyRecords = titledSiteRecordTable(
  "industrial_electrical_safety_records",
);
export const industrialEnvironmentalSafetyRecords = titledSiteRecordTable(
  "industrial_environmental_safety_records",
);
export const industrialForkliftRecords = titledSiteRecordTable("industrial_forklift_records");
export const industrialMachineSafetyRecords = titledSiteRecordTable(
  "industrial_machine_safety_records",
);
export const industrialManufacturingSafetyRecords = titledSiteRecordTable(
  "industrial_manufacturing_safety_records",
);
export const industrialProcessSafetyRecords = titledSiteRecordTable(
  "industrial_process_safety_records",
);
export const industrialWarehouseSafetyRecords = titledSiteRecordTable(
  "industrial_warehouse_safety_records",
);
export const industrialWorkingAtHeightsRecords = titledSiteRecordTable(
  "industrial_working_at_heights_records",
);
export const industrialDotComplianceRecords = titledSiteRecordTable(
  "industrial_dot_compliance_records",
);
export const industrialOshaCases = titledSiteRecordTable("industrial_osha_cases");

export const industrialLotoEnergySources = pgTable(
  "industrial_loto_energy_sources",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    procedureId: uuid("procedure_id").notNull(),
    energyType: varchar("energy_type", { length: 120 }).notNull(),
    description: text("description"),
    magnitude: varchar("magnitude", { length: 120 }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_loto_energy_sources_proc_idx").on(t.tenantId, t.procedureId)],
);

export const industrialLotoIsolationPoints = pgTable(
  "industrial_loto_isolation_points",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    procedureId: uuid("procedure_id").notNull(),
    energySourceId: uuid("energy_source_id"),
    label: varchar("label", { length: 300 }).notNull(),
    locationDescription: text("location_description"),
    isolationMethod: varchar("isolation_method", { length: 200 }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_loto_isolation_points_proc_idx").on(t.tenantId, t.procedureId)],
);

export const industrialLotoSteps = pgTable(
  "industrial_loto_steps",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    procedureId: uuid("procedure_id").notNull(),
    stepPhase: varchar("step_phase", { length: 32 }).notNull(),
    stepNumber: integer("step_number").notNull().default(1),
    instruction: text("instruction").notNull(),
    isolationPointId: uuid("isolation_point_id"),
    libraryItemId: uuid("library_item_id"),
    isVerification: boolean("is_verification").notNull().default(false),
    ...sourceCols,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_loto_steps_proc_phase_idx").on(t.tenantId, t.procedureId)],
);
