/**
 * Forge Printer Bridge / industrial print service (migration 0092).
 * Brady Bridge Phase 1 tables with industrial_ prefix.
 */
import {
  type AnyPgColumn,
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
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { industrialDepartments, industrialSites } from "./industrial.js";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

/** Windows Bridge agent registered to a tenant site/division. */
export const industrialPrinterBridges = pgTable(
  "industrial_printer_bridges",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    deviceId: varchar("device_id", { length: 120 }).notNull(),
    computerName: varchar("computer_name", { length: 200 }),
    locationId: uuid("location_id").references(() => industrialSites.id),
    divisionId: uuid("division_id").references(() => industrialDepartments.id),
    osVersion: varchar("os_version", { length: 120 }),
    bridgeVersion: varchar("bridge_version", { length: 64 }),
    /** ONLINE | OFFLINE | PAIRING | DISABLED */
    status: varchar("status", { length: 32 }).notNull().default("PAIRING"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    registeredAt: timestamp("registered_at", { withTimezone: true }),
    registeredBy: uuid("registered_by").references(() => users.id),
    certificateThumbprint: varchar("certificate_thumbprint", { length: 128 }),
    devicePublicKey: text("device_public_key"),
    remoteIp: varchar("remote_ip", { length: 64 }),
    autoUpdateEnabled: boolean("auto_update_enabled").notNull().default(true),
    enabled: boolean("enabled").notNull().default(true),
    accessTokenHash: varchar("access_token_hash", { length: 128 }),
    pairingCodeHash: varchar("pairing_code_hash", { length: 128 }),
    pairingExpiresAt: timestamp("pairing_expires_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_printer_bridges_device_uidx").on(t.tenantId, t.deviceId),
    index("industrial_printer_bridges_tenant_idx").on(t.tenantId, t.status),
    index("industrial_printer_bridges_location_idx").on(t.tenantId, t.locationId),
  ],
);

/** Physical or queue-backed printers discovered/managed via a bridge. */
export const industrialPrinters = pgTable(
  "industrial_printers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    bridgeId: uuid("bridge_id").references(() => industrialPrinterBridges.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 200 }).notNull(),
    displayName: varchar("display_name", { length: 300 }),
    manufacturer: varchar("manufacturer", { length: 120 }),
    model: varchar("model", { length: 120 }),
    serialNumber: varchar("serial_number", { length: 120 }),
    connectionType: varchar("connection_type", { length: 64 }),
    transportType: varchar("transport_type", { length: 64 }),
    windowsQueueName: varchar("windows_queue_name", { length: 300 }),
    deviceIdentifier: varchar("device_identifier", { length: 200 }),
    bluetoothDeviceId: varchar("bluetooth_device_id", { length: 200 }),
    bluetoothSavedId: varchar("bluetooth_saved_id", { length: 200 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    macAddress: varchar("mac_address", { length: 64 }),
    dpi: integer("dpi"),
    maxPrintWidthInches: doublePrecision("max_print_width_inches"),
    supportsBitmap: boolean("supports_bitmap").notNull().default(true),
    supportsCut: boolean("supports_cut").notNull().default(false),
    supportsFeed: boolean("supports_feed").notNull().default(true),
    supportsMultipleCopies: boolean("supports_multiple_copies").notNull().default(true),
    locationId: uuid("location_id").references(() => industrialSites.id),
    divisionId: uuid("division_id").references(() => industrialDepartments.id),
    departmentId: uuid("department_id").references(() => industrialDepartments.id),
    online: boolean("online").notNull().default(false),
    connected: boolean("connected").notNull().default(false),
    ready: boolean("ready").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 64 }),
    lastErrorMessage: text("last_error_message"),
    ribbonOk: boolean("ribbon_ok"),
    mediaOk: boolean("media_ok"),
    batteryPercent: integer("battery_percent"),
    supplyName: varchar("supply_name", { length: 200 }),
    lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_printers_tenant_idx").on(t.tenantId, t.enabled),
    index("industrial_printers_bridge_idx").on(t.tenantId, t.bridgeId),
    index("industrial_printers_location_idx").on(t.tenantId, t.locationId),
    uniqueIndex("industrial_printers_device_uidx").on(t.tenantId, t.bridgeId, t.deviceIdentifier),
  ],
);

/** Label template catalog entry. */
export const industrialLabelTemplates = pgTable(
  "industrial_label_templates",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    category: varchar("category", { length: 120 }).notNull().default("Custom Labels"),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_label_templates_code_uidx").on(t.tenantId, t.code),
    index("industrial_label_templates_tenant_idx").on(t.tenantId, t.category, t.enabled),
  ],
);

