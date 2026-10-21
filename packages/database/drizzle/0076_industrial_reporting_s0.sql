-- Industrial Reporting Engine (Pass 1–3 tables).

CREATE TABLE IF NOT EXISTS "report_definitions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "report_key" varchar(120),
  "name" varchar(200) NOT NULL,
  "description" text,
  "origin" varchar(32) NOT NULL DEFAULT 'saved',
  "category" varchar(80),
  "module_code" varchar(80),
  "report_type" varchar(32) NOT NULL DEFAULT 'standard',
  "source_key" varchar(120),
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "report_definitions_tenant_created_idx"
  ON "report_definitions" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "report_definitions_tenant_key_idx"
  ON "report_definitions" ("tenant_id", "report_key");
CREATE INDEX IF NOT EXISTS "report_definitions_tenant_origin_idx"
  ON "report_definitions" ("tenant_id", "origin");

CREATE TABLE IF NOT EXISTS "report_favorites" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "report_key" varchar(120),
  "report_definition_id" uuid REFERENCES "report_definitions"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "report_favorites_user_key_uidx"
  ON "report_favorites" ("tenant_id", "user_id", "report_key");
CREATE INDEX IF NOT EXISTS "report_favorites_tenant_user_idx"
  ON "report_favorites" ("tenant_id", "user_id");

CREATE TABLE IF NOT EXISTS "report_executions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "report_key" varchar(120) NOT NULL,
  "report_definition_id" uuid REFERENCES "report_definitions"("id"),
  "report_name" varchar(200) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'SUCCEEDED',
  "row_count" integer NOT NULL DEFAULT 0,
  "duration_ms" integer,
  "run_input_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "executed_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "report_executions_tenant_created_idx"
  ON "report_executions" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "report_executions_tenant_key_idx"
  ON "report_executions" ("tenant_id", "report_key");

CREATE TABLE IF NOT EXISTS "report_exports" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "execution_id" uuid REFERENCES "report_executions"("id"),
  "report_key" varchar(120) NOT NULL,
  "report_name" varchar(200) NOT NULL,
  "format" varchar(16) NOT NULL,
  "filename" varchar(240) NOT NULL,
  "content_type" varchar(120) NOT NULL,
  "byte_size" integer NOT NULL DEFAULT 0,
  "status" varchar(32) NOT NULL DEFAULT 'READY',
  "artifact_inline" text,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "report_exports_tenant_created_idx"
  ON "report_exports" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "report_schedules" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "report_definition_id" uuid NOT NULL REFERENCES "report_definitions"("id"),
  "name" varchar(200) NOT NULL,
  "cron_expression" varchar(120) NOT NULL,
  "timezone" varchar(64) NOT NULL DEFAULT 'UTC',
  "format" varchar(16) NOT NULL DEFAULT 'csv',
  "enabled" boolean NOT NULL DEFAULT true,
  "run_input_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_run_at" timestamptz,
  "next_run_at" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "report_schedules_tenant_enabled_idx"
  ON "report_schedules" ("tenant_id", "enabled");

CREATE TABLE IF NOT EXISTS "report_recipients" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "schedule_id" uuid NOT NULL REFERENCES "report_schedules"("id"),
  "email" varchar(320) NOT NULL,
  "name" varchar(200),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "report_recipients_schedule_idx"
  ON "report_recipients" ("schedule_id");

CREATE TABLE IF NOT EXISTS "report_shares" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "report_definition_id" uuid NOT NULL REFERENCES "report_definitions"("id"),
  "shared_with_user_id" uuid REFERENCES "users"("id"),
  "shared_with_role_id" uuid,
  "permission" varchar(32) NOT NULL DEFAULT 'view',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "report_shares_tenant_def_idx"
  ON "report_shares" ("tenant_id", "report_definition_id");

ALTER TABLE "report_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_definitions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_definitions_tenant_isolation ON "report_definitions";
CREATE POLICY report_definitions_tenant_isolation ON "report_definitions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "report_favorites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_favorites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_favorites_tenant_isolation ON "report_favorites";
CREATE POLICY report_favorites_tenant_isolation ON "report_favorites"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "report_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_executions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_executions_tenant_isolation ON "report_executions";
CREATE POLICY report_executions_tenant_isolation ON "report_executions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "report_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_exports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_exports_tenant_isolation ON "report_exports";
CREATE POLICY report_exports_tenant_isolation ON "report_exports"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_schedules_tenant_isolation ON "report_schedules";
CREATE POLICY report_schedules_tenant_isolation ON "report_schedules"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "report_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_recipients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_recipients_tenant_isolation ON "report_recipients";
CREATE POLICY report_recipients_tenant_isolation ON "report_recipients"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "report_shares" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_shares" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_shares_tenant_isolation ON "report_shares";
CREATE POLICY report_shares_tenant_isolation ON "report_shares"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.reporting.view', 'View reporting', 'View Reporting Center overview and library', 'NORMAL', false),
  ('industrial.reporting.run', 'Run reports', 'Execute reports and view results', 'NORMAL', false),
  ('industrial.reporting.export', 'Export reports', 'Export reports to CSV, XLSX, or PDF', 'ELEVATED', false),
  ('industrial.reporting.manage', 'Manage reports', 'Create and edit saved report definitions', 'ELEVATED', false),
  ('industrial.reporting.view_sensitive', 'View sensitive report fields', 'Include sensitive columns in report results', 'CRITICAL', true),
  ('industrial.reporting.schedule', 'Schedule reports', 'Create and manage scheduled report delivery', 'ELEVATED', false),
  ('industrial.reporting.share', 'Share reports', 'Share saved reports with users or roles', 'ELEVATED', false),
  ('industrial.reporting.admin', 'Administer reporting', 'Full administration of the Reporting Engine', 'CRITICAL', true)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);
