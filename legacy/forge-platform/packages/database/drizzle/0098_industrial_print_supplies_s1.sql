-- 0098_industrial_print_supplies_s1
-- Print Manager Phase 7: printer supply tracking (labels/ribbon/etc.).

CREATE TABLE IF NOT EXISTS "industrial_print_supplies" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "printer_id" uuid REFERENCES "industrial_printers"("id") ON DELETE SET NULL,
  "supply_type" varchar(64) NOT NULL DEFAULT 'LABELS',
  "name" varchar(200) NOT NULL,
  "sku" varchar(120),
  "unit" varchar(64) NOT NULL DEFAULT 'labels',
  "starting_quantity" integer NOT NULL DEFAULT 0,
  "estimated_remaining" integer NOT NULL DEFAULT 0,
  "units_consumed" integer NOT NULL DEFAULT 0,
  "warning_threshold" integer NOT NULL DEFAULT 50,
  "critical_threshold" integer NOT NULL DEFAULT 15,
  "last_replaced_at" timestamptz,
  "last_alert_level" varchar(32) NOT NULL DEFAULT 'NONE',
  "alert_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_print_supplies_tenant_idx"
  ON "industrial_print_supplies" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "industrial_print_supplies_printer_idx"
  ON "industrial_print_supplies" ("tenant_id", "printer_id");
CREATE INDEX IF NOT EXISTS "industrial_print_supplies_type_idx"
  ON "industrial_print_supplies" ("tenant_id", "supply_type");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_print_supplies" TO forge_app;
ALTER TABLE "industrial_print_supplies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_print_supplies" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_print_supplies_tenant_isolation" ON "industrial_print_supplies";
CREATE POLICY "industrial_print_supplies_tenant_isolation" ON "industrial_print_supplies"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
