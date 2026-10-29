-- 0097_industrial_print_routing_s1
-- Print Manager Phase 3: printer groups + routing rules.

CREATE TABLE IF NOT EXISTS "industrial_printer_groups" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(200) NOT NULL,
  "strategy" varchar(64) NOT NULL DEFAULT 'PRIMARY_FAILOVER',
  "location_id" uuid REFERENCES "industrial_sites"("id"),
  "division_id" uuid REFERENCES "industrial_departments"("id"),
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_printer_groups_tenant_idx"
  ON "industrial_printer_groups" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "industrial_printer_groups_location_idx"
  ON "industrial_printer_groups" ("tenant_id", "location_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_printer_groups" TO forge_app;
ALTER TABLE "industrial_printer_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_printer_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_printer_groups_tenant_isolation" ON "industrial_printer_groups";
CREATE POLICY "industrial_printer_groups_tenant_isolation" ON "industrial_printer_groups"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS "industrial_printer_group_members" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "group_id" uuid NOT NULL REFERENCES "industrial_printer_groups"("id") ON DELETE CASCADE,
  "printer_id" uuid NOT NULL REFERENCES "industrial_printers"("id") ON DELETE CASCADE,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_printer_group_members_uidx"
  ON "industrial_printer_group_members" ("group_id", "printer_id");
CREATE INDEX IF NOT EXISTS "industrial_printer_group_members_tenant_idx"
  ON "industrial_printer_group_members" ("tenant_id", "group_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_printer_group_members" TO forge_app;
ALTER TABLE "industrial_printer_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_printer_group_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_printer_group_members_tenant_isolation" ON "industrial_printer_group_members";
CREATE POLICY "industrial_printer_group_members_tenant_isolation" ON "industrial_printer_group_members"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS "industrial_print_routing_rules" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(200) NOT NULL,
  "priority" integer NOT NULL DEFAULT 100,
  "enabled" boolean NOT NULL DEFAULT true,
  "conditions_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "action_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_print_routing_rules_tenant_idx"
  ON "industrial_print_routing_rules" ("tenant_id", "enabled", "priority");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_print_routing_rules" TO forge_app;
ALTER TABLE "industrial_print_routing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_print_routing_rules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_print_routing_rules_tenant_isolation" ON "industrial_print_routing_rules";
CREATE POLICY "industrial_print_routing_rules_tenant_isolation" ON "industrial_print_routing_rules"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
