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
} from "drizzle-orm/pg-core";
import { createdAtColumn, recordVersionColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/** Platform catalog: source package identity for NERIS schema imports. */
export const nerisSchemaPackages = pgTable(
  "neris_schema_packages",
  {
    id: uuid("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("neris_schema_packages_code_uidx").on(table.code)],
);

export const nerisSchemaVersions = pgTable(
  "neris_schema_versions",
  {
    id: uuid("id").primaryKey(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => nerisSchemaPackages.id),
    versionLabel: varchar("version_label", { length: 64 }).notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    state: varchar("state", { length: 32 }).notNull().default("STAGED"),
    sourceFieldRegistryPath: text("source_field_registry_path"),
    sourceValueSetsPath: text("source_value_sets_path"),
    moduleCount: integer("module_count").notNull().default(0),
    fieldCount: integer("field_count").notNull().default(0),
    valueSetCount: integer("value_set_count").notNull().default(0),
    optionCount: integer("option_count").notNull().default(0),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_schema_versions_package_checksum_uidx").on(
      table.packageId,
      table.checksumSha256,
    ),
    index("neris_schema_versions_state_idx").on(table.state),
  ],
);

export const nerisModules = pgTable(
  "neris_modules",
  {
    id: uuid("id").primaryKey(),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => nerisSchemaVersions.id),
    moduleKey: varchar("module_key", { length: 128 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    area: varchar("area", { length: 200 }),
    sourceWorkbook: varchar("source_workbook", { length: 200 }),
    fieldCount: integer("field_count").notNull().default(0),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_modules_version_key_uidx").on(table.schemaVersionId, table.moduleKey),
    index("neris_modules_area_idx").on(table.area),
  ],
);

export const nerisModuleGroups = pgTable(
  "neris_module_groups",
  {
    id: uuid("id").primaryKey(),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => nerisModules.id),
    groupKey: varchar("group_key", { length: 128 }).notNull(),
    ordinal: integer("ordinal").notNull().default(0),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("neris_module_groups_module_key_uidx").on(table.moduleId, table.groupKey),
  ],
);

export const nerisFields = pgTable(
  "neris_fields",
  {
    id: uuid("id").primaryKey(),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => nerisSchemaVersions.id),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => nerisModules.id),
    groupId: uuid("group_id").references(() => nerisModuleGroups.id),
    fieldKey: varchar("field_key", { length: 200 }).notNull(),
    dataType: varchar("data_type", { length: 128 }),
    cardinality: varchar("cardinality", { length: 32 }),
    format: varchar("format", { length: 128 }),
    officialRequired: boolean("official_required").notNull().default(false),
    nerisCore: boolean("neris_core").notNull().default(false),
    nerisCoreAid: boolean("neris_core_aid").notNull().default(false),
    computed: boolean("computed").notNull().default(false),
    computedFrom: text("computed_from"),
    valueSetRef: boolean("value_set_ref").notNull().default(false),
    valueSetLocation: varchar("value_set_location", { length: 200 }),
    valueSetCandidatesJson: jsonb("value_set_candidates_json").$type<string[]>().default([]),
    definition: text("definition"),
    exampleJson: jsonb("example_json"),
    comments: text("comments"),
    ordinal: integer("ordinal").notNull().default(0),
    immutableOfficial: boolean("immutable_official").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_fields_version_module_key_ord_uidx").on(
      table.schemaVersionId,
      table.moduleId,
      table.fieldKey,
      table.ordinal,
    ),
    index("neris_fields_value_set_location_idx").on(table.valueSetLocation),
  ],
);

export const nerisFieldConditions = pgTable(
  "neris_field_conditions",
  {
    id: uuid("id").primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => nerisFields.id),
    conditionKind: varchar("condition_kind", { length: 32 }).notNull(),
    rawExpression: text("raw_expression"),
    ruleJson: jsonb("rule_json"),
    parseStatus: varchar("parse_status", { length: 32 }).notNull().default("EMPTY"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_field_conditions_field_kind_uidx").on(table.fieldId, table.conditionKind),
    index("neris_field_conditions_parse_status_idx").on(table.parseStatus),
  ],
);

