/**
 * Safety Supplies Inventory (SSIM) Drizzle schema.
 * Mirrors packages/database/drizzle/0072_industrial_safety_supplies_s0.sql
 * and packages/database/drizzle/0073_industrial_safety_supplies_s1_s11.sql
 */
import {
  boolean,
  date,
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAtColumn, updatedAtColumn } from "./common.js";
import { tenants } from "./tenants.js";

export const industrialSupplySettings = pgTable(
  "industrial_supply_settings",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    allowNegativeInventory: boolean("allow_negative_inventory").notNull().default(false),
    requireAdjustmentApproval: boolean("require_adjustment_approval").notNull().default(false),
    requireBlindInventoryCount: boolean("require_blind_inventory_count").notNull().default(false),
    enableInventoryCosting: boolean("enable_inventory_costing").notNull().default(true),
    defaultLowStockThreshold: integer("default_low_stock_threshold").notNull().default(0),
    requireEmployeeAcknowledgment: boolean("require_employee_acknowledgment")
      .notNull()
      .default(true),
    requireReturnCondition: boolean("require_return_condition").notNull().default(true),
    allowPpeIssueOverride: boolean("allow_ppe_issue_override").notNull().default(false),
    requireTrainingVerification: boolean("require_training_verification").notNull().default(true),
    enablePurchaseRequests: boolean("enable_purchase_requests").notNull().default(true),
    enablePurchaseOrders: boolean("enable_purchase_orders").notNull().default(true),
    requirePoApproval: boolean("require_po_approval").notNull().default(true),
    purchaseApprovalThreshold: numeric("purchase_approval_threshold", { precision: 14, scale: 2 }),
    defaultLabelType: varchar("default_label_type", { length: 64 })
      .notNull()
      .default("SMALL_INVENTORY"),
    defaultPrinter: varchar("default_printer", { length: 120 }),
    autoCreateQrOnItemCreate: boolean("auto_create_qr_on_item_create").notNull().default(true),
    expirationWarningDays: jsonb("expiration_warning_days")
      .notNull()
      .default([180, 90, 60, 30, 14, 7]),
    notificationSettings: jsonb("notification_settings").notNull().default({}),
    settings: jsonb("settings").notNull().default({}),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("industrial_supply_settings_tenant_uidx").on(t.tenantId)],
);

