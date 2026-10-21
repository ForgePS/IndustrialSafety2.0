-- INDUSTRIAL SAFETY SUPPLIES S1-S11: inventory lifecycle tables.
-- Additive. Tenant RLS. Builds on 0072 foundation (settings/categories/audit).

-- ========== S1 Item Master ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_number" varchar(64) NOT NULL,
  "sku" varchar(120),
  "internal_item_number" varchar(120),
  "name" varchar(300) NOT NULL,
  "short_name" varchar(120),
  "description" text,
  "category_id" uuid REFERENCES "industrial_supply_categories"("id"),
  "subcategory_id" uuid REFERENCES "industrial_supply_categories"("id"),
  "manufacturer" varchar(200),
  "manufacturer_part_number" varchar(120),
  "brand" varchar(120),
  "model" varchar(120),
  "inventory_type" varchar(64) NOT NULL DEFAULT 'CONSUMABLE',
  "unit_of_measure" varchar(64) NOT NULL DEFAULT 'EA',
  "package_quantity" numeric(14, 4) NOT NULL DEFAULT 1,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "minimum_quantity" numeric(14, 4) NOT NULL DEFAULT 0,
  "maximum_quantity" numeric(14, 4),
  "reorder_point" numeric(14, 4) NOT NULL DEFAULT 0,
  "reorder_quantity" numeric(14, 4) NOT NULL DEFAULT 0,
  "safety_stock" numeric(14, 4) NOT NULL DEFAULT 0,
  "average_monthly_usage" numeric(14, 4) NOT NULL DEFAULT 0,
  "average_daily_usage" numeric(14, 4) NOT NULL DEFAULT 0,
  "lead_time_days" integer NOT NULL DEFAULT 0,
  "primary_location_id" uuid,
  "primary_vendor_id" uuid,
  "last_purchase_cost" numeric(14, 4),
  "average_unit_cost" numeric(14, 4),
  "standard_cost" numeric(14, 4),
  "package_cost" numeric(14, 4),
  "gl_account" varchar(64),
  "cost_center" varchar(64),
  "osha_relevant" boolean NOT NULL DEFAULT false,
  "ppe_category" varchar(120),
  "ansi_standard" varchar(120),
  "astm_standard" varchar(120),
  "niosh_approval" varchar(120),
  "nfpa_standard" varchar(120),
  "manufacturer_certification" varchar(200),
  "inspection_required" boolean NOT NULL DEFAULT false,
  "inspection_frequency_days" integer,
  "expiration_tracking_required" boolean NOT NULL DEFAULT false,
  "shelf_life_days" integer,
  "lot_tracking_required" boolean NOT NULL DEFAULT false,
  "serial_tracking_required" boolean NOT NULL DEFAULT false,
  "employee_assignment_required" boolean NOT NULL DEFAULT false,
  "training_required_before_issue" boolean NOT NULL DEFAULT false,
  "required_training_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "barcode" varchar(128),
  "upc" varchar(64),
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_items_tenant_item_number_uidx"
  ON "industrial_supply_items" ("tenant_id", "item_number") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_supply_items_tenant_status_idx"
  ON "industrial_supply_items" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_supply_items_tenant_category_idx"
  ON "industrial_supply_items" ("tenant_id", "category_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_items_tenant_name_idx"
  ON "industrial_supply_items" ("tenant_id", "name");
CREATE INDEX IF NOT EXISTS "industrial_supply_items_tenant_sku_idx"
  ON "industrial_supply_items" ("tenant_id", "sku");
CREATE INDEX IF NOT EXISTS "industrial_supply_items_tenant_barcode_idx"
  ON "industrial_supply_items" ("tenant_id", "barcode");

CREATE TABLE IF NOT EXISTS "industrial_supply_item_variants" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "size_label" varchar(64),
  "sku" varchar(120),
  "barcode" varchar(128),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_item_variants_uidx"
  ON "industrial_supply_item_variants" ("tenant_id", "item_id", "variant_code")
  WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_supply_item_variants_item_idx"
  ON "industrial_supply_item_variants" ("tenant_id", "item_id");

CREATE TABLE IF NOT EXISTS "industrial_supply_locations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "parent_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "location_type" varchar(64) NOT NULL DEFAULT 'SUPPLY_ROOM',
  "code" varchar(64) NOT NULL,
  "name" varchar(300) NOT NULL,
  "description" text,
  "custodian_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "path" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_locations_tenant_code_uidx"
  ON "industrial_supply_locations" ("tenant_id", "code") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_supply_locations_tenant_parent_idx"
  ON "industrial_supply_locations" ("tenant_id", "parent_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_locations_tenant_site_idx"
  ON "industrial_supply_locations" ("tenant_id", "site_id");

-- ========== S2 Inventory Engine ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_location_inventory" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "location_id" uuid NOT NULL REFERENCES "industrial_supply_locations"("id"),
  "quantity_on_hand" numeric(14, 4) NOT NULL DEFAULT 0,
  "quantity_reserved" numeric(14, 4) NOT NULL DEFAULT 0,
  "quantity_available" numeric(14, 4) NOT NULL DEFAULT 0,
  "quantity_on_order" numeric(14, 4) NOT NULL DEFAULT 0,
  "minimum_quantity" numeric(14, 4),
  "maximum_quantity" numeric(14, 4),
  "reorder_point" numeric(14, 4),
  "average_unit_cost" numeric(14, 4),
  "last_counted_at" timestamptz,
  "last_transaction_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_location_inventory_uidx"
  ON "industrial_supply_location_inventory" (
    "tenant_id", "item_id", COALESCE("variant_id", '00000000-0000-0000-0000-000000000000'::uuid), "location_id"
  );
CREATE INDEX IF NOT EXISTS "industrial_supply_location_inventory_item_idx"
  ON "industrial_supply_location_inventory" ("tenant_id", "item_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_location_inventory_location_idx"
  ON "industrial_supply_location_inventory" ("tenant_id", "location_id");

CREATE TABLE IF NOT EXISTS "industrial_supply_lots" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "lot_number" varchar(120) NOT NULL,
  "manufacturer_lot" varchar(120),
  "quantity" numeric(14, 4) NOT NULL DEFAULT 0,
  "date_received" date,
  "manufacture_date" date,
  "expiration_date" date,
  "supplier_id" uuid,
  "purchase_order_id" uuid,
  "status" varchar(64) NOT NULL DEFAULT 'CURRENT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_supply_lots_tenant_item_idx"
  ON "industrial_supply_lots" ("tenant_id", "item_id", "expiration_date");
CREATE INDEX IF NOT EXISTS "industrial_supply_lots_tenant_lot_idx"
  ON "industrial_supply_lots" ("tenant_id", "lot_number");
CREATE INDEX IF NOT EXISTS "industrial_supply_lots_tenant_status_idx"
  ON "industrial_supply_lots" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "industrial_supply_serials" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "forge_asset_number" varchar(64) NOT NULL,
  "manufacturer_serial_number" varchar(120),
  "purchase_date" date,
  "cost" numeric(14, 4),
  "warranty_expiration" date,
  "assigned_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "condition" varchar(64) NOT NULL DEFAULT 'GOOD',
  "inspection_status" varchar(64) NOT NULL DEFAULT 'CURRENT',
  "last_inspection_at" timestamptz,
  "next_inspection_at" timestamptz,
  "retirement_date" date,
  "status" varchar(64) NOT NULL DEFAULT 'AVAILABLE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_serials_tenant_asset_uidx"
  ON "industrial_supply_serials" ("tenant_id", "forge_asset_number") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_supply_serials_tenant_item_idx"
  ON "industrial_supply_serials" ("tenant_id", "item_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_serials_tenant_status_idx"
  ON "industrial_supply_serials" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_supply_serials_tenant_personnel_idx"
  ON "industrial_supply_serials" ("tenant_id", "assigned_personnel_id");

CREATE TABLE IF NOT EXISTS "industrial_supply_transactions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "lot_id" uuid REFERENCES "industrial_supply_lots"("id"),
  "serial_id" uuid REFERENCES "industrial_supply_serials"("id"),
  "transaction_type" varchar(64) NOT NULL,
  "quantity" numeric(14, 4) NOT NULL,
  "previous_quantity" numeric(14, 4),
  "new_quantity" numeric(14, 4),
  "source_location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "destination_location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "related_incident_id" uuid,
  "related_inspection_id" uuid,
  "related_request_id" uuid,
  "related_po_id" uuid,
  "related_transfer_id" uuid,
  "related_count_id" uuid,
  "unit_cost" numeric(14, 4),
  "reason" text,
  "performed_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_transactions_tenant_created_idx"
  ON "industrial_supply_transactions" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "industrial_supply_transactions_tenant_item_idx"
  ON "industrial_supply_transactions" ("tenant_id", "item_id", "created_at");
CREATE INDEX IF NOT EXISTS "industrial_supply_transactions_tenant_type_idx"
  ON "industrial_supply_transactions" ("tenant_id", "transaction_type");

CREATE TABLE IF NOT EXISTS "industrial_supply_transfers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "transfer_number" varchar(64) NOT NULL,
  "source_location_id" uuid NOT NULL REFERENCES "industrial_supply_locations"("id"),
  "destination_location_id" uuid NOT NULL REFERENCES "industrial_supply_locations"("id"),
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "notes" text,
  "created_by" uuid,
  "received_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_transfers_number_uidx"
  ON "industrial_supply_transfers" ("tenant_id", "transfer_number");
CREATE INDEX IF NOT EXISTS "industrial_supply_transfers_tenant_status_idx"
  ON "industrial_supply_transfers" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "industrial_supply_transfer_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "transfer_id" uuid NOT NULL REFERENCES "industrial_supply_transfers"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "lot_id" uuid REFERENCES "industrial_supply_lots"("id"),
  "serial_id" uuid REFERENCES "industrial_supply_serials"("id"),
  "quantity" numeric(14, 4) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_transfer_items_transfer_idx"
  ON "industrial_supply_transfer_items" ("tenant_id", "transfer_id");

-- ========== S4 PPE ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_employee_assignments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "personnel_id" uuid NOT NULL REFERENCES "industrial_personnel"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "serial_id" uuid REFERENCES "industrial_supply_serials"("id"),
  "lot_id" uuid REFERENCES "industrial_supply_lots"("id"),
  "quantity" numeric(14, 4) NOT NULL DEFAULT 1,
  "size_label" varchar(64),
  "issue_date" date NOT NULL DEFAULT CURRENT_DATE,
  "issued_by" uuid,
  "condition" varchar(64) NOT NULL DEFAULT 'GOOD',
  "replacement_due_date" date,
  "expected_return_date" date,
  "returned_at" timestamptz,
  "return_condition" varchar(64),
  "return_disposition" varchar(64),
  "employee_acknowledged_at" timestamptz,
  "notes" text,
  "status" varchar(64) NOT NULL DEFAULT 'ASSIGNED',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_employee_assignments_personnel_idx"
  ON "industrial_supply_employee_assignments" ("tenant_id", "personnel_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_supply_employee_assignments_item_idx"
  ON "industrial_supply_employee_assignments" ("tenant_id", "item_id");

-- ========== S5 Counts ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_counts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "count_number" varchar(64) NOT NULL,
  "count_type" varchar(64) NOT NULL DEFAULT 'CYCLE',
  "location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "category_id" uuid REFERENCES "industrial_supply_categories"("id"),
  "blind" boolean NOT NULL DEFAULT false,
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "notes" text,
  "created_by" uuid,
  "submitted_by" uuid,
  "approved_by" uuid,
  "submitted_at" timestamptz,
  "approved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_counts_number_uidx"
  ON "industrial_supply_counts" ("tenant_id", "count_number");
CREATE INDEX IF NOT EXISTS "industrial_supply_counts_tenant_status_idx"
  ON "industrial_supply_counts" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "industrial_supply_count_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "count_id" uuid NOT NULL REFERENCES "industrial_supply_counts"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "location_id" uuid NOT NULL REFERENCES "industrial_supply_locations"("id"),
  "expected_quantity" numeric(14, 4) NOT NULL DEFAULT 0,
  "actual_quantity" numeric(14, 4),
  "variance" numeric(14, 4),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_count_items_count_idx"
  ON "industrial_supply_count_items" ("tenant_id", "count_id");

-- ========== S6 Inspections / Recalls ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_inspections" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "serial_id" uuid REFERENCES "industrial_supply_serials"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "inspection_type" varchar(64) NOT NULL DEFAULT 'PERIODIC',
  "inspector_user_id" uuid,
  "inspector_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "inspection_date" date NOT NULL DEFAULT CURRENT_DATE,
  "condition" varchar(64),
  "result" varchar(32) NOT NULL DEFAULT 'PASS',
  "deficiencies" text,
  "corrective_action" text,
  "next_inspection_date" date,
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_inspections_tenant_serial_idx"
  ON "industrial_supply_inspections" ("tenant_id", "serial_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_inspections_tenant_date_idx"
  ON "industrial_supply_inspections" ("tenant_id", "inspection_date");

CREATE TABLE IF NOT EXISTS "industrial_supply_recall_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" varchar(300) NOT NULL,
  "manufacturer" varchar(200),
  "product_name" varchar(300),
  "model" varchar(120),
  "serial_number_from" varchar(120),
  "serial_number_to" varchar(120),
  "lot_number" varchar(120),
  "item_id" uuid REFERENCES "industrial_supply_items"("id"),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "notes" text,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_supply_recall_events_tenant_status_idx"
  ON "industrial_supply_recall_events" ("tenant_id", "status");

-- ========== S7 Requests ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_requests" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_number" varchar(64) NOT NULL,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "needed_by" date,
  "reason" text,
  "notes" text,
  "status" varchar(64) NOT NULL DEFAULT 'SUBMITTED',
  "approved_by" uuid,
  "approved_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_requests_number_uidx"
  ON "industrial_supply_requests" ("tenant_id", "request_number");
CREATE INDEX IF NOT EXISTS "industrial_supply_requests_tenant_status_idx"
  ON "industrial_supply_requests" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "industrial_supply_request_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_id" uuid NOT NULL REFERENCES "industrial_supply_requests"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "quantity_requested" numeric(14, 4) NOT NULL,
  "quantity_reserved" numeric(14, 4) NOT NULL DEFAULT 0,
  "quantity_issued" numeric(14, 4) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_request_items_request_idx"
  ON "industrial_supply_request_items" ("tenant_id", "request_id");

-- ========== S8 Purchasing ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_vendors" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vendor_number" varchar(64) NOT NULL,
  "name" varchar(300) NOT NULL,
  "account_number" varchar(120),
  "address" text,
  "sales_rep_name" varchar(200),
  "phone" varchar(64),
  "email" varchar(320),
  "website" varchar(500),
  "payment_terms" varchar(120),
  "shipping_terms" varchar(120),
  "notes" text,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_vendors_number_uidx"
  ON "industrial_supply_vendors" ("tenant_id", "vendor_number") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_supply_vendors_tenant_name_idx"
  ON "industrial_supply_vendors" ("tenant_id", "name");

CREATE TABLE IF NOT EXISTS "industrial_supply_vendor_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vendor_id" uuid NOT NULL REFERENCES "industrial_supply_vendors"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "vendor_part_number" varchar(120),
  "package_size" varchar(64),
  "unit_price" numeric(14, 4),
  "contract_price" numeric(14, 4),
  "minimum_order" numeric(14, 4),
  "lead_time_days" integer NOT NULL DEFAULT 0,
  "last_purchase_date" date,
  "preferred" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_vendor_items_uidx"
  ON "industrial_supply_vendor_items" ("tenant_id", "vendor_id", "item_id")
  WHERE "archived_at" IS NULL;

CREATE TABLE IF NOT EXISTS "industrial_supply_purchase_requests" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "request_number" varchar(64) NOT NULL,
  "requester_user_id" uuid,
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "preferred_vendor_id" uuid REFERENCES "industrial_supply_vendors"("id"),
  "needed_date" date,
  "justification" text,
  "estimated_total" numeric(14, 2),
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "approved_by" uuid,
  "approved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_purchase_requests_number_uidx"
  ON "industrial_supply_purchase_requests" ("tenant_id", "request_number");

CREATE TABLE IF NOT EXISTS "industrial_supply_purchase_request_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_request_id" uuid NOT NULL REFERENCES "industrial_supply_purchase_requests"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "quantity" numeric(14, 4) NOT NULL,
  "estimated_unit_price" numeric(14, 4),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "industrial_supply_purchase_orders" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "po_number" varchar(64) NOT NULL,
  "vendor_id" uuid NOT NULL REFERENCES "industrial_supply_vendors"("id"),
  "order_date" date NOT NULL DEFAULT CURRENT_DATE,
  "requested_by" uuid,
  "approved_by" uuid,
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "ship_to_location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "subtotal" numeric(14, 2) NOT NULL DEFAULT 0,
  "tax_amount" numeric(14, 2) NOT NULL DEFAULT 0,
  "shipping_amount" numeric(14, 2) NOT NULL DEFAULT 0,
  "total" numeric(14, 2) NOT NULL DEFAULT 0,
  "expected_delivery" date,
  "notes" text,
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_purchase_orders_number_uidx"
  ON "industrial_supply_purchase_orders" ("tenant_id", "po_number");
CREATE INDEX IF NOT EXISTS "industrial_supply_purchase_orders_tenant_status_idx"
  ON "industrial_supply_purchase_orders" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "industrial_supply_purchase_order_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "purchase_order_id" uuid NOT NULL REFERENCES "industrial_supply_purchase_orders"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "quantity_ordered" numeric(14, 4) NOT NULL,
  "quantity_received" numeric(14, 4) NOT NULL DEFAULT 0,
  "unit_price" numeric(14, 4) NOT NULL DEFAULT 0,
  "line_total" numeric(14, 2) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_purchase_order_items_po_idx"
  ON "industrial_supply_purchase_order_items" ("tenant_id", "purchase_order_id");

CREATE TABLE IF NOT EXISTS "industrial_supply_receipts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "receipt_number" varchar(64) NOT NULL,
  "purchase_order_id" uuid REFERENCES "industrial_supply_purchase_orders"("id"),
  "location_id" uuid NOT NULL REFERENCES "industrial_supply_locations"("id"),
  "received_by" uuid,
  "source" varchar(200),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_receipts_number_uidx"
  ON "industrial_supply_receipts" ("tenant_id", "receipt_number");

-- ========== S9 Reorder ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_reorder_rules" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "minimum_quantity" numeric(14, 4) NOT NULL DEFAULT 0,
  "maximum_quantity" numeric(14, 4),
  "reorder_point" numeric(14, 4) NOT NULL DEFAULT 0,
  "reorder_quantity" numeric(14, 4) NOT NULL DEFAULT 0,
  "preferred_vendor_id" uuid REFERENCES "industrial_supply_vendors"("id"),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_reorder_rules_item_idx"
  ON "industrial_supply_reorder_rules" ("tenant_id", "item_id");

-- ========== S10 Kits ==========
CREATE TABLE IF NOT EXISTS "industrial_supply_kits" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "kit_number" varchar(64) NOT NULL,
  "name" varchar(300) NOT NULL,
  "kit_type" varchar(64) NOT NULL DEFAULT 'FIRST_AID',
  "location_id" uuid REFERENCES "industrial_supply_locations"("id"),
  "status" varchar(64) NOT NULL DEFAULT 'READY',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_kits_number_uidx"
  ON "industrial_supply_kits" ("tenant_id", "kit_number") WHERE "archived_at" IS NULL;

CREATE TABLE IF NOT EXISTS "industrial_supply_kit_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "kit_id" uuid NOT NULL REFERENCES "industrial_supply_kits"("id"),
  "item_id" uuid NOT NULL REFERENCES "industrial_supply_items"("id"),
  "variant_id" uuid REFERENCES "industrial_supply_item_variants"("id"),
  "expected_quantity" numeric(14, 4) NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_kit_items_kit_idx"
  ON "industrial_supply_kit_items" ("tenant_id", "kit_id");

-- Add FKs deferred from items
ALTER TABLE "industrial_supply_items"
  DROP CONSTRAINT IF EXISTS "industrial_supply_items_primary_vendor_fk";
ALTER TABLE "industrial_supply_items"
  ADD CONSTRAINT "industrial_supply_items_primary_vendor_fk"
  FOREIGN KEY ("primary_vendor_id") REFERENCES "industrial_supply_vendors"("id");
ALTER TABLE "industrial_supply_items"
  DROP CONSTRAINT IF EXISTS "industrial_supply_items_primary_location_fk";
ALTER TABLE "industrial_supply_items"
  ADD CONSTRAINT "industrial_supply_items_primary_location_fk"
  FOREIGN KEY ("primary_location_id") REFERENCES "industrial_supply_locations"("id");

-- Grants + RLS helper
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'industrial_supply_items',
    'industrial_supply_item_variants',
    'industrial_supply_locations',
    'industrial_supply_location_inventory',
    'industrial_supply_lots',
    'industrial_supply_serials',
    'industrial_supply_transactions',
    'industrial_supply_transfers',
    'industrial_supply_transfer_items',
    'industrial_supply_employee_assignments',
    'industrial_supply_counts',
    'industrial_supply_count_items',
    'industrial_supply_inspections',
    'industrial_supply_recall_events',
    'industrial_supply_requests',
    'industrial_supply_request_items',
    'industrial_supply_vendors',
    'industrial_supply_vendor_items',
    'industrial_supply_purchase_requests',
    'industrial_supply_purchase_request_items',
    'industrial_supply_purchase_orders',
    'industrial_supply_purchase_order_items',
    'industrial_supply_receipts',
    'industrial_supply_reorder_rules',
    'industrial_supply_kits',
    'industrial_supply_kit_items'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO forge_app', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t || '_tenant_isolation', t
    );
  END LOOP;
END $$;