/** Immutable-ish versioned layout for a label template. */
export const industrialLabelTemplateVersions = pgTable(
  "industrial_label_template_versions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => industrialLabelTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    layoutJson: jsonb("layout_json").notNull().default({}),
    dpi: integer("dpi").notNull().default(300),
    widthInches: doublePrecision("width_inches").notNull(),
    heightInches: doublePrecision("height_inches").notNull(),
    /** DRAFT | PUBLISHED */
    status: varchar("status", { length: 32 }).notNull().default("DRAFT"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_label_template_versions_uidx").on(t.templateId, t.version),
    index("industrial_label_template_versions_tenant_idx").on(t.tenantId, t.status),
  ],
);

/** Dynamic field definitions for a template version. */
export const industrialLabelTemplateFields = pgTable(
  "industrial_label_template_fields",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => industrialLabelTemplateVersions.id, { onDelete: "cascade" }),
    fieldKey: varchar("field_key", { length: 120 }).notNull(),
    fieldType: varchar("field_type", { length: 64 }).notNull(),
    label: varchar("label", { length: 300 }),
    required: boolean("required").notNull().default(false),
    defaultValue: text("default_value"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_label_template_fields_uidx").on(t.templateVersionId, t.fieldKey),
    index("industrial_label_template_fields_tenant_idx").on(t.tenantId),
  ],
);

/** Known label media / supply sizes for a printer model. */
export const industrialPrinterMediaProfiles = pgTable(
  "industrial_printer_media_profiles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    manufacturer: varchar("manufacturer", { length: 120 }).notNull(),
    printerModel: varchar("printer_model", { length: 120 }).notNull(),
    partNumber: varchar("part_number", { length: 120 }),
    name: varchar("name", { length: 300 }).notNull(),
    widthInches: doublePrecision("width_inches").notNull(),
    heightInches: doublePrecision("height_inches").notNull(),
    continuous: boolean("continuous").notNull().default(false),
    dieCut: boolean("die_cut").notNull().default(true),
    printableWidth: doublePrecision("printable_width"),
    printableHeight: doublePrecision("printable_height"),
    orientation: varchar("orientation", { length: 32 }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_printer_media_profiles_tenant_idx").on(
      t.tenantId,
      t.manufacturer,
      t.printerModel,
    ),
    uniqueIndex("industrial_printer_media_profiles_part_uidx").on(
      t.tenantId,
      t.manufacturer,
      t.printerModel,
      t.partNumber,
    ),
  ],
);

/** Per-printer default settings (1:1 with printer). */
export const industrialPrinterProfiles = pgTable(
  "industrial_printer_profiles",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    printerId: uuid("printer_id")
      .notNull()
      .references(() => industrialPrinters.id, { onDelete: "cascade" }),
    dpi: integer("dpi"),
    defaultMediaId: uuid("default_media_id").references(() => industrialPrinterMediaProfiles.id, {
      onDelete: "set null",
    }),
    defaultOrientation: varchar("default_orientation", { length: 32 }),
    defaultCopies: integer("default_copies").notNull().default(1),
    defaultCutMode: varchar("default_cut_mode", { length: 32 }),
    darkness: integer("darkness"),
    speed: integer("speed"),
    xOffset: doublePrecision("x_offset"),
    yOffset: doublePrecision("y_offset"),
    preferredTransport: varchar("preferred_transport", { length: 64 }),
    fallbackPrinterId: uuid("fallback_printer_id").references(() => industrialPrinters.id, {
      onDelete: "set null",
    }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_printer_profiles_printer_uidx").on(t.printerId),
    index("industrial_printer_profiles_tenant_idx").on(t.tenantId),
  ],
);

/** Multi-label batch wrapper for sequential/bulk print. */
export const industrialPrintBatches = pgTable(
  "industrial_print_batches",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestedBy: uuid("requested_by").references(() => users.id),
    printerId: uuid("printer_id").references(() => industrialPrinters.id, { onDelete: "set null" }),
    name: varchar("name", { length: 300 }),
    stopOnFail: boolean("stop_on_fail").notNull().default(true),
    printMode: varchar("print_mode", { length: 64 }).notNull().default("BRIDGE"),
    mediaProfileId: uuid("media_profile_id").references(() => industrialPrinterMediaProfiles.id, {
      onDelete: "set null",
    }),
    copiesPerItem: integer("copies_per_item").notNull().default(1),
    totalJobs: integer("total_jobs").notNull().default(0),
    completedJobs: integer("completed_jobs").notNull().default(0),
    failedJobs: integer("failed_jobs").notNull().default(0),
    status: varchar("status", { length: 64 }).notNull().default("CREATED"),
    createdAt: createdAtColumn,
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_print_batches_tenant_idx").on(t.tenantId, t.status),
    index("industrial_print_batches_printer_idx").on(t.tenantId, t.printerId),
  ],
);