export const industrialSupplyCategories = pgTable(
  "industrial_supply_categories",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    parentId: uuid("parent_id"),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isSystem: boolean("is_system").notNull().default(false),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_categories_tenant_code_uidx")
      .on(t.tenantId, t.code)
      .where(sql`${t.archivedAt} IS NULL`),
    index("industrial_supply_categories_tenant_parent_idx").on(t.tenantId, t.parentId),
    index("industrial_supply_categories_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/** Immutable domain audit trail. Tenant users cannot update or delete rows. */
export const industrialSupplyAuditLog = pgTable(
  "industrial_supply_audit_log",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorUserId: uuid("actor_user_id"),
    action: varchar("action", { length: 64 }).notNull(),
    resourceType: varchar("resource_type", { length: 64 }).notNull(),
    resourceId: uuid("resource_id"),
    previousValue: jsonb("previous_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    ipAddress: varchar("ip_address", { length: 64 }),
    sessionMetadata: jsonb("session_metadata").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_supply_audit_log_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("industrial_supply_audit_log_tenant_resource_idx").on(
      t.tenantId,
      t.resourceType,
      t.resourceId,
    ),
  ],
);

// ========== S1 Item Master ==========

export const industrialSupplyItems = pgTable(
  "industrial_supply_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemNumber: varchar("item_number", { length: 64 }).notNull(),
    sku: varchar("sku", { length: 120 }),
    internalItemNumber: varchar("internal_item_number", { length: 120 }),
    name: varchar("name", { length: 300 }).notNull(),
    shortName: varchar("short_name", { length: 120 }),
    description: text("description"),
    categoryId: uuid("category_id").references(() => industrialSupplyCategories.id),
    subcategoryId: uuid("subcategory_id").references(() => industrialSupplyCategories.id),
    manufacturer: varchar("manufacturer", { length: 200 }),
    manufacturerPartNumber: varchar("manufacturer_part_number", { length: 120 }),
    brand: varchar("brand", { length: 120 }),
    model: varchar("model", { length: 120 }),
    inventoryType: varchar("inventory_type", { length: 64 }).notNull().default("CONSUMABLE"),
    unitOfMeasure: varchar("unit_of_measure", { length: 64 }).notNull().default("EA"),
    packageQuantity: numeric("package_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("1"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    minimumQuantity: numeric("minimum_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    maximumQuantity: numeric("maximum_quantity", { precision: 14, scale: 4 }),
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 4 }).notNull().default("0"),
    reorderQuantity: numeric("reorder_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    safetyStock: numeric("safety_stock", { precision: 14, scale: 4 }).notNull().default("0"),
    averageMonthlyUsage: numeric("average_monthly_usage", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    averageDailyUsage: numeric("average_daily_usage", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    leadTimeDays: integer("lead_time_days").notNull().default(0),
    // FK to locations/vendors added in migration after those tables exist; uuid only here.
    primaryLocationId: uuid("primary_location_id"),
    primaryVendorId: uuid("primary_vendor_id"),
    lastPurchaseCost: numeric("last_purchase_cost", { precision: 14, scale: 4 }),
    averageUnitCost: numeric("average_unit_cost", { precision: 14, scale: 4 }),
    standardCost: numeric("standard_cost", { precision: 14, scale: 4 }),
    packageCost: numeric("package_cost", { precision: 14, scale: 4 }),
    glAccount: varchar("gl_account", { length: 64 }),
    costCenter: varchar("cost_center", { length: 64 }),
    oshaRelevant: boolean("osha_relevant").notNull().default(false),
    ppeCategory: varchar("ppe_category", { length: 120 }),
    ansiStandard: varchar("ansi_standard", { length: 120 }),
    astmStandard: varchar("astm_standard", { length: 120 }),
    nioshApproval: varchar("niosh_approval", { length: 120 }),
    nfpaStandard: varchar("nfpa_standard", { length: 120 }),
    manufacturerCertification: varchar("manufacturer_certification", { length: 200 }),
    inspectionRequired: boolean("inspection_required").notNull().default(false),
    inspectionFrequencyDays: integer("inspection_frequency_days"),
    expirationTrackingRequired: boolean("expiration_tracking_required").notNull().default(false),
    shelfLifeDays: integer("shelf_life_days"),
    lotTrackingRequired: boolean("lot_tracking_required").notNull().default(false),
    serialTrackingRequired: boolean("serial_tracking_required").notNull().default(false),
    employeeAssignmentRequired: boolean("employee_assignment_required").notNull().default(false),
    trainingRequiredBeforeIssue: boolean("training_required_before_issue").notNull().default(false),
    requiredTrainingCodes: jsonb("required_training_codes").notNull().default([]),
    barcode: varchar("barcode", { length: 128 }),
    upc: varchar("upc", { length: 64 }),
    allowQrRequests: boolean("allow_qr_requests").notNull().default(true),
    approvalRequired: boolean("approval_required").notNull().default(false),
    maxQuantityPerRequest: numeric("max_quantity_per_request", { precision: 14, scale: 4 }),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_items_tenant_item_number_uidx")
      .on(t.tenantId, t.itemNumber)
      .where(sql`${t.archivedAt} IS NULL`),
    index("industrial_supply_items_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_supply_items_tenant_category_idx").on(t.tenantId, t.categoryId),
    index("industrial_supply_items_tenant_name_idx").on(t.tenantId, t.name),
    index("industrial_supply_items_tenant_sku_idx").on(t.tenantId, t.sku),
    index("industrial_supply_items_tenant_barcode_idx").on(t.tenantId, t.barcode),
  ],
);

export const industrialSupplyItemVariants = pgTable(
  "industrial_supply_item_variants",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantCode: varchar("variant_code", { length: 64 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    sizeLabel: varchar("size_label", { length: 64 }),
    sku: varchar("sku", { length: 120 }),
    barcode: varchar("barcode", { length: 128 }),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_item_variants_uidx")
      .on(t.tenantId, t.itemId, t.variantCode)
      .where(sql`${t.archivedAt} IS NULL`),
    index("industrial_supply_item_variants_item_idx").on(t.tenantId, t.itemId),
  ],
);

export const industrialSupplyLocations = pgTable(
  "industrial_supply_locations",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => industrialSupplyLocations.id),
    // industrial_sites / industrial_personnel: uuid only to avoid cross-file cycles
    siteId: uuid("site_id"),
    locationType: varchar("location_type", { length: 64 }).notNull().default("SUPPLY_ROOM"),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),
    custodianPersonnelId: uuid("custodian_personnel_id"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    path: text("path"),
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_locations_tenant_code_uidx")
      .on(t.tenantId, t.code)
      .where(sql`${t.archivedAt} IS NULL`),
    index("industrial_supply_locations_tenant_parent_idx").on(t.tenantId, t.parentId),
    index("industrial_supply_locations_tenant_site_idx").on(t.tenantId, t.siteId),
  ],
);

// ========== S2 Inventory Engine ==========

export const industrialSupplyLocationInventory = pgTable(
  "industrial_supply_location_inventory",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => industrialSupplyLocations.id),
    quantityOnHand: numeric("quantity_on_hand", { precision: 14, scale: 4 }).notNull().default("0"),
    quantityReserved: numeric("quantity_reserved", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    quantityAvailable: numeric("quantity_available", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    quantityOnOrder: numeric("quantity_on_order", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    minimumQuantity: numeric("minimum_quantity", { precision: 14, scale: 4 }),
    maximumQuantity: numeric("maximum_quantity", { precision: 14, scale: 4 }),
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 4 }),
    averageUnitCost: numeric("average_unit_cost", { precision: 14, scale: 4 }),
    lastCountedAt: timestamp("last_counted_at", { withTimezone: true }),
    lastTransactionAt: timestamp("last_transaction_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    // Migration uses COALESCE(variant_id, zero-uuid); simple uniqueIndex is fine (PG nulls distinct).
    uniqueIndex("industrial_supply_location_inventory_uidx").on(
      t.tenantId,
      t.itemId,
      t.variantId,
      t.locationId,
    ),
    index("industrial_supply_location_inventory_item_idx").on(t.tenantId, t.itemId),
    index("industrial_supply_location_inventory_location_idx").on(t.tenantId, t.locationId),
  ],
);

export const industrialSupplyLots = pgTable(
  "industrial_supply_lots",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    locationId: uuid("location_id").references(() => industrialSupplyLocations.id),
    lotNumber: varchar("lot_number", { length: 120 }).notNull(),
    manufacturerLot: varchar("manufacturer_lot", { length: 120 }),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull().default("0"),
    dateReceived: date("date_received"),
    manufactureDate: date("manufacture_date"),
    expirationDate: date("expiration_date"),
    supplierId: uuid("supplier_id"),
    purchaseOrderId: uuid("purchase_order_id"),
    status: varchar("status", { length: 64 }).notNull().default("CURRENT"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    index("industrial_supply_lots_tenant_item_idx").on(t.tenantId, t.itemId, t.expirationDate),
    index("industrial_supply_lots_tenant_lot_idx").on(t.tenantId, t.lotNumber),
    index("industrial_supply_lots_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const industrialSupplySerials = pgTable(
  "industrial_supply_serials",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    locationId: uuid("location_id").references(() => industrialSupplyLocations.id),
    forgeAssetNumber: varchar("forge_asset_number", { length: 64 }).notNull(),
    manufacturerSerialNumber: varchar("manufacturer_serial_number", { length: 120 }),
    purchaseDate: date("purchase_date"),
    cost: numeric("cost", { precision: 14, scale: 4 }),
    warrantyExpiration: date("warranty_expiration"),
    assignedPersonnelId: uuid("assigned_personnel_id"),
    condition: varchar("condition", { length: 64 }).notNull().default("GOOD"),
    inspectionStatus: varchar("inspection_status", { length: 64 }).notNull().default("CURRENT"),
    lastInspectionAt: timestamp("last_inspection_at", { withTimezone: true }),
    nextInspectionAt: timestamp("next_inspection_at", { withTimezone: true }),
    retirementDate: date("retirement_date"),
    status: varchar("status", { length: 64 }).notNull().default("AVAILABLE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_serials_tenant_asset_uidx")
      .on(t.tenantId, t.forgeAssetNumber)
      .where(sql`${t.archivedAt} IS NULL`),
    index("industrial_supply_serials_tenant_item_idx").on(t.tenantId, t.itemId),
    index("industrial_supply_serials_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_supply_serials_tenant_personnel_idx").on(t.tenantId, t.assignedPersonnelId),
  ],
);

export const industrialSupplyTransactions = pgTable(
  "industrial_supply_transactions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    lotId: uuid("lot_id").references(() => industrialSupplyLots.id),
    serialId: uuid("serial_id").references(() => industrialSupplySerials.id),
    transactionType: varchar("transaction_type", { length: 64 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    previousQuantity: numeric("previous_quantity", { precision: 14, scale: 4 }),
    newQuantity: numeric("new_quantity", { precision: 14, scale: 4 }),
    sourceLocationId: uuid("source_location_id").references(() => industrialSupplyLocations.id),
    destinationLocationId: uuid("destination_location_id").references(
      () => industrialSupplyLocations.id,
    ),
    personnelId: uuid("personnel_id"),
    departmentId: uuid("department_id"),
    relatedIncidentId: uuid("related_incident_id"),
    relatedInspectionId: uuid("related_inspection_id"),
    relatedRequestId: uuid("related_request_id"),
    relatedPoId: uuid("related_po_id"),
    relatedTransferId: uuid("related_transfer_id"),
    relatedCountId: uuid("related_count_id"),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }),
    reason: text("reason"),
    performedBy: uuid("performed_by"),
    recipientPrintedName: varchar("recipient_printed_name", { length: 255 }),
    recipientSignatureDataUrl: text("recipient_signature_data_url"),
    recipientSignedAt: timestamp("recipient_signed_at", { withTimezone: true }),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_supply_transactions_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("industrial_supply_transactions_tenant_item_idx").on(t.tenantId, t.itemId, t.createdAt),
    index("industrial_supply_transactions_tenant_type_idx").on(t.tenantId, t.transactionType),
  ],
);

export const industrialSupplyTransfers = pgTable(
  "industrial_supply_transfers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    transferNumber: varchar("transfer_number", { length: 64 }).notNull(),
    sourceLocationId: uuid("source_location_id")
      .notNull()
      .references(() => industrialSupplyLocations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => industrialSupplyLocations.id),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    receivedBy: uuid("received_by"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_transfers_number_uidx").on(t.tenantId, t.transferNumber),
    index("industrial_supply_transfers_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const industrialSupplyTransferItems = pgTable(
  "industrial_supply_transfer_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => industrialSupplyTransfers.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    lotId: uuid("lot_id").references(() => industrialSupplyLots.id),
    serialId: uuid("serial_id").references(() => industrialSupplySerials.id),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    createdAt: createdAtColumn,
  },
  (t) => [index("industrial_supply_transfer_items_transfer_idx").on(t.tenantId, t.transferId)],
);

// ========== S4 PPE ==========

export const industrialSupplyEmployeeAssignments = pgTable(
  "industrial_supply_employee_assignments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    personnelId: uuid("personnel_id").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    serialId: uuid("serial_id").references(() => industrialSupplySerials.id),
    lotId: uuid("lot_id").references(() => industrialSupplyLots.id),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull().default("1"),
    sizeLabel: varchar("size_label", { length: 64 }),
    issueDate: date("issue_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    issuedBy: uuid("issued_by"),
    condition: varchar("condition", { length: 64 }).notNull().default("GOOD"),
    replacementDueDate: date("replacement_due_date"),
    expectedReturnDate: date("expected_return_date"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnCondition: varchar("return_condition", { length: 64 }),
    returnDisposition: varchar("return_disposition", { length: 64 }),
    employeeAcknowledgedAt: timestamp("employee_acknowledged_at", { withTimezone: true }),
    notes: text("notes"),
    status: varchar("status", { length: 64 }).notNull().default("ASSIGNED"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_supply_employee_assignments_personnel_idx").on(
      t.tenantId,
      t.personnelId,
      t.status,
    ),
    index("industrial_supply_employee_assignments_item_idx").on(t.tenantId, t.itemId),
  ],
);

// ========== S5 Counts ==========

export const industrialSupplyCounts = pgTable(
  "industrial_supply_counts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    countNumber: varchar("count_number", { length: 64 }).notNull(),
    countType: varchar("count_type", { length: 64 }).notNull().default("CYCLE"),
    locationId: uuid("location_id").references(() => industrialSupplyLocations.id),
    categoryId: uuid("category_id").references(() => industrialSupplyCategories.id),
    blind: boolean("blind").notNull().default(false),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    submittedBy: uuid("submitted_by"),
    approvedBy: uuid("approved_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_counts_number_uidx").on(t.tenantId, t.countNumber),
    index("industrial_supply_counts_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const industrialSupplyCountItems = pgTable(
  "industrial_supply_count_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    countId: uuid("count_id")
      .notNull()
      .references(() => industrialSupplyCounts.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => industrialSupplyLocations.id),
    expectedQuantity: numeric("expected_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    actualQuantity: numeric("actual_quantity", { precision: 14, scale: 4 }),
    variance: numeric("variance", { precision: 14, scale: 4 }),
    notes: text("notes"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_supply_count_items_count_idx").on(t.tenantId, t.countId)],
);

// ========== S6 Inspections / Recalls ==========

export const industrialSupplyInspections = pgTable(
  "industrial_supply_inspections",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    serialId: uuid("serial_id").references(() => industrialSupplySerials.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    inspectionType: varchar("inspection_type", { length: 64 }).notNull().default("PERIODIC"),
    inspectorUserId: uuid("inspector_user_id"),
    inspectorPersonnelId: uuid("inspector_personnel_id"),
    inspectionDate: date("inspection_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    condition: varchar("condition", { length: 64 }),
    result: varchar("result", { length: 32 }).notNull().default("PASS"),
    deficiencies: text("deficiencies"),
    correctiveAction: text("corrective_action"),
    nextInspectionDate: date("next_inspection_date"),
    photosJson: jsonb("photos_json").notNull().default([]),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [
    index("industrial_supply_inspections_tenant_serial_idx").on(t.tenantId, t.serialId),
    index("industrial_supply_inspections_tenant_date_idx").on(t.tenantId, t.inspectionDate),
  ],
);

export const industrialSupplyRecallEvents = pgTable(
  "industrial_supply_recall_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: varchar("title", { length: 300 }).notNull(),
    manufacturer: varchar("manufacturer", { length: 200 }),
    productName: varchar("product_name", { length: 300 }),
    model: varchar("model", { length: 120 }),
    serialNumberFrom: varchar("serial_number_from", { length: 120 }),
    serialNumberTo: varchar("serial_number_to", { length: 120 }),
    lotNumber: varchar("lot_number", { length: 120 }),
    itemId: uuid("item_id").references(() => industrialSupplyItems.id),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [index("industrial_supply_recall_events_tenant_status_idx").on(t.tenantId, t.status)],
);

// ========== S7 Requests ==========

export const industrialSupplyRequests = pgTable(
  "industrial_supply_requests",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestNumber: varchar("request_number", { length: 64 }).notNull(),
    siteId: uuid("site_id"),
    qrLinkId: uuid("qr_link_id"),
    source: varchar("source", { length: 64 }).notNull().default("ADMIN_CREATED"),
    requestorType: varchar("requestor_type", { length: 64 }).notNull().default("EMPLOYEE"),
    personnelId: uuid("personnel_id"),
    departmentId: uuid("department_id"),
    locationId: uuid("location_id").references(() => industrialSupplyLocations.id),
    contractorName: varchar("contractor_name", { length: 200 }),
    contractorCompany: varchar("contractor_company", { length: 200 }),
    contractorPhone: varchar("contractor_phone", { length: 64 }),
    contractorEmail: varchar("contractor_email", { length: 320 }),
    workArea: varchar("work_area", { length: 200 }),
    neededBy: date("needed_by"),
    reason: text("reason"),
    notes: text("notes"),
    priority: varchar("priority", { length: 64 }).notNull().default("ROUTINE"),
    status: varchar("status", { length: 64 }).notNull().default("SUBMITTED"),
    assignedUserId: uuid("assigned_user_id"),
    publicStatusTokenHash: varchar("public_status_token_hash", { length: 128 }),
    employeeMessage: text("employee_message"),
    internalNotes: text("internal_notes"),
    denialReason: text("denial_reason"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    deniedAt: timestamp("denied_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_requests_number_uidx").on(t.tenantId, t.requestNumber),
    index("industrial_supply_requests_tenant_status_idx").on(t.tenantId, t.status),
    index("industrial_supply_requests_tenant_site_idx").on(t.tenantId, t.siteId),
    index("industrial_supply_requests_tenant_qr_idx").on(t.tenantId, t.qrLinkId),
    uniqueIndex("industrial_supply_requests_public_status_uidx")
      .on(t.publicStatusTokenHash)
      .where(sql`${t.publicStatusTokenHash} IS NOT NULL`),
  ],
);

export const industrialSupplyRequestItems = pgTable(
  "industrial_supply_request_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => industrialSupplyRequests.id),
    itemId: uuid("item_id").references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    quantityRequested: numeric("quantity_requested", { precision: 14, scale: 4 }).notNull(),
    quantityReserved: numeric("quantity_reserved", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    quantityApproved: numeric("quantity_approved", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    quantityIssued: numeric("quantity_issued", { precision: 14, scale: 4 }).notNull().default("0"),
    quantityBackordered: numeric("quantity_backordered", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    status: varchar("status", { length: 64 }).notNull().default("PENDING"),
    customItem: boolean("custom_item").notNull().default(false),
    customItemName: varchar("custom_item_name", { length: 300 }),
    customItemDescription: text("custom_item_description"),
    denialReason: text("denial_reason"),
    notes: text("notes"),
    backorderReason: text("backorder_reason"),
    expectedAvailabilityDate: date("expected_availability_date"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_supply_request_items_request_idx").on(t.tenantId, t.requestId)],
);

export const industrialSupplyRequestEvents = pgTable(
  "industrial_supply_request_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestId: uuid("request_id")
      .notNull()
      .references(() => industrialSupplyRequests.id),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    previousStatus: varchar("previous_status", { length: 64 }),
    newStatus: varchar("new_status", { length: 64 }),
    userId: uuid("user_id"),
    personnelId: uuid("personnel_id"),
    metadataJson: jsonb("metadata_json").notNull().default({}),
    createdAt: createdAtColumn,
  },
  (t) => [
    index("industrial_supply_request_events_request_idx").on(t.tenantId, t.requestId, t.createdAt),
  ],
);

// ========== S8 Purchasing ==========

export const industrialSupplyVendors = pgTable(
  "industrial_supply_vendors",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vendorNumber: varchar("vendor_number", { length: 64 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    accountNumber: varchar("account_number", { length: 120 }),
    address: text("address"),
    salesRepName: varchar("sales_rep_name", { length: 200 }),
    phone: varchar("phone", { length: 64 }),
    email: varchar("email", { length: 320 }),
    website: varchar("website", { length: 500 }),
    paymentTerms: varchar("payment_terms", { length: 120 }),
    shippingTerms: varchar("shipping_terms", { length: 120 }),
    notes: text("notes"),
    status: varchar("status", { length: 64 }).notNull().default("ACTIVE"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_vendors_number_uidx")
      .on(t.tenantId, t.vendorNumber)
      .where(sql`${t.archivedAt} IS NULL`),
    index("industrial_supply_vendors_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

export const industrialSupplyVendorItems = pgTable(
  "industrial_supply_vendor_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => industrialSupplyVendors.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    vendorPartNumber: varchar("vendor_part_number", { length: 120 }),
    packageSize: varchar("package_size", { length: 64 }),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }),
    contractPrice: numeric("contract_price", { precision: 14, scale: 4 }),
    minimumOrder: numeric("minimum_order", { precision: 14, scale: 4 }),
    leadTimeDays: integer("lead_time_days").notNull().default(0),
    lastPurchaseDate: date("last_purchase_date"),
    preferred: boolean("preferred").notNull().default(false),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_vendor_items_uidx")
      .on(t.tenantId, t.vendorId, t.itemId)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

export const industrialSupplyPurchaseRequests = pgTable(
  "industrial_supply_purchase_requests",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestNumber: varchar("request_number", { length: 64 }).notNull(),
    requesterUserId: uuid("requester_user_id"),
    departmentId: uuid("department_id"),
    siteId: uuid("site_id"),
    preferredVendorId: uuid("preferred_vendor_id").references(() => industrialSupplyVendors.id),
    neededDate: date("needed_date"),
    justification: text("justification"),
    estimatedTotal: numeric("estimated_total", { precision: 14, scale: 2 }),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_purchase_requests_number_uidx").on(t.tenantId, t.requestNumber),
  ],
);

export const industrialSupplyPurchaseRequestItems = pgTable(
  "industrial_supply_purchase_request_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    purchaseRequestId: uuid("purchase_request_id")
      .notNull()
      .references(() => industrialSupplyPurchaseRequests.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    estimatedUnitPrice: numeric("estimated_unit_price", { precision: 14, scale: 4 }),
    createdAt: createdAtColumn,
  },
);

export const industrialSupplyPurchaseOrders = pgTable(
  "industrial_supply_purchase_orders",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    poNumber: varchar("po_number", { length: 64 }).notNull(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => industrialSupplyVendors.id),
    orderDate: date("order_date")
      .notNull()
      .default(sql`CURRENT_DATE`),
    requestedBy: uuid("requested_by"),
    approvedBy: uuid("approved_by"),
    siteId: uuid("site_id"),
    shipToLocationId: uuid("ship_to_location_id").references(() => industrialSupplyLocations.id),
    subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
    taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    shippingAmount: numeric("shipping_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
    expectedDelivery: date("expected_delivery"),
    notes: text("notes"),
    status: varchar("status", { length: 64 }).notNull().default("DRAFT"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_purchase_orders_number_uidx").on(t.tenantId, t.poNumber),
    index("industrial_supply_purchase_orders_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const industrialSupplyPurchaseOrderItems = pgTable(
  "industrial_supply_purchase_order_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => industrialSupplyPurchaseOrders.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    quantityOrdered: numeric("quantity_ordered", { precision: 14, scale: 4 }).notNull(),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull().default("0"),
    lineTotal: numeric("line_total", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_supply_purchase_order_items_po_idx").on(t.tenantId, t.purchaseOrderId)],
);

export const industrialSupplyReceipts = pgTable(
  "industrial_supply_receipts",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    receiptNumber: varchar("receipt_number", { length: 64 }).notNull(),
    purchaseOrderId: uuid("purchase_order_id").references(() => industrialSupplyPurchaseOrders.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => industrialSupplyLocations.id),
    receivedBy: uuid("received_by"),
    source: varchar("source", { length: 200 }),
    notes: text("notes"),
    createdAt: createdAtColumn,
  },
  (t) => [uniqueIndex("industrial_supply_receipts_number_uidx").on(t.tenantId, t.receiptNumber)],
);

// ========== S9 Reorder ==========

export const industrialSupplyReorderRules = pgTable(
  "industrial_supply_reorder_rules",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    locationId: uuid("location_id").references(() => industrialSupplyLocations.id),
    minimumQuantity: numeric("minimum_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    maximumQuantity: numeric("maximum_quantity", { precision: 14, scale: 4 }),
    reorderPoint: numeric("reorder_point", { precision: 14, scale: 4 }).notNull().default("0"),
    reorderQuantity: numeric("reorder_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    preferredVendorId: uuid("preferred_vendor_id").references(() => industrialSupplyVendors.id),
    active: boolean("active").notNull().default(true),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
  },
  (t) => [index("industrial_supply_reorder_rules_item_idx").on(t.tenantId, t.itemId)],
);

// ========== S10 Kits ==========

export const industrialSupplyKits = pgTable(
  "industrial_supply_kits",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kitNumber: varchar("kit_number", { length: 64 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    kitType: varchar("kit_type", { length: 64 }).notNull().default("FIRST_AID"),
    locationId: uuid("location_id").references(() => industrialSupplyLocations.id),
    status: varchar("status", { length: 64 }).notNull().default("READY"),
    notes: text("notes"),
    createdAt: createdAtColumn,
    updatedAt: updatedAtColumn,
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("industrial_supply_kits_number_uidx")
      .on(t.tenantId, t.kitNumber)
      .where(sql`${t.archivedAt} IS NULL`),
  ],
);

export const industrialSupplyKitItems = pgTable(
  "industrial_supply_kit_items",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    kitId: uuid("kit_id")
      .notNull()
      .references(() => industrialSupplyKits.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => industrialSupplyItems.id),
    variantId: uuid("variant_id").references(() => industrialSupplyItemVariants.id),
    expectedQuantity: numeric("expected_quantity", { precision: 14, scale: 4 })
      .notNull()
      .default("1"),
    createdAt: createdAtColumn,
  },
  (t) => [index("industrial_supply_kit_items_kit_idx").on(t.tenantId, t.kitId)],
);

export type IndustrialSupplySettings = typeof industrialSupplySettings.$inferSelect;
export type IndustrialSupplyCategory = typeof industrialSupplyCategories.$inferSelect;
export type IndustrialSupplyAuditLog = typeof industrialSupplyAuditLog.$inferSelect;
export type IndustrialSupplyItem = typeof industrialSupplyItems.$inferSelect;
export type IndustrialSupplyItemVariant = typeof industrialSupplyItemVariants.$inferSelect;
export type IndustrialSupplyLocation = typeof industrialSupplyLocations.$inferSelect;
export type IndustrialSupplyLocationInventory =
  typeof industrialSupplyLocationInventory.$inferSelect;
export type IndustrialSupplyLot = typeof industrialSupplyLots.$inferSelect;
export type IndustrialSupplySerial = typeof industrialSupplySerials.$inferSelect;
export type IndustrialSupplyTransaction = typeof industrialSupplyTransactions.$inferSelect;
export type IndustrialSupplyTransfer = typeof industrialSupplyTransfers.$inferSelect;
export type IndustrialSupplyTransferItem = typeof industrialSupplyTransferItems.$inferSelect;
export type IndustrialSupplyEmployeeAssignment =
  typeof industrialSupplyEmployeeAssignments.$inferSelect;
export type IndustrialSupplyCount = typeof industrialSupplyCounts.$inferSelect;
export type IndustrialSupplyCountItem = typeof industrialSupplyCountItems.$inferSelect;
export type IndustrialSupplyInspection = typeof industrialSupplyInspections.$inferSelect;
export type IndustrialSupplyRecallEvent = typeof industrialSupplyRecallEvents.$inferSelect;
export type IndustrialSupplyRequest = typeof industrialSupplyRequests.$inferSelect;
export type IndustrialSupplyRequestItem = typeof industrialSupplyRequestItems.$inferSelect;
export type IndustrialSupplyRequestEvent = typeof industrialSupplyRequestEvents.$inferSelect;
export type IndustrialSupplyVendor = typeof industrialSupplyVendors.$inferSelect;
export type IndustrialSupplyVendorItem = typeof industrialSupplyVendorItems.$inferSelect;
export type IndustrialSupplyPurchaseRequest = typeof industrialSupplyPurchaseRequests.$inferSelect;
export type IndustrialSupplyPurchaseRequestItem =
  typeof industrialSupplyPurchaseRequestItems.$inferSelect;
export type IndustrialSupplyPurchaseOrder = typeof industrialSupplyPurchaseOrders.$inferSelect;
export type IndustrialSupplyPurchaseOrderItem =
  typeof industrialSupplyPurchaseOrderItems.$inferSelect;
export type IndustrialSupplyReceipt = typeof industrialSupplyReceipts.$inferSelect;
export type IndustrialSupplyReorderRule = typeof industrialSupplyReorderRules.$inferSelect;
export type IndustrialSupplyKit = typeof industrialSupplyKits.$inferSelect;
export type IndustrialSupplyKitItem = typeof industrialSupplyKitItems.$inferSelect;