export const nerisFieldMappings = pgTable(
  "neris_field_mappings",
  {
    id: uuid("id").primaryKey(),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => nerisFields.id),
    mapOrmLanding: text("map_orm_landing"),
    mapApp: text("map_app"),
    payloadPath: text("payload_path"),
    immutableOfficial: boolean("immutable_official").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [uniqueIndex("neris_field_mappings_field_uidx").on(table.fieldId)],
);

export const nerisValueSets = pgTable(
  "neris_value_sets",
  {
    id: uuid("id").primaryKey(),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => nerisSchemaVersions.id),
    packageId: uuid("package_id")
      .notNull()
      .references(() => nerisSchemaPackages.id),
    sourceKey: varchar("source_key", { length: 300 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sourceWorkbook: varchar("source_workbook", { length: 200 }),
    optionCount: integer("option_count").notNull().default(0),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_value_sets_version_source_key_uidx").on(
      table.schemaVersionId,
      table.sourceKey,
    ),
    index("neris_value_sets_name_idx").on(table.name),
  ],
);

export const nerisValueOptions = pgTable(
  "neris_value_options",
  {
    id: uuid("id").primaryKey(),
    valueSetId: uuid("value_set_id")
      .notNull()
      .references(() => nerisValueSets.id),
    code: varchar("code", { length: 300 }).notNull(),
    active: boolean("active").notNull().default(true),
    description: text("description"),
    definition: text("definition"),
    source: text("source"),
    ordinal: integer("ordinal").notNull().default(0),
    value1: varchar("value_1", { length: 300 }),
    value2: varchar("value_2", { length: 300 }),
    value3: varchar("value_3", { length: 300 }),
    description1: text("description_1"),
    description2: text("description_2"),
    description3: text("description_3"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("neris_value_options_set_code_uidx").on(table.valueSetId, table.code),
    index("neris_value_options_active_idx").on(table.valueSetId, table.active),
  ],
);

export const nerisValueSetHierarchy = pgTable(
  "neris_value_set_hierarchy",
  {
    id: uuid("id").primaryKey(),
    valueSetId: uuid("value_set_id")
      .notNull()
      .references(() => nerisValueSets.id),
    parentOptionId: uuid("parent_option_id").references(() => nerisValueOptions.id),
    childOptionId: uuid("child_option_id").references(() => nerisValueOptions.id),
    parentCode: varchar("parent_code", { length: 300 }).notNull(),
    childCode: varchar("child_code", { length: 300 }).notNull(),
    level: integer("level").notNull().default(1),
    createdAt: createdAtColumn,
  },
  (table) => [
    uniqueIndex("neris_value_set_hierarchy_edge_uidx").on(
      table.valueSetId,
      table.parentCode,
      table.childCode,
      table.level,
    ),
  ],
);

export const nerisSchemaImportHistory = pgTable(
  "neris_schema_import_history",
  {
    id: uuid("id").primaryKey(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => nerisSchemaPackages.id),
    schemaVersionId: uuid("schema_version_id").references(() => nerisSchemaVersions.id),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    outcome: varchar("outcome", { length: 32 }).notNull(),
    moduleCount: integer("module_count").notNull().default(0),
    fieldCount: integer("field_count").notNull().default(0),
    valueSetCount: integer("value_set_count").notNull().default(0),
    optionCount: integer("option_count").notNull().default(0),
    detailsJson: jsonb("details_json").$type<Record<string, unknown>>().default({}),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: createdAtColumn,
  },
  (table) => [index("neris_schema_import_history_created_idx").on(table.createdAt)],
);

export const nerisSchemaValidationResults = pgTable(
  "neris_schema_validation_results",
  {
    id: uuid("id").primaryKey(),
    schemaVersionId: uuid("schema_version_id")
      .notNull()
      .references(() => nerisSchemaVersions.id),
    importHistoryId: uuid("import_history_id").references(() => nerisSchemaImportHistory.id),
    severity: varchar("severity", { length: 16 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    message: text("message").notNull(),
    resourceType: varchar("resource_type", { length: 64 }),
    resourceKey: varchar("resource_key", { length: 300 }),
    detailsJson: jsonb("details_json").$type<Record<string, unknown>>().default({}),
    createdAt: createdAtColumn,
  },
  (table) => [
    index("neris_schema_validation_results_version_idx").on(table.schemaVersionId, table.severity),
  ],
);

/** Tenant overlay header — only mutable NERIS configuration surface. */
export const tenantNerisConfiguration = pgTable(
  "tenant_neris_configuration",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    schemaVersionId: uuid("schema_version_id").references(() => nerisSchemaVersions.id),
    operatingMode: varchar("operating_mode", { length: 32 }).notNull().default("MANUAL_ONLY"),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"),
    allowManualCreationWhenCadEnabled: boolean("allow_manual_creation_when_cad_enabled")
      .notNull()
      .default(true),
    manualOverrideRequiresReason: boolean("manual_override_requires_reason")
      .notNull()
      .default(true),
    manualOverridePermission: varchar("manual_override_permission", { length: 120 })
      .notNull()
      .default("rms.cad.incident.manual_override"),
    cadUpdateCutoffPolicy: varchar("cad_update_cutoff_policy", { length: 64 })
      .notNull()
      .default("UNTIL_FINALIZED"),
    duplicateMatchThreshold: integer("duplicate_match_threshold").notNull().default(95),
    possibleDuplicateThreshold: integer("possible_duplicate_threshold").notNull().default(70),
    autoLinkThreshold: integer("auto_link_threshold").notNull().default(90),
    requireMatchReview: boolean("require_match_review").notNull().default(true),
    preserveCadComments: boolean("preserve_cad_comments").notNull().default(true),
    callerDataRetentionDays: integer("caller_data_retention_days").notNull().default(90),
    rawPayloadRetentionDays: integer("raw_payload_retention_days").notNull().default(180),
    cadQuietHoursJson: jsonb("cad_quiet_hours_json"),
    cadExpectedOperatingWindowJson: jsonb("cad_expected_operating_window_json"),
    recordVersion: recordVersionColumn,
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("tenant_neris_configuration_tenant_uidx").on(table.tenantId),
    index("tenant_neris_configuration_mode_idx").on(table.operatingMode),
  ],
);

export const tenantNerisFieldOverlays = pgTable(
  "tenant_neris_field_overlays",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => tenantNerisConfiguration.id),
    fieldId: uuid("field_id")
      .notNull()
      .references(() => nerisFields.id),
    displayLabel: varchar("display_label", { length: 300 }),
    helpText: text("help_text"),
    localAlias: varchar("local_alias", { length: 300 }),
    displayOrder: integer("display_order"),
    favorite: boolean("favorite").notNull().default(false),
    optionalVisible: boolean("optional_visible"),
    safeDefaultJson: jsonb("safe_default_json"),
    localValidationJson: jsonb("local_validation_json"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("tenant_neris_field_overlays_tenant_field_uidx").on(table.tenantId, table.fieldId),
  ],
);

export const tenantNerisValueOverlays = pgTable(
  "tenant_neris_value_overlays",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    configurationId: uuid("configuration_id")
      .notNull()
      .references(() => tenantNerisConfiguration.id),
    valueOptionId: uuid("value_option_id")
      .notNull()
      .references(() => nerisValueOptions.id),
    localAlias: varchar("local_alias", { length: 300 }),
    displayOrder: integer("display_order"),
    favorite: boolean("favorite").notNull().default(false),
    notes: text("notes"),
    recordVersion: recordVersionColumn,
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (table) => [
    uniqueIndex("tenant_neris_value_overlays_tenant_option_uidx").on(
      table.tenantId,
      table.valueOptionId,
    ),
  ],
);