/** Cloud-authoritative print job lifecycle record. */
export const industrialPrintJobs = pgTable(
  "industrial_print_jobs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    printerId: uuid("printer_id").references(() => industrialPrinters.id, { onDelete: "set null" }),
    bridgeId: uuid("bridge_id").references(() => industrialPrinterBridges.id, {
      onDelete: "set null",
    }),
    batchId: uuid("batch_id").references(() => industrialPrintBatches.id, { onDelete: "set null" }),
    templateId: uuid("template_id").references(() => industrialLabelTemplates.id, {
      onDelete: "set null",
    }),
    templateVersion: integer("template_version"),
    module: varchar("module", { length: 120 }),
    recordType: varchar("record_type", { length: 120 }),
    recordId: uuid("record_id"),
    requestedBy: uuid("requested_by").references(() => users.id),
    requestedFromDevice: varchar("requested_from_device", { length: 200 }),
    copies: integer("copies").notNull().default(1),
    widthInches: doublePrecision("width_inches"),
    heightInches: doublePrecision("height_inches"),
    dpi: integer("dpi"),
    orientation: varchar("orientation", { length: 32 }),
    cutMode: varchar("cut_mode", { length: 32 }),
    artifactType: varchar("artifact_type", { length: 64 }),
    artifactStorageKey: text("artifact_storage_key"),
    artifactSha256: varchar("artifact_sha256", { length: 64 }),
    status: varchar("status", { length: 64 }).notNull().default("CREATED"),
    priority: integer("priority").notNull().default(0),
    createdAt: createdAtColumn,
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    retryCount: integer("retry_count").notNull().default(0),
    parentJobId: uuid("parent_job_id").references((): AnyPgColumn => industrialPrintJobs.id, {
      onDelete: "set null",
    }),
    reprintReason: text("reprint_reason"),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("industrial_print_jobs_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_print_jobs_printer_idx").on(t.tenantId, t.printerId),
    index("industrial_print_jobs_bridge_idx").on(t.tenantId, t.bridgeId),
    index("industrial_print_jobs_batch_idx").on(t.tenantId, t.batchId),
    index("industrial_print_jobs_record_idx").on(t.tenantId, t.module, t.recordType, t.recordId),
    index("industrial_print_jobs_parent_idx").on(t.parentJobId),
  ],
);

