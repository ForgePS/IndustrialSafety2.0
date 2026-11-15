-- INDUSTRIAL SAFETY SUPPLIES S0: foundation tables for inventory module.
-- Settings, categories, and immutable domain audit log. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_supply_settings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "allow_negative_inventory" boolean NOT NULL DEFAULT false,
  "require_adjustment_approval" boolean NOT NULL DEFAULT false,
  "require_blind_inventory_count" boolean NOT NULL DEFAULT false,
  "enable_inventory_costing" boolean NOT NULL DEFAULT true,
  "default_low_stock_threshold" integer NOT NULL DEFAULT 0,
  "require_employee_acknowledgment" boolean NOT NULL DEFAULT true,
  "require_return_condition" boolean NOT NULL DEFAULT true,
  "allow_ppe_issue_override" boolean NOT NULL DEFAULT false,
  "require_training_verification" boolean NOT NULL DEFAULT true,
  "enable_purchase_requests" boolean NOT NULL DEFAULT true,
  "enable_purchase_orders" boolean NOT NULL DEFAULT true,
  "require_po_approval" boolean NOT NULL DEFAULT true,
  "purchase_approval_threshold" numeric(14, 2),
  "default_label_type" varchar(64) NOT NULL DEFAULT 'SMALL_INVENTORY',
  "default_printer" varchar(120),
  "auto_create_qr_on_item_create" boolean NOT NULL DEFAULT true,
  "expiration_warning_days" jsonb NOT NULL DEFAULT '[180, 90, 60, 30, 14, 7]'::jsonb,
  "notification_settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_settings_tenant_uidx"
  ON "industrial_supply_settings" ("tenant_id");

CREATE TABLE IF NOT EXISTS "industrial_supply_categories" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "parent_id" uuid REFERENCES "industrial_supply_categories"("id"),
  "code" varchar(64) NOT NULL,
  "name" varchar(300) NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_system" boolean NOT NULL DEFAULT false,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_supply_categories_tenant_code_uidx"
  ON "industrial_supply_categories" ("tenant_id", "code")
  WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_supply_categories_tenant_parent_idx"
  ON "industrial_supply_categories" ("tenant_id", "parent_id");
CREATE INDEX IF NOT EXISTS "industrial_supply_categories_tenant_status_idx"
  ON "industrial_supply_categories" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "industrial_supply_audit_log" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "actor_user_id" uuid,
  "action" varchar(64) NOT NULL,
  "resource_type" varchar(64) NOT NULL,
  "resource_id" uuid,
  "previous_value" jsonb,
  "new_value" jsonb,
  "reason" text,
  "ip_address" varchar(64),
  "session_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_supply_audit_log_tenant_created_idx"
  ON "industrial_supply_audit_log" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "industrial_supply_audit_log_tenant_resource_idx"
  ON "industrial_supply_audit_log" ("tenant_id", "resource_type", "resource_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_supply_settings" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_supply_categories" TO forge_app;
GRANT SELECT, INSERT ON "industrial_supply_audit_log" TO forge_app;

ALTER TABLE "industrial_supply_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_supply_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_supply_settings_tenant_isolation" ON "industrial_supply_settings";
CREATE POLICY "industrial_supply_settings_tenant_isolation" ON "industrial_supply_settings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_supply_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_supply_categories" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_supply_categories_tenant_isolation" ON "industrial_supply_categories";
CREATE POLICY "industrial_supply_categories_tenant_isolation" ON "industrial_supply_categories"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_supply_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_supply_audit_log" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_supply_audit_log_tenant_isolation" ON "industrial_supply_audit_log";
CREATE POLICY "industrial_supply_audit_log_tenant_isolation" ON "industrial_supply_audit_log"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
