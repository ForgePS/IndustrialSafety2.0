-- INDUSTRIAL-DDL-S1: Forge Industrial domain persistence for tip migrations.
-- Additive only. Does not deploy to production in this sprint.
-- Aligns with live IND-11 attested tables + DM-S2 gap domains (LOTO/Fleet/WC/CA/QR/Scan/Attachments).
-- industrial_sites is the Industrial facility SoT (not tip SaaS facilities).


CREATE TABLE IF NOT EXISTS "industrial_sites" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(300) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "site_key" varchar(120),
  "timezone" varchar(64),
  "address_line_1" varchar(300),
  "address_line_2" varchar(300),
  "city" varchar(120),
  "state_province" varchar(120),
  "postal_code" varchar(32),
  "country_code" varchar(2),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sites_tenant_key_uidx"
  ON "industrial_sites" ("tenant_id", "site_key") WHERE "site_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "industrial_sites_tenant_status_idx"
  ON "industrial_sites" ("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sites_source_uidx"
  ON "industrial_sites" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sites" TO forge_app;
ALTER TABLE "industrial_sites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sites" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sites_tenant_isolation" ON "industrial_sites";
CREATE POLICY "industrial_sites_tenant_isolation" ON "industrial_sites"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_departments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "name" varchar(300) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_departments_tenant_site_idx"
  ON "industrial_departments" ("tenant_id", "site_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_departments_source_uidx"
  ON "industrial_departments" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_departments" TO forge_app;
ALTER TABLE "industrial_departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_departments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_departments_tenant_isolation" ON "industrial_departments";
CREATE POLICY "industrial_departments_tenant_isolation" ON "industrial_departments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_personnel" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "employee_number" varchar(120),
  "display_name" varchar(300) NOT NULL,
  "first_name" varchar(150),
  "last_name" varchar(150),
  "email" varchar(320),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "person_id" uuid,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_personnel_tenant_status_idx"
  ON "industrial_personnel" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_personnel_tenant_site_idx"
  ON "industrial_personnel" ("tenant_id", "site_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_personnel_source_uidx"
  ON "industrial_personnel" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_personnel" TO forge_app;
ALTER TABLE "industrial_personnel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_personnel" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_personnel_tenant_isolation" ON "industrial_personnel";
CREATE POLICY "industrial_personnel_tenant_isolation" ON "industrial_personnel"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_equipment" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "name" varchar(300) NOT NULL,
  "equipment_number" varchar(120),
  "equipment_type" varchar(120),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_equipment_tenant_status_idx"
  ON "industrial_equipment" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_equipment_tenant_site_idx"
  ON "industrial_equipment" ("tenant_id", "site_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_equipment_source_uidx"
  ON "industrial_equipment" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_equipment" TO forge_app;
ALTER TABLE "industrial_equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_equipment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_equipment_tenant_isolation" ON "industrial_equipment";
CREATE POLICY "industrial_equipment_tenant_isolation" ON "industrial_equipment"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_libraries" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "kind" varchar(64) NOT NULL,
  "short_name" varchar(200),
  "text" text,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "usage_count" integer NOT NULL DEFAULT 0,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_libraries_tenant_kind_idx"
  ON "industrial_loto_libraries" ("tenant_id", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_loto_libraries_source_uidx"
  ON "industrial_loto_libraries" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_libraries" TO forge_app;
ALTER TABLE "industrial_loto_libraries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_libraries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_libraries_tenant_isolation" ON "industrial_loto_libraries";
CREATE POLICY "industrial_loto_libraries_tenant_isolation" ON "industrial_loto_libraries"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_procedures" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "equipment_id" uuid REFERENCES "industrial_equipment"("id"),
  "title" varchar(500) NOT NULL,
  "procedure_number" varchar(120),
  "revision" varchar(64),
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "scope" text,
  "notes" text,
  "is_current_version" boolean NOT NULL DEFAULT true,
  "parent_procedure_id" uuid REFERENCES "industrial_loto_procedures"("id"),
  "effective_at" timestamptz,
  "approved_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_procedures_tenant_status_idx"
  ON "industrial_loto_procedures" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_loto_procedures_tenant_site_idx"
  ON "industrial_loto_procedures" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_loto_procedures_equipment_idx"
  ON "industrial_loto_procedures" ("tenant_id", "equipment_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_loto_procedures_source_uidx"
  ON "industrial_loto_procedures" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_procedures" TO forge_app;
ALTER TABLE "industrial_loto_procedures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_procedures" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_procedures_tenant_isolation" ON "industrial_loto_procedures";
CREATE POLICY "industrial_loto_procedures_tenant_isolation" ON "industrial_loto_procedures"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_energy_sources" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL REFERENCES "industrial_loto_procedures"("id") ON DELETE CASCADE,
  "energy_type" varchar(120) NOT NULL,
  "description" text,
  "magnitude" varchar(120),
  "sort_order" integer NOT NULL DEFAULT 0,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_energy_sources_proc_idx"
  ON "industrial_loto_energy_sources" ("tenant_id", "procedure_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_energy_sources" TO forge_app;
ALTER TABLE "industrial_loto_energy_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_energy_sources" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_energy_sources_tenant_isolation" ON "industrial_loto_energy_sources";
CREATE POLICY "industrial_loto_energy_sources_tenant_isolation" ON "industrial_loto_energy_sources"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_isolation_points" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL REFERENCES "industrial_loto_procedures"("id") ON DELETE CASCADE,
  "energy_source_id" uuid REFERENCES "industrial_loto_energy_sources"("id") ON DELETE SET NULL,
  "label" varchar(300) NOT NULL,
  "location_description" text,
  "isolation_method" varchar(200),
  "sort_order" integer NOT NULL DEFAULT 0,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_isolation_points_proc_idx"
  ON "industrial_loto_isolation_points" ("tenant_id", "procedure_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_isolation_points" TO forge_app;
ALTER TABLE "industrial_loto_isolation_points" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_isolation_points" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_isolation_points_tenant_isolation" ON "industrial_loto_isolation_points";
CREATE POLICY "industrial_loto_isolation_points_tenant_isolation" ON "industrial_loto_isolation_points"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_steps" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL REFERENCES "industrial_loto_procedures"("id") ON DELETE CASCADE,
  "step_phase" varchar(32) NOT NULL,
  "step_number" integer NOT NULL DEFAULT 1,
  "instruction" text NOT NULL,
  "isolation_point_id" uuid REFERENCES "industrial_loto_isolation_points"("id") ON DELETE SET NULL,
  "library_item_id" uuid REFERENCES "industrial_loto_libraries"("id") ON DELETE SET NULL,
  "is_verification" boolean NOT NULL DEFAULT false,
  CONSTRAINT "industrial_loto_steps_phase_check"
    CHECK ("step_phase" IN ('SHUTDOWN', 'ISOLATION', 'VERIFICATION', 'RESTART', 'OTHER')),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_steps_proc_phase_idx"
  ON "industrial_loto_steps" ("tenant_id", "procedure_id", "step_phase", "step_number");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_steps" TO forge_app;
ALTER TABLE "industrial_loto_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_steps" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_steps_tenant_isolation" ON "industrial_loto_steps";
CREATE POLICY "industrial_loto_steps_tenant_isolation" ON "industrial_loto_steps"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_procedure_revisions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "procedure_id" uuid NOT NULL REFERENCES "industrial_loto_procedures"("id") ON DELETE CASCADE,
  "revision" varchar(64) NOT NULL,
  "snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "changed_summary" text,
  "created_by_user_id" uuid,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_proc_revisions_proc_idx"
  ON "industrial_loto_procedure_revisions" ("tenant_id", "procedure_id", "created_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_procedure_revisions" TO forge_app;
ALTER TABLE "industrial_loto_procedure_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_procedure_revisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_procedure_revisions_tenant_isolation" ON "industrial_loto_procedure_revisions";
CREATE POLICY "industrial_loto_procedure_revisions_tenant_isolation" ON "industrial_loto_procedure_revisions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_loto_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "procedure_id" uuid REFERENCES "industrial_loto_procedures"("id"),
  "equipment_id" uuid REFERENCES "industrial_equipment"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "category" varchar(120),
  "lock_tag_id" varchar(120),
  "event_date" date,
  "due_date" date,
  "worker_name" varchar(300),
  "reported_by" varchar(300),
  "notes" text,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_loto_records_tenant_status_idx"
  ON "industrial_loto_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_loto_records_due_idx"
  ON "industrial_loto_records" ("tenant_id", "due_date");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_loto_records_source_uidx"
  ON "industrial_loto_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_loto_records" TO forge_app;
ALTER TABLE "industrial_loto_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_loto_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_loto_records_tenant_isolation" ON "industrial_loto_records";
CREATE POLICY "industrial_loto_records_tenant_isolation" ON "industrial_loto_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_corrective_actions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "parent_entity_type" varchar(64) NOT NULL,
  "parent_entity_id" uuid,
  "title" varchar(500) NOT NULL,
  "description" text,
  "finding" text,
  "required_action" text,
  "priority" varchar(32),
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "assigned_user_id" uuid,
  "assigned_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "owner_name" varchar(300),
  "due_date" date,
  "completed_at" timestamptz,
  "verified_at" timestamptz,
  "evidence_notes" text,
  "risk_level" varchar(64),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_corrective_actions_tenant_status_idx"
  ON "industrial_corrective_actions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_corrective_actions_due_idx"
  ON "industrial_corrective_actions" ("tenant_id", "due_date");
CREATE INDEX IF NOT EXISTS "industrial_corrective_actions_parent_idx"
  ON "industrial_corrective_actions" ("tenant_id", "parent_entity_type", "parent_entity_id");
CREATE INDEX IF NOT EXISTS "industrial_corrective_actions_assignee_idx"
  ON "industrial_corrective_actions" ("tenant_id", "assigned_personnel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_corrective_actions_source_uidx"
  ON "industrial_corrective_actions" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_corrective_actions" TO forge_app;
ALTER TABLE "industrial_corrective_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_corrective_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_corrective_actions_tenant_isolation" ON "industrial_corrective_actions";
CREATE POLICY "industrial_corrective_actions_tenant_isolation" ON "industrial_corrective_actions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_incidents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "severity" varchar(64),
  "occurred_at" timestamptz,
  "reported_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_incidents_tenant_status_idx" ON "industrial_incidents" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_incidents_tenant_site_idx" ON "industrial_incidents" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_incidents_tenant_updated_idx" ON "industrial_incidents" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_incidents_source_uidx"
  ON "industrial_incidents" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_incidents" TO forge_app;
ALTER TABLE "industrial_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_incidents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_incidents_tenant_isolation" ON "industrial_incidents";
CREATE POLICY "industrial_incidents_tenant_isolation" ON "industrial_incidents"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_inspections" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "template_id" uuid,
  "inspection_type" varchar(120),
  "completed_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_inspections_tenant_status_idx" ON "industrial_inspections" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_inspections_tenant_site_idx" ON "industrial_inspections" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_inspections_tenant_updated_idx" ON "industrial_inspections" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_inspections_source_uidx"
  ON "industrial_inspections" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_inspections" TO forge_app;
ALTER TABLE "industrial_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_inspections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_inspections_tenant_isolation" ON "industrial_inspections";
CREATE POLICY "industrial_inspections_tenant_isolation" ON "industrial_inspections"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_observations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "observation_type" varchar(120),
  "observed_at" timestamptz,
  "observer_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_observations_tenant_status_idx" ON "industrial_observations" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_observations_tenant_site_idx" ON "industrial_observations" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_observations_tenant_updated_idx" ON "industrial_observations" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_observations_source_uidx"
  ON "industrial_observations" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_observations" TO forge_app;
ALTER TABLE "industrial_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_observations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_observations_tenant_isolation" ON "industrial_observations";
CREATE POLICY "industrial_observations_tenant_isolation" ON "industrial_observations"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_jsas" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "job_title" varchar(300),
  "approved_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_jsas_tenant_status_idx" ON "industrial_jsas" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_jsas_tenant_site_idx" ON "industrial_jsas" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_jsas_tenant_updated_idx" ON "industrial_jsas" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_jsas_source_uidx"
  ON "industrial_jsas" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_jsas" TO forge_app;
ALTER TABLE "industrial_jsas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_jsas" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_jsas_tenant_isolation" ON "industrial_jsas";
CREATE POLICY "industrial_jsas_tenant_isolation" ON "industrial_jsas"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_form_definitions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "form_key" varchar(120),
  "version" varchar(64),
  "schema_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_form_definitions_tenant_status_idx" ON "industrial_form_definitions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_form_definitions_tenant_site_idx" ON "industrial_form_definitions" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_form_definitions_tenant_updated_idx" ON "industrial_form_definitions" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_form_definitions_source_uidx"
  ON "industrial_form_definitions" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_form_definitions" TO forge_app;
ALTER TABLE "industrial_form_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_form_definitions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_form_definitions_tenant_isolation" ON "industrial_form_definitions";
CREATE POLICY "industrial_form_definitions_tenant_isolation" ON "industrial_form_definitions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_form_submissions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "form_definition_id" uuid REFERENCES "industrial_form_definitions"("id"),
  "submitted_at" timestamptz,
  "answers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_form_submissions_tenant_status_idx" ON "industrial_form_submissions" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_form_submissions_tenant_site_idx" ON "industrial_form_submissions" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_form_submissions_tenant_updated_idx" ON "industrial_form_submissions" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_form_submissions_source_uidx"
  ON "industrial_form_submissions" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_form_submissions" TO forge_app;
ALTER TABLE "industrial_form_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_form_submissions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_form_submissions_tenant_isolation" ON "industrial_form_submissions";
CREATE POLICY "industrial_form_submissions_tenant_isolation" ON "industrial_form_submissions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "course_name" varchar(300),
  "completed_at" timestamptz,
  "expires_at" timestamptz,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_records_tenant_status_idx" ON "industrial_training_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_training_records_tenant_site_idx" ON "industrial_training_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_training_records_tenant_updated_idx" ON "industrial_training_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_records_source_uidx"
  ON "industrial_training_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_records" TO forge_app;
ALTER TABLE "industrial_training_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_records_tenant_isolation" ON "industrial_training_records";
CREATE POLICY "industrial_training_records_tenant_isolation" ON "industrial_training_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_certificate_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "template_key" varchar(120),
  "template_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_certificate_templates_tenant_status_idx" ON "industrial_certificate_templates" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_certificate_templates_tenant_site_idx" ON "industrial_certificate_templates" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_certificate_templates_tenant_updated_idx" ON "industrial_certificate_templates" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_certificate_templates_source_uidx"
  ON "industrial_certificate_templates" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_certificate_templates" TO forge_app;
ALTER TABLE "industrial_certificate_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_certificate_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_certificate_templates_tenant_isolation" ON "industrial_certificate_templates";
CREATE POLICY "industrial_certificate_templates_tenant_isolation" ON "industrial_certificate_templates"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_tasks" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "assignee_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "due_date" date,
  "completed_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_tasks_tenant_status_idx" ON "industrial_tasks" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_tasks_tenant_site_idx" ON "industrial_tasks" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_tasks_tenant_updated_idx" ON "industrial_tasks" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_tasks_source_uidx"
  ON "industrial_tasks" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_tasks" TO forge_app;
ALTER TABLE "industrial_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_tasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_tasks_tenant_isolation" ON "industrial_tasks";
CREATE POLICY "industrial_tasks_tenant_isolation" ON "industrial_tasks"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_emergency_response_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "response_type" varchar(120),
  "activated_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_response_records_tenant_status_idx" ON "industrial_emergency_response_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_emergency_response_records_tenant_site_idx" ON "industrial_emergency_response_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_emergency_response_records_tenant_updated_idx" ON "industrial_emergency_response_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_response_records_source_uidx"
  ON "industrial_emergency_response_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_response_records" TO forge_app;
ALTER TABLE "industrial_emergency_response_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_response_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_response_records_tenant_isolation" ON "industrial_emergency_response_records";
CREATE POLICY "industrial_emergency_response_records_tenant_isolation" ON "industrial_emergency_response_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_chemical_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_chemical_safety_records_tenant_status_idx" ON "industrial_chemical_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_chemical_safety_records_tenant_site_idx" ON "industrial_chemical_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_chemical_safety_records_tenant_updated_idx" ON "industrial_chemical_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_chemical_safety_records_source_uidx"
  ON "industrial_chemical_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_chemical_safety_records" TO forge_app;
ALTER TABLE "industrial_chemical_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_chemical_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_chemical_safety_records_tenant_isolation" ON "industrial_chemical_safety_records";
CREATE POLICY "industrial_chemical_safety_records_tenant_isolation" ON "industrial_chemical_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_confined_space_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_confined_space_records_tenant_status_idx" ON "industrial_confined_space_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_confined_space_records_tenant_site_idx" ON "industrial_confined_space_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_confined_space_records_tenant_updated_idx" ON "industrial_confined_space_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_confined_space_records_source_uidx"
  ON "industrial_confined_space_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_confined_space_records" TO forge_app;
ALTER TABLE "industrial_confined_space_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_confined_space_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_confined_space_records_tenant_isolation" ON "industrial_confined_space_records";
CREATE POLICY "industrial_confined_space_records_tenant_isolation" ON "industrial_confined_space_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_hot_work_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_hot_work_records_tenant_status_idx" ON "industrial_hot_work_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_hot_work_records_tenant_site_idx" ON "industrial_hot_work_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_hot_work_records_tenant_updated_idx" ON "industrial_hot_work_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_hot_work_records_source_uidx"
  ON "industrial_hot_work_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_hot_work_records" TO forge_app;
ALTER TABLE "industrial_hot_work_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_hot_work_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_hot_work_records_tenant_isolation" ON "industrial_hot_work_records";
CREATE POLICY "industrial_hot_work_records_tenant_isolation" ON "industrial_hot_work_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_contractor_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_contractor_safety_records_tenant_status_idx" ON "industrial_contractor_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_contractor_safety_records_tenant_site_idx" ON "industrial_contractor_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_contractor_safety_records_tenant_updated_idx" ON "industrial_contractor_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_contractor_safety_records_source_uidx"
  ON "industrial_contractor_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_contractor_safety_records" TO forge_app;
ALTER TABLE "industrial_contractor_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_contractor_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_contractor_safety_records_tenant_isolation" ON "industrial_contractor_safety_records";
CREATE POLICY "industrial_contractor_safety_records_tenant_isolation" ON "industrial_contractor_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_cranes_rigging_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_cranes_rigging_records_tenant_status_idx" ON "industrial_cranes_rigging_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_cranes_rigging_records_tenant_site_idx" ON "industrial_cranes_rigging_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_cranes_rigging_records_tenant_updated_idx" ON "industrial_cranes_rigging_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_cranes_rigging_records_source_uidx"
  ON "industrial_cranes_rigging_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_cranes_rigging_records" TO forge_app;
ALTER TABLE "industrial_cranes_rigging_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_cranes_rigging_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_cranes_rigging_records_tenant_isolation" ON "industrial_cranes_rigging_records";
CREATE POLICY "industrial_cranes_rigging_records_tenant_isolation" ON "industrial_cranes_rigging_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_electrical_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_electrical_safety_records_tenant_status_idx" ON "industrial_electrical_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_electrical_safety_records_tenant_site_idx" ON "industrial_electrical_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_electrical_safety_records_tenant_updated_idx" ON "industrial_electrical_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_electrical_safety_records_source_uidx"
  ON "industrial_electrical_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_electrical_safety_records" TO forge_app;
ALTER TABLE "industrial_electrical_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_electrical_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_electrical_safety_records_tenant_isolation" ON "industrial_electrical_safety_records";
CREATE POLICY "industrial_electrical_safety_records_tenant_isolation" ON "industrial_electrical_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_environmental_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_environmental_safety_records_tenant_status_idx" ON "industrial_environmental_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_environmental_safety_records_tenant_site_idx" ON "industrial_environmental_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_environmental_safety_records_tenant_updated_idx" ON "industrial_environmental_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_environmental_safety_records_source_uidx"
  ON "industrial_environmental_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_environmental_safety_records" TO forge_app;
ALTER TABLE "industrial_environmental_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_environmental_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_environmental_safety_records_tenant_isolation" ON "industrial_environmental_safety_records";
CREATE POLICY "industrial_environmental_safety_records_tenant_isolation" ON "industrial_environmental_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_forklift_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_forklift_records_tenant_status_idx" ON "industrial_forklift_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_forklift_records_tenant_site_idx" ON "industrial_forklift_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_forklift_records_tenant_updated_idx" ON "industrial_forklift_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_forklift_records_source_uidx"
  ON "industrial_forklift_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_forklift_records" TO forge_app;
ALTER TABLE "industrial_forklift_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_forklift_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_forklift_records_tenant_isolation" ON "industrial_forklift_records";
CREATE POLICY "industrial_forklift_records_tenant_isolation" ON "industrial_forklift_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_machine_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_machine_safety_records_tenant_status_idx" ON "industrial_machine_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_machine_safety_records_tenant_site_idx" ON "industrial_machine_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_machine_safety_records_tenant_updated_idx" ON "industrial_machine_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_machine_safety_records_source_uidx"
  ON "industrial_machine_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_machine_safety_records" TO forge_app;
ALTER TABLE "industrial_machine_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_machine_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_machine_safety_records_tenant_isolation" ON "industrial_machine_safety_records";
CREATE POLICY "industrial_machine_safety_records_tenant_isolation" ON "industrial_machine_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_manufacturing_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_manufacturing_safety_records_tenant_status_idx" ON "industrial_manufacturing_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_manufacturing_safety_records_tenant_site_idx" ON "industrial_manufacturing_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_manufacturing_safety_records_tenant_updated_idx" ON "industrial_manufacturing_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_manufacturing_safety_records_source_uidx"
  ON "industrial_manufacturing_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_manufacturing_safety_records" TO forge_app;
ALTER TABLE "industrial_manufacturing_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_manufacturing_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_manufacturing_safety_records_tenant_isolation" ON "industrial_manufacturing_safety_records";
CREATE POLICY "industrial_manufacturing_safety_records_tenant_isolation" ON "industrial_manufacturing_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_process_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_process_safety_records_tenant_status_idx" ON "industrial_process_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_process_safety_records_tenant_site_idx" ON "industrial_process_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_process_safety_records_tenant_updated_idx" ON "industrial_process_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_process_safety_records_source_uidx"
  ON "industrial_process_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_process_safety_records" TO forge_app;
ALTER TABLE "industrial_process_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_process_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_process_safety_records_tenant_isolation" ON "industrial_process_safety_records";
CREATE POLICY "industrial_process_safety_records_tenant_isolation" ON "industrial_process_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_warehouse_safety_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_warehouse_safety_records_tenant_status_idx" ON "industrial_warehouse_safety_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_warehouse_safety_records_tenant_site_idx" ON "industrial_warehouse_safety_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_warehouse_safety_records_tenant_updated_idx" ON "industrial_warehouse_safety_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_warehouse_safety_records_source_uidx"
  ON "industrial_warehouse_safety_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_warehouse_safety_records" TO forge_app;
ALTER TABLE "industrial_warehouse_safety_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_warehouse_safety_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_warehouse_safety_records_tenant_isolation" ON "industrial_warehouse_safety_records";
CREATE POLICY "industrial_warehouse_safety_records_tenant_isolation" ON "industrial_warehouse_safety_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_working_at_heights_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_working_at_heights_records_tenant_status_idx" ON "industrial_working_at_heights_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_working_at_heights_records_tenant_site_idx" ON "industrial_working_at_heights_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_working_at_heights_records_tenant_updated_idx" ON "industrial_working_at_heights_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_working_at_heights_records_source_uidx"
  ON "industrial_working_at_heights_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_working_at_heights_records" TO forge_app;
ALTER TABLE "industrial_working_at_heights_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_working_at_heights_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_working_at_heights_records_tenant_isolation" ON "industrial_working_at_heights_records";
CREATE POLICY "industrial_working_at_heights_records_tenant_isolation" ON "industrial_working_at_heights_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_dot_compliance_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_dot_compliance_records_tenant_status_idx" ON "industrial_dot_compliance_records" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_dot_compliance_records_tenant_site_idx" ON "industrial_dot_compliance_records" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_dot_compliance_records_tenant_updated_idx" ON "industrial_dot_compliance_records" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_dot_compliance_records_source_uidx"
  ON "industrial_dot_compliance_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_dot_compliance_records" TO forge_app;
ALTER TABLE "industrial_dot_compliance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_dot_compliance_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_dot_compliance_records_tenant_isolation" ON "industrial_dot_compliance_records";
CREATE POLICY "industrial_dot_compliance_records_tenant_isolation" ON "industrial_dot_compliance_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_osha_cases" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "title" varchar(500),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "record_date" date,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_osha_cases_tenant_status_idx" ON "industrial_osha_cases" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_osha_cases_tenant_site_idx" ON "industrial_osha_cases" ("tenant_id", "site_id");
CREATE INDEX IF NOT EXISTS "industrial_osha_cases_tenant_updated_idx" ON "industrial_osha_cases" ("tenant_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_osha_cases_source_uidx"
  ON "industrial_osha_cases" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_osha_cases" TO forge_app;
ALTER TABLE "industrial_osha_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_osha_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_osha_cases_tenant_isolation" ON "industrial_osha_cases";
CREATE POLICY "industrial_osha_cases_tenant_isolation" ON "industrial_osha_cases"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_fleet_vehicles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "year" integer,
  "make" varchar(120),
  "model" varchar(120),
  "color" varchar(64),
  "vin" varchar(32),
  "license_plate" varchar(64),
  "renewal_date" date,
  "location_name" varchar(300),
  "assigned_driver_id" uuid,
  "county_assessed" varchar(120),
  "insured" boolean,
  "mileage" integer,
  "notes" text,
  "vehicle_fringe" boolean,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_fleet_vehicles_tenant_vin_uidx"
  ON "industrial_fleet_vehicles" ("tenant_id", "vin") WHERE "vin" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "industrial_fleet_vehicles_tenant_status_idx"
  ON "industrial_fleet_vehicles" ("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_fleet_vehicles_source_uidx"
  ON "industrial_fleet_vehicles" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_vehicles" TO forge_app;
ALTER TABLE "industrial_fleet_vehicles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_vehicles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_vehicles_tenant_isolation" ON "industrial_fleet_vehicles";
CREATE POLICY "industrial_fleet_vehicles_tenant_isolation" ON "industrial_fleet_vehicles"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_fleet_drivers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "personnel_name" varchar(300),
  "employee_number" varchar(120),
  "license_number" varchar(120),
  "license_state" varchar(32),
  "date_of_birth" date,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "initial_mvr_date" date,
  "last_mvr_date" date,
  "next_mvr_due_date" date,
  "insurance_effective_date" date,
  "insurance_removed_date" date,
  "notes" text,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_fleet_drivers_tenant_status_idx"
  ON "industrial_fleet_drivers" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_fleet_drivers_personnel_idx"
  ON "industrial_fleet_drivers" ("tenant_id", "personnel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_fleet_drivers_source_uidx"
  ON "industrial_fleet_drivers" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_drivers" TO forge_app;
ALTER TABLE "industrial_fleet_drivers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_drivers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_drivers_tenant_isolation" ON "industrial_fleet_drivers";
CREATE POLICY "industrial_fleet_drivers_tenant_isolation" ON "industrial_fleet_drivers"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_fleet_vehicles"
  DROP CONSTRAINT IF EXISTS "industrial_fleet_vehicles_assigned_driver_id_fkey";
ALTER TABLE "industrial_fleet_vehicles"
  ADD CONSTRAINT "industrial_fleet_vehicles_assigned_driver_id_fkey"
  FOREIGN KEY ("assigned_driver_id") REFERENCES "industrial_fleet_drivers"("id");

CREATE TABLE IF NOT EXISTS "industrial_fleet_driver_settings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "insurer_name" varchar(300),
  "insurer_email" text,
  "annual_sample_date" varchar(16),
  "last_sample_year" integer,
  "email_on_removal" boolean NOT NULL DEFAULT false,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_fleet_driver_settings_tenant_uidx"
  ON "industrial_fleet_driver_settings" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_driver_settings" TO forge_app;
ALTER TABLE "industrial_fleet_driver_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_driver_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_driver_settings_tenant_isolation" ON "industrial_fleet_driver_settings";
CREATE POLICY "industrial_fleet_driver_settings_tenant_isolation" ON "industrial_fleet_driver_settings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_cases" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "incident_id" uuid REFERENCES "industrial_incidents"("id"),
  "case_number" varchar(120),
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "severity" varchar(64),
  "workflow_stage" varchar(120),
  "reported_at" timestamptz,
  "days_away" integer,
  "restricted_days" integer,
  "claim_summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_wc_cases_tenant_status_idx"
  ON "industrial_workers_comp_cases" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_wc_cases_personnel_idx"
  ON "industrial_workers_comp_cases" ("tenant_id", "personnel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_wc_cases_source_uidx"
  ON "industrial_workers_comp_cases" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_workers_comp_cases" TO forge_app;
ALTER TABLE "industrial_workers_comp_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_cases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_workers_comp_cases_tenant_isolation" ON "industrial_workers_comp_cases";
CREATE POLICY "industrial_workers_comp_cases_tenant_isolation" ON "industrial_workers_comp_cases"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_carriers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(300) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "contact" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_wc_carriers_source_uidx"
  ON "industrial_workers_comp_carriers" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_workers_comp_carriers" TO forge_app;
ALTER TABLE "industrial_workers_comp_carriers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_carriers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_workers_comp_carriers_tenant_isolation" ON "industrial_workers_comp_carriers";
CREATE POLICY "industrial_workers_comp_carriers_tenant_isolation" ON "industrial_workers_comp_carriers"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_work_status_periods" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "industrial_workers_comp_cases"("id") ON DELETE CASCADE,
  "status" varchar(64) NOT NULL,
  "start_date" date,
  "end_date" date,
  "notes" text,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_wc_work_status_case_idx"
  ON "industrial_workers_comp_work_status_periods" ("tenant_id", "case_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_workers_comp_work_status_periods" TO forge_app;
ALTER TABLE "industrial_workers_comp_work_status_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_work_status_periods" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_workers_comp_work_status_periods_tenant_isolation" ON "industrial_workers_comp_work_status_periods";
CREATE POLICY "industrial_workers_comp_work_status_periods_tenant_isolation" ON "industrial_workers_comp_work_status_periods"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_restrictions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "industrial_workers_comp_cases"("id") ON DELETE CASCADE,
  "description" text,
  "start_date" date,
  "end_date" date,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_wc_restrictions_case_idx"
  ON "industrial_workers_comp_restrictions" ("tenant_id", "case_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_workers_comp_restrictions" TO forge_app;
ALTER TABLE "industrial_workers_comp_restrictions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_restrictions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_workers_comp_restrictions_tenant_isolation" ON "industrial_workers_comp_restrictions";
CREATE POLICY "industrial_workers_comp_restrictions_tenant_isolation" ON "industrial_workers_comp_restrictions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_workers_comp_medical_encounters" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "case_id" uuid NOT NULL REFERENCES "industrial_workers_comp_cases"("id") ON DELETE CASCADE,
  "appointment_date" date,
  "provider" varchar(300),
  "provider_specialty" varchar(200),
  "diagnosis" text,
  "treatment" text,
  "medication" text,
  "exam_findings" text,
  "assessment" text,
  "symptoms" text,
  "notes" text,
  "restricted_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_wc_medical_case_idx"
  ON "industrial_workers_comp_medical_encounters" ("tenant_id", "case_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_workers_comp_medical_encounters" TO forge_app;
ALTER TABLE "industrial_workers_comp_medical_encounters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_workers_comp_medical_encounters" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_workers_comp_medical_encounters_tenant_restricted" ON "industrial_workers_comp_medical_encounters";
CREATE POLICY "industrial_workers_comp_medical_encounters_tenant_restricted" ON "industrial_workers_comp_medical_encounters"
  USING (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND current_setting('app.industrial_wc_medical_access', true) = 'on'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    AND current_setting('app.industrial_wc_medical_access', true) = 'on'
  );

CREATE TABLE IF NOT EXISTS "qr_links" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "label" varchar(300),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "token_hash" varchar(128),
  "target_type" varchar(120),
  "target_id" uuid,
  "current_version_id" uuid,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "qr_links_tenant_status_idx" ON "qr_links" ("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "qr_links_source_uidx"
  ON "qr_links" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "qr_links" TO forge_app;
ALTER TABLE "qr_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qr_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qr_links_tenant_isolation" ON "qr_links";
CREATE POLICY "qr_links_tenant_isolation" ON "qr_links"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "qr_link_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "qr_link_id" uuid NOT NULL REFERENCES "qr_links"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL DEFAULT 1,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "qr_link_versions_link_idx"
  ON "qr_link_versions" ("tenant_id", "qr_link_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "qr_link_versions" TO forge_app;
ALTER TABLE "qr_link_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qr_link_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qr_link_versions_tenant_isolation" ON "qr_link_versions";
CREATE POLICY "qr_link_versions_tenant_isolation" ON "qr_link_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_scan_qr_codes" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "qr_code_id" varchar(120),
  "label_text" varchar(300),
  "qr_type" varchar(64),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "target_module" varchar(120),
  "target_type" varchar(120),
  "target_id" varchar(120),
  "target_name" varchar(300),
  "scan_url" text,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_scan_qr_codes_tenant_status_idx"
  ON "industrial_scan_qr_codes" ("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_scan_qr_codes_source_uidx"
  ON "industrial_scan_qr_codes" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_scan_qr_codes" TO forge_app;
ALTER TABLE "industrial_scan_qr_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_scan_qr_codes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_scan_qr_codes_tenant_isolation" ON "industrial_scan_qr_codes";
CREATE POLICY "industrial_scan_qr_codes_tenant_isolation" ON "industrial_scan_qr_codes"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_scan_assignments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "scan_qr_code_id" uuid REFERENCES "industrial_scan_qr_codes"("id") ON DELETE CASCADE,
  "assignment_type" varchar(64),
  "target_ref" varchar(200),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_scan_assignments" TO forge_app;
ALTER TABLE "industrial_scan_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_scan_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_scan_assignments_tenant_isolation" ON "industrial_scan_assignments";
CREATE POLICY "industrial_scan_assignments_tenant_isolation" ON "industrial_scan_assignments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_scan_check_schedules" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "scan_qr_code_id" uuid REFERENCES "industrial_scan_qr_codes"("id") ON DELETE CASCADE,
  "schedule_cron" varchar(120),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "next_due_at" timestamptz,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_scan_check_schedules" TO forge_app;
ALTER TABLE "industrial_scan_check_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_scan_check_schedules" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_scan_check_schedules_tenant_isolation" ON "industrial_scan_check_schedules";
CREATE POLICY "industrial_scan_check_schedules_tenant_isolation" ON "industrial_scan_check_schedules"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_qr_link_scan_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "qr_link_id" uuid REFERENCES "qr_links"("id") ON DELETE SET NULL,
  "version_id" uuid REFERENCES "qr_link_versions"("id") ON DELETE SET NULL,
  "scanned_at" timestamptz NOT NULL DEFAULT now(),
  "result" varchar(64),
  "response_status" integer,
  "anonymous" boolean NOT NULL DEFAULT false,
  "correlation_id" varchar(120),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_qr_scan_events_link_idx"
  ON "industrial_qr_link_scan_events" ("tenant_id", "qr_link_id", "scanned_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_qr_link_scan_events" TO forge_app;
ALTER TABLE "industrial_qr_link_scan_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_qr_link_scan_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_qr_link_scan_events_tenant_isolation" ON "industrial_qr_link_scan_events";
CREATE POLICY "industrial_qr_link_scan_events_tenant_isolation" ON "industrial_qr_link_scan_events"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_scan_audit_logs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "scan_qr_code_id" uuid REFERENCES "industrial_scan_qr_codes"("id") ON DELETE SET NULL,
  "event_type" varchar(64),
  "event_at" timestamptz NOT NULL DEFAULT now(),
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_scan_audit_logs" TO forge_app;
ALTER TABLE "industrial_scan_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_scan_audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_scan_audit_logs_tenant_isolation" ON "industrial_scan_audit_logs";
CREATE POLICY "industrial_scan_audit_logs_tenant_isolation" ON "industrial_scan_audit_logs"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "platform_documents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "name" varchar(300) NOT NULL,
  "description" text,
  "category" varchar(120),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "platform_documents_tenant_status_idx"
  ON "platform_documents" ("tenant_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_documents_source_uidx"
  ON "platform_documents" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_documents" TO forge_app;
ALTER TABLE "platform_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_documents_tenant_isolation" ON "platform_documents";
CREATE POLICY "platform_documents_tenant_isolation" ON "platform_documents"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "platform_document_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "platform_documents"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL DEFAULT 1,
  "filename" varchar(255),
  "content_type" varchar(200),
  "content_length" bigint NOT NULL DEFAULT 0,
  "storage_bucket" varchar(200),
  "storage_key" text NOT NULL,
  "checksum_sha256" varchar(64),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "platform_document_versions_doc_idx"
  ON "platform_document_versions" ("tenant_id", "document_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_document_versions" TO forge_app;
ALTER TABLE "platform_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_document_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_document_versions_tenant_isolation" ON "platform_document_versions";
CREATE POLICY "platform_document_versions_tenant_isolation" ON "platform_document_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_equipment_document_links" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "equipment_id" uuid NOT NULL REFERENCES "industrial_equipment"("id") ON DELETE CASCADE,
  "document_id" uuid NOT NULL REFERENCES "platform_documents"("id") ON DELETE CASCADE,
  "link_role" varchar(64),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_equipment_document_links_uidx"
  ON "industrial_equipment_document_links" ("tenant_id", "equipment_id", "document_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_equipment_document_links" TO forge_app;
ALTER TABLE "industrial_equipment_document_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_equipment_document_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_equipment_document_links_tenant_isolation" ON "industrial_equipment_document_links";
CREATE POLICY "industrial_equipment_document_links_tenant_isolation" ON "industrial_equipment_document_links"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_attachments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "entity_type" varchar(64) NOT NULL,
  "entity_id" uuid,
  "original_filename" varchar(255),
  "content_type" varchar(200),
  "size_bytes" bigint NOT NULL DEFAULT 0,
  "storage_bucket" varchar(200),
  "storage_key" text NOT NULL,
  "source_identity" varchar(512),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "checksum_sha256" varchar(64),
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_attachments_entity_idx"
  ON "industrial_attachments" ("tenant_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "industrial_attachments_storage_idx"
  ON "industrial_attachments" ("tenant_id", "storage_key");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_attachments_source_uidx"
  ON "industrial_attachments" ("tenant_id", "source_identity")
  WHERE "source_identity" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_attachments" TO forge_app;
ALTER TABLE "industrial_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_attachments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_attachments_tenant_isolation" ON "industrial_attachments";
CREATE POLICY "industrial_attachments_tenant_isolation" ON "industrial_attachments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "platform_ehs_audit_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid,
  "ownership_scope" varchar(32) NOT NULL DEFAULT 'PLATFORM_GLOBAL',
  "name" varchar(300) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "template_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz,
  CONSTRAINT "platform_ehs_audit_templates_scope_check"
    CHECK ("ownership_scope" IN ('PLATFORM_GLOBAL', 'TENANT_COPY'))
);
CREATE INDEX IF NOT EXISTS "platform_ehs_audit_templates_scope_idx"
  ON "platform_ehs_audit_templates" ("ownership_scope", "tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_ehs_audit_templates" TO forge_app;
ALTER TABLE "platform_ehs_audit_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_ehs_audit_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_ehs_audit_templates_isolation" ON "platform_ehs_audit_templates";
CREATE POLICY "platform_ehs_audit_templates_isolation" ON "platform_ehs_audit_templates"
  USING (
    ownership_scope = 'PLATFORM_GLOBAL'
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    (ownership_scope = 'PLATFORM_GLOBAL' AND tenant_id IS NULL)
    OR (ownership_scope = 'TENANT_COPY'
        AND tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  );

CREATE TABLE IF NOT EXISTS "platform_ehs_audit_template_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid,
  "template_id" uuid NOT NULL REFERENCES "platform_ehs_audit_templates"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL DEFAULT 1,
  "template_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_ehs_audit_template_versions" TO forge_app;
ALTER TABLE "platform_ehs_audit_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_ehs_audit_template_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_ehs_audit_template_versions_isolation" ON "platform_ehs_audit_template_versions";
CREATE POLICY "platform_ehs_audit_template_versions_isolation" ON "platform_ehs_audit_template_versions"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "industrial_migration_id_map" (
  "id" uuid PRIMARY KEY,
  "migration_run_id" varchar(128) NOT NULL,
  "source_system" varchar(64) NOT NULL,
  "source_collection" varchar(128) NOT NULL,
  "source_document_path" varchar(512) NOT NULL,
  "source_document_id" varchar(256) NOT NULL,
  "source_tenant_key" varchar(256),
  "target_entity" varchar(128) NOT NULL,
  "target_id" uuid NOT NULL,
  "aws_tenant_id" uuid REFERENCES "tenants"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_migration_id_map_idem_uidx"
  ON "industrial_migration_id_map" (
    "source_system", "source_collection", "source_document_id", "target_entity"
  );
CREATE INDEX IF NOT EXISTS "industrial_migration_id_map_run_idx"
  ON "industrial_migration_id_map" ("migration_run_id");
CREATE INDEX IF NOT EXISTS "industrial_migration_id_map_target_idx"
  ON "industrial_migration_id_map" ("target_entity", "target_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_migration_id_map" TO forge_app;
ALTER TABLE "industrial_migration_id_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_migration_id_map" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_migration_id_map_tenant_isolation" ON "industrial_migration_id_map";
CREATE POLICY "industrial_migration_id_map_tenant_isolation" ON "industrial_migration_id_map"
  USING (
    aws_tenant_id IS NULL
    OR aws_tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    aws_tenant_id IS NULL
    OR aws_tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "industrial_history_records" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "history_domain" varchar(64) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'ARCHIVED',
  "source_system" varchar(64) NOT NULL DEFAULT 'FIREBASE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_history_records_domain_idx"
  ON "industrial_history_records" ("tenant_id", "history_domain");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_history_records_source_uidx"
  ON "industrial_history_records" ("tenant_id", "source_collection", "source_document_id")
  WHERE "source_document_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_history_records" TO forge_app;
ALTER TABLE "industrial_history_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_history_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_history_records_tenant_isolation" ON "industrial_history_records";
CREATE POLICY "industrial_history_records_tenant_isolation" ON "industrial_history_records"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);


-- Tenant settings/branding: reuse existing tenant_settings / tenant_branding (tip migrations).
-- Observations/JSAs: empty operational tables created above for API readiness (no Firebase source collections).