/** Append-only audit trail for print job state transitions. */
export const industrialPrintJobEvents = pgTable(
  "industrial_print_job_events",
  {
    id: uuid("id").primaryKey(),
    printJobId: uuid("print_job_id")
      .notNull()
      .references(() => industrialPrintJobs.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    event: varchar("event", { length: 120 }).notNull(),
    status: varchar("status", { length: 64 }),
    message: text("message"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    source: varchar("source", { length: 64 }),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_print_job_events_job_idx").on(t.printJobId, t.createdAt),
    index("industrial_print_job_events_tenant_idx").on(t.tenantId),
  ],
);

/** Short-lived bridge pairing codes (display value may be masked). */
export const industrialBridgePairingCodes = pgTable(
  "industrial_bridge_pairing_codes",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    /** Brief display form (masked or last characters) for admin UI. */
    codeDisplay: varchar("code_display", { length: 32 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    bridgeId: uuid("bridge_id").references(() => industrialPrinterBridges.id, {
      onDelete: "set null",
    }),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_bridge_pairing_codes_hash_uidx").on(t.codeHash),
    index("industrial_bridge_pairing_codes_tenant_idx").on(t.tenantId, t.expiresAt),
  ],
);

export type IndustrialPrinterBridgeRow = typeof industrialPrinterBridges.$inferSelect;
export type IndustrialPrinterRow = typeof industrialPrinters.$inferSelect;
export type IndustrialLabelTemplateRow = typeof industrialLabelTemplates.$inferSelect;
export type IndustrialLabelTemplateVersionRow = typeof industrialLabelTemplateVersions.$inferSelect;
export type IndustrialLabelTemplateFieldRow = typeof industrialLabelTemplateFields.$inferSelect;
export type IndustrialPrinterMediaProfileRow = typeof industrialPrinterMediaProfiles.$inferSelect;
export type IndustrialPrinterProfileRow = typeof industrialPrinterProfiles.$inferSelect;
export type IndustrialPrintBatchRow = typeof industrialPrintBatches.$inferSelect;
export type IndustrialPrintJobRow = typeof industrialPrintJobs.$inferSelect;
export type IndustrialPrintJobEventRow = typeof industrialPrintJobEvents.$inferSelect;
export type IndustrialBridgePairingCodeRow = typeof industrialBridgePairingCodes.$inferSelect;

/** Logical printer group for failover / load strategies (Phase 3 routing). */
export const industrialPrinterGroups = pgTable(
  "industrial_printer_groups",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    /** PRIMARY_FAILOVER | ROUND_ROBIN | LEAST_BUSY | FIRST_AVAILABLE | MANUAL */
    strategy: varchar("strategy", { length: 64 }).notNull().default("PRIMARY_FAILOVER"),
    locationId: uuid("location_id").references(() => industrialSites.id),
    divisionId: uuid("division_id").references(() => industrialDepartments.id),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_printer_groups_tenant_idx").on(t.tenantId, t.enabled),
    index("industrial_printer_groups_location_idx").on(t.tenantId, t.locationId),
  ],
);

export const industrialPrinterGroupMembers = pgTable(
  "industrial_printer_group_members",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => industrialPrinterGroups.id, { onDelete: "cascade" }),
    printerId: uuid("printer_id")
      .notNull()
      .references(() => industrialPrinters.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: createdAtColumn,
  },
  (t) => [
    uniqueIndex("industrial_printer_group_members_uidx").on(t.groupId, t.printerId),
    index("industrial_printer_group_members_tenant_idx").on(t.tenantId, t.groupId),
  ],
);

/** Priority-ordered print routing rules (Phase 3). */
export const industrialPrintRoutingRules = pgTable(
  "industrial_print_routing_rules",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    /** Match conditions: locationId, divisionId, module, recordType (null = any). */
    conditionsJson: jsonb("conditions_json").notNull().default({}),
    /** Action: printerId and/or printerGroupId. */
    actionJson: jsonb("action_json").notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_print_routing_rules_tenant_idx").on(t.tenantId, t.enabled, t.priority)],
);

/** Printer media / consumable stock with estimated remaining (Phase 7). */
export const industrialPrintSupplies = pgTable(
  "industrial_print_supplies",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    printerId: uuid("printer_id").references(() => industrialPrinters.id, {
      onDelete: "set null",
    }),
    /** PAPER | LABELS | RIBBON | TONER | INK | CARDS | SPECIALTY_MEDIA | OTHER */
    supplyType: varchar("supply_type", { length: 64 }).notNull().default("LABELS"),
    name: varchar("name", { length: 200 }).notNull(),
    sku: varchar("sku", { length: 120 }),
    unit: varchar("unit", { length: 64 }).notNull().default("labels"),
    startingQuantity: integer("starting_quantity").notNull().default(0),
    estimatedRemaining: integer("estimated_remaining").notNull().default(0),
    unitsConsumed: integer("units_consumed").notNull().default(0),
    warningThreshold: integer("warning_threshold").notNull().default(50),
    criticalThreshold: integer("critical_threshold").notNull().default(15),
    lastReplacedAt: timestamp("last_replaced_at", { withTimezone: true }),
    /** NONE | LOW | CRITICAL | EMPTY */
    lastAlertLevel: varchar("last_alert_level", { length: 32 }).notNull().default("NONE"),
    /** User IDs to notify when alert level worsens. */
    alertUserIds: jsonb("alert_user_ids").notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_print_supplies_tenant_idx").on(t.tenantId, t.enabled),
    index("industrial_print_supplies_printer_idx").on(t.tenantId, t.printerId),
    index("industrial_print_supplies_type_idx").on(t.tenantId, t.supplyType),
  ],
);

export type IndustrialPrinterGroupRow = typeof industrialPrinterGroups.$inferSelect;
export type IndustrialPrinterGroupMemberRow = typeof industrialPrinterGroupMembers.$inferSelect;
export type IndustrialPrintRoutingRuleRow = typeof industrialPrintRoutingRules.$inferSelect;
export type IndustrialPrintSupplyRow = typeof industrialPrintSupplies.$inferSelect;
