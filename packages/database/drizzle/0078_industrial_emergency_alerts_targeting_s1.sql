-- Emergency Alerts S1: location / department / group targeting.

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_groups" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(200) NOT NULL,
  "description" text,
  "group_type" varchar(32) NOT NULL DEFAULT 'STATIC',
  "location_id" uuid,
  "department_id" uuid,
  "dynamic" boolean NOT NULL DEFAULT false,
  "rule_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "expires_at" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_groups_tenant_idx"
  ON "industrial_emergency_alert_groups" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_groups_tenant_name_idx"
  ON "industrial_emergency_alert_groups" ("tenant_id", "name");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_group_members" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "group_id" uuid NOT NULL REFERENCES "industrial_emergency_alert_groups"("id") ON DELETE CASCADE,
  "personnel_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alert_group_members_uidx"
  ON "industrial_emergency_alert_group_members" ("group_id", "personnel_id");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_group_members_tenant_idx"
  ON "industrial_emergency_alert_group_members" ("tenant_id", "group_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_groups" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_group_members" TO forge_app;

ALTER TABLE "industrial_emergency_alert_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_groups_tenant_isolation" ON "industrial_emergency_alert_groups";
CREATE POLICY "industrial_emergency_alert_groups_tenant_isolation" ON "industrial_emergency_alert_groups"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_group_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_group_members_tenant_isolation" ON "industrial_emergency_alert_group_members";
CREATE POLICY "industrial_emergency_alert_group_members_tenant_isolation" ON "industrial_emergency_alert_group_members"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
