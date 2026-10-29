-- 0091_industrial_sanitation_s1 — Grain Facility Sanitation Inspection Module
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_sanitation_facility_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid NOT NULL REFERENCES "industrial_sites"("id"),
  "facility_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "compliance_frameworks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "dust_action_threshold_inches" double precision NOT NULL DEFAULT 0.125,
  "dust_measurement_unit" varchar(16) NOT NULL DEFAULT 'INCHES',
  "priority_housekeeping_enabled" boolean NOT NULL DEFAULT false,
  "independent_verification_required" boolean NOT NULL DEFAULT true,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sanitation_facility_profiles_site_uidx"
  ON "industrial_sanitation_facility_profiles" ("tenant_id", "site_id") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_sanitation_facility_profiles_tenant_idx"
  ON "industrial_sanitation_facility_profiles" ("tenant_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_facility_profiles" TO forge_app;
ALTER TABLE "industrial_sanitation_facility_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_facility_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_facility_profiles_tenant_isolation" ON "industrial_sanitation_facility_profiles";
CREATE POLICY "industrial_sanitation_facility_profiles_tenant_isolation" ON "industrial_sanitation_facility_profiles"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_zones" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "code" varchar(64),
  "name" varchar(300) NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_food_contact" boolean NOT NULL DEFAULT false,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_zones_tenant_site_idx"
  ON "industrial_sanitation_zones" ("tenant_id", "site_id", "sort_order");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_zones" TO forge_app;
ALTER TABLE "industrial_sanitation_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_zones" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_zones_tenant_isolation" ON "industrial_sanitation_zones";
CREATE POLICY "industrial_sanitation_zones_tenant_isolation" ON "industrial_sanitation_zones"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_locations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id") ON DELETE SET NULL,
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "building" varchar(200),
  "area" varchar(300),
  "name" varchar(500) NOT NULL,
  "location_type" varchar(64) NOT NULL DEFAULT 'AREA',
  "is_priority_housekeeping" boolean NOT NULL DEFAULT false,
  "priority_reason" varchar(200),
  "qr_token" varchar(120),
  "map_x" double precision,
  "map_y" double precision,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_locations_tenant_site_idx"
  ON "industrial_sanitation_locations" ("tenant_id", "site_id", "name");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_locations_zone_idx"
  ON "industrial_sanitation_locations" ("tenant_id", "zone_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sanitation_locations_qr_uidx"
  ON "industrial_sanitation_locations" ("tenant_id", "qr_token")
  WHERE "qr_token" IS NOT NULL AND "archived_at" IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_locations" TO forge_app;
ALTER TABLE "industrial_sanitation_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_locations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_locations_tenant_isolation" ON "industrial_sanitation_locations";
CREATE POLICY "industrial_sanitation_locations_tenant_isolation" ON "industrial_sanitation_locations"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "ownership_scope" varchar(32) NOT NULL DEFAULT 'PLATFORM_GLOBAL',
  "code" varchar(120),
  "name" varchar(300) NOT NULL,
  "category" varchar(120) NOT NULL DEFAULT 'GENERAL',
  "description" text,
  "version_number" integer NOT NULL DEFAULT 1,
  "facility_applicability" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "template_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scoring_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_templates_tenant_idx"
  ON "industrial_sanitation_templates" ("tenant_id", "status", "category");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_templates_code_idx"
  ON "industrial_sanitation_templates" ("code");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_templates" TO forge_app;
ALTER TABLE "industrial_sanitation_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_templates_tenant_isolation" ON "industrial_sanitation_templates";
CREATE POLICY "industrial_sanitation_templates_tenant_isolation" ON "industrial_sanitation_templates"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_inspections" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id"),
  "equipment_id" uuid REFERENCES "industrial_equipment"("id"),
  "template_id" uuid REFERENCES "industrial_sanitation_templates"("id"),
  "template_version" integer NOT NULL DEFAULT 1,
  "inspection_number" varchar(64),
  "inspection_type" varchar(120) NOT NULL DEFAULT 'GENERAL',
  "title" varchar(500) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'IN_PROGRESS',
  "compliance_status" varchar(64),
  "score_percent" double precision,
  "severity_max" varchar(32),
  "inspector_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "inspector_user_id" uuid REFERENCES "users"("id"),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "shift" varchar(64),
  "product_line" varchar(200),
  "production_order" varchar(120),
  "responses_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "summary_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "signatures_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "offline_client_id" varchar(120),
  "parent_inspection_id" uuid REFERENCES "industrial_sanitation_inspections"("id"),
  "notes" text,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_inspections_tenant_status_idx"
  ON "industrial_sanitation_inspections" ("tenant_id", "status", "completed_at");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_inspections_tenant_site_idx"
  ON "industrial_sanitation_inspections" ("tenant_id", "site_id", "inspection_type");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_inspections_number_idx"
  ON "industrial_sanitation_inspections" ("tenant_id", "inspection_number");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sanitation_inspections_offline_uidx"
  ON "industrial_sanitation_inspections" ("tenant_id", "offline_client_id")
  WHERE "offline_client_id" IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_inspections" TO forge_app;
ALTER TABLE "industrial_sanitation_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_inspections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_inspections_tenant_isolation" ON "industrial_sanitation_inspections";
CREATE POLICY "industrial_sanitation_inspections_tenant_isolation" ON "industrial_sanitation_inspections"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_findings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "inspection_id" uuid REFERENCES "industrial_sanitation_inspections"("id") ON DELETE CASCADE,
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id"),
  "equipment_id" uuid REFERENCES "industrial_equipment"("id"),
  "finding_number" varchar(64),
  "category" varchar(120) NOT NULL DEFAULT 'GENERAL',
  "subcategory" varchar(120),
  "title" varchar(500) NOT NULL,
  "description" text,
  "severity" varchar(32) NOT NULL DEFAULT 'MINOR',
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "question_key" varchar(120),
  "regulation_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_recurring" boolean NOT NULL DEFAULT false,
  "recurrence_count" integer NOT NULL DEFAULT 0,
  "stop_work" boolean NOT NULL DEFAULT false,
  "product_hold" boolean NOT NULL DEFAULT false,
  "corrective_action_id" uuid REFERENCES "industrial_corrective_actions"("id"),
  "reported_by_user_id" uuid REFERENCES "users"("id"),
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_findings_tenant_status_idx"
  ON "industrial_sanitation_findings" ("tenant_id", "status", "severity");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_findings_inspection_idx"
  ON "industrial_sanitation_findings" ("tenant_id", "inspection_id");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_findings_location_idx"
  ON "industrial_sanitation_findings" ("tenant_id", "location_id", "category");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_findings" TO forge_app;
ALTER TABLE "industrial_sanitation_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_findings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_findings_tenant_isolation" ON "industrial_sanitation_findings";
CREATE POLICY "industrial_sanitation_findings_tenant_isolation" ON "industrial_sanitation_findings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_dust_measurements" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "inspection_id" uuid REFERENCES "industrial_sanitation_inspections"("id") ON DELETE SET NULL,
  "finding_id" uuid REFERENCES "industrial_sanitation_findings"("id") ON DELETE SET NULL,
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "measurement_number" varchar(64),
  "surface" varchar(200),
  "measurement_point" varchar(300),
  "dust_depth" double precision NOT NULL,
  "unit" varchar(16) NOT NULL DEFAULT 'INCHES',
  "dust_depth_inches" double precision NOT NULL,
  "measurement_method" varchar(120),
  "exceeds_action_level" boolean NOT NULL DEFAULT false,
  "action_threshold_inches" double precision NOT NULL DEFAULT 0.125,
  "is_priority_area" boolean NOT NULL DEFAULT false,
  "inspector_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "measured_at" timestamptz NOT NULL DEFAULT now(),
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "comments" text,
  "remeasurement_of_id" uuid REFERENCES "industrial_sanitation_dust_measurements"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_dust_tenant_alert_idx"
  ON "industrial_sanitation_dust_measurements" ("tenant_id", "exceeds_action_level", "measured_at");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_dust_location_idx"
  ON "industrial_sanitation_dust_measurements" ("tenant_id", "location_id", "measured_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_dust_measurements" TO forge_app;
ALTER TABLE "industrial_sanitation_dust_measurements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_dust_measurements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_dust_measurements_tenant_isolation" ON "industrial_sanitation_dust_measurements";
CREATE POLICY "industrial_sanitation_dust_measurements_tenant_isolation" ON "industrial_sanitation_dust_measurements"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_master_schedule" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id"),
  "equipment_id" uuid REFERENCES "industrial_equipment"("id"),
  "title" varchar(500) NOT NULL,
  "cleaning_task" varchar(500) NOT NULL,
  "cleaning_procedure" text,
  "frequency" varchar(64) NOT NULL DEFAULT 'DAILY',
  "frequency_custom" varchar(200),
  "cleaning_method" varchar(200),
  "assigned_department_id" uuid REFERENCES "industrial_departments"("id"),
  "assigned_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "estimated_duration_minutes" integer,
  "required_shutdown" boolean NOT NULL DEFAULT false,
  "loto_required" boolean NOT NULL DEFAULT false,
  "confined_space_required" boolean NOT NULL DEFAULT false,
  "ppe_required" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "chemicals_required" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "tools_required" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "food_contact_surface" boolean NOT NULL DEFAULT false,
  "allergen_concern" boolean NOT NULL DEFAULT false,
  "dust_hazard" boolean NOT NULL DEFAULT false,
  "verification_required" boolean NOT NULL DEFAULT true,
  "verification_method" varchar(120),
  "sop_document_id" uuid,
  "reference_images_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "effective_date" timestamptz,
  "revision_number" integer NOT NULL DEFAULT 1,
  "next_due_at" timestamptz,
  "last_completed_at" timestamptz,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_mss_tenant_due_idx"
  ON "industrial_sanitation_master_schedule" ("tenant_id", "status", "next_due_at");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_mss_site_idx"
  ON "industrial_sanitation_master_schedule" ("tenant_id", "site_id", "frequency");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_master_schedule" TO forge_app;
ALTER TABLE "industrial_sanitation_master_schedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_master_schedule" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_master_schedule_tenant_isolation" ON "industrial_sanitation_master_schedule";
CREATE POLICY "industrial_sanitation_master_schedule_tenant_isolation" ON "industrial_sanitation_master_schedule"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_cleaning_tasks" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "master_schedule_id" uuid REFERENCES "industrial_sanitation_master_schedule"("id") ON DELETE SET NULL,
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id"),
  "equipment_id" uuid REFERENCES "industrial_equipment"("id"),
  "task_number" varchar(64),
  "title" varchar(500) NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'SCHEDULED',
  "due_at" timestamptz,
  "assigned_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "assigned_user_id" uuid REFERENCES "users"("id"),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "chemicals_used" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "equipment_used" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "before_photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "after_photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "issues_found" text,
  "notes" text,
  "cleaner_signature_json" jsonb,
  "verification_required" boolean NOT NULL DEFAULT true,
  "loto_required" boolean NOT NULL DEFAULT false,
  "loto_record_id" uuid,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_cleaning_tenant_status_idx"
  ON "industrial_sanitation_cleaning_tasks" ("tenant_id", "status", "due_at");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_cleaning_assignee_idx"
  ON "industrial_sanitation_cleaning_tasks" ("tenant_id", "assigned_user_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_cleaning_mss_idx"
  ON "industrial_sanitation_cleaning_tasks" ("tenant_id", "master_schedule_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_cleaning_tasks" TO forge_app;
ALTER TABLE "industrial_sanitation_cleaning_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_cleaning_tasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_cleaning_tasks_tenant_isolation" ON "industrial_sanitation_cleaning_tasks";
CREATE POLICY "industrial_sanitation_cleaning_tasks_tenant_isolation" ON "industrial_sanitation_cleaning_tasks"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_verifications" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "cleaning_task_id" uuid REFERENCES "industrial_sanitation_cleaning_tasks"("id") ON DELETE CASCADE,
  "inspection_id" uuid REFERENCES "industrial_sanitation_inspections"("id") ON DELETE SET NULL,
  "finding_id" uuid REFERENCES "industrial_sanitation_findings"("id") ON DELETE SET NULL,
  "method" varchar(64) NOT NULL DEFAULT 'VISUAL',
  "result" varchar(64) NOT NULL DEFAULT 'PASS',
  "verified_by_user_id" uuid REFERENCES "users"("id"),
  "verified_by_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "verified_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "result_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "signature_json" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_verifications_task_idx"
  ON "industrial_sanitation_verifications" ("tenant_id", "cleaning_task_id");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_verifications_result_idx"
  ON "industrial_sanitation_verifications" ("tenant_id", "result", "verified_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_verifications" TO forge_app;
ALTER TABLE "industrial_sanitation_verifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_verifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_verifications_tenant_isolation" ON "industrial_sanitation_verifications";
CREATE POLICY "industrial_sanitation_verifications_tenant_isolation" ON "industrial_sanitation_verifications"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_spills" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "spill_number" varchar(64),
  "building" varchar(200),
  "area" varchar(300),
  "exact_location" varchar(500),
  "product" varchar(300),
  "estimated_quantity" varchar(120),
  "cause" text,
  "equipment_involved" varchar(300),
  "slip_fall_hazard" boolean NOT NULL DEFAULT false,
  "dust_hazard" boolean NOT NULL DEFAULT false,
  "contamination_concern" boolean NOT NULL DEFAULT false,
  "pest_concern" boolean NOT NULL DEFAULT false,
  "production_impact" text,
  "status" varchar(64) NOT NULL DEFAULT 'REPORTED',
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "actions_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reported_by_user_id" uuid REFERENCES "users"("id"),
  "reported_at" timestamptz NOT NULL DEFAULT now(),
  "cleaned_at" timestamptz,
  "verified_at" timestamptz,
  "corrective_action_id" uuid REFERENCES "industrial_corrective_actions"("id"),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_spills_tenant_status_idx"
  ON "industrial_sanitation_spills" ("tenant_id", "status", "reported_at");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_spills_site_idx"
  ON "industrial_sanitation_spills" ("tenant_id", "site_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_spills" TO forge_app;
ALTER TABLE "industrial_sanitation_spills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_spills" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_spills_tenant_isolation" ON "industrial_sanitation_spills";
CREATE POLICY "industrial_sanitation_spills_tenant_isolation" ON "industrial_sanitation_spills"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_pest_devices" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id"),
  "device_number" varchar(64),
  "qr_token" varchar(120),
  "device_type" varchar(64) NOT NULL DEFAULT 'TRAP',
  "pest_type" varchar(64),
  "building" varchar(200),
  "area" varchar(300),
  "map_x" double precision,
  "map_y" double precision,
  "service_frequency" varchar(64) NOT NULL DEFAULT 'WEEKLY',
  "vendor" varchar(200),
  "last_inspected_at" timestamptz,
  "next_inspection_at" timestamptz,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_pest_devices_tenant_idx"
  ON "industrial_sanitation_pest_devices" ("tenant_id", "site_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sanitation_pest_devices_qr_uidx"
  ON "industrial_sanitation_pest_devices" ("tenant_id", "qr_token")
  WHERE "qr_token" IS NOT NULL AND "archived_at" IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_pest_devices" TO forge_app;
ALTER TABLE "industrial_sanitation_pest_devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_pest_devices" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_pest_devices_tenant_isolation" ON "industrial_sanitation_pest_devices";
CREATE POLICY "industrial_sanitation_pest_devices_tenant_isolation" ON "industrial_sanitation_pest_devices"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_pest_findings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "device_id" uuid REFERENCES "industrial_sanitation_pest_devices"("id") ON DELETE SET NULL,
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "inspection_id" uuid REFERENCES "industrial_sanitation_inspections"("id") ON DELETE SET NULL,
  "pest_species" varchar(120),
  "pest_category" varchar(64) NOT NULL DEFAULT 'OTHER',
  "number_observed" integer,
  "activity_level" varchar(64),
  "evidence" text,
  "droppings" boolean NOT NULL DEFAULT false,
  "nesting" boolean NOT NULL DEFAULT false,
  "entry_point" varchar(300),
  "product_exposure" boolean NOT NULL DEFAULT false,
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "observed_at" timestamptz NOT NULL DEFAULT now(),
  "reported_by_user_id" uuid REFERENCES "users"("id"),
  "corrective_action_id" uuid REFERENCES "industrial_corrective_actions"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_pest_findings_tenant_idx"
  ON "industrial_sanitation_pest_findings" ("tenant_id", "status", "observed_at");
CREATE INDEX IF NOT EXISTS "industrial_sanitation_pest_findings_device_idx"
  ON "industrial_sanitation_pest_findings" ("tenant_id", "device_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_pest_findings" TO forge_app;
ALTER TABLE "industrial_sanitation_pest_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_pest_findings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_pest_findings_tenant_isolation" ON "industrial_sanitation_pest_findings";
CREATE POLICY "industrial_sanitation_pest_findings_tenant_isolation" ON "industrial_sanitation_pest_findings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_chemicals" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "name" varchar(300) NOT NULL,
  "manufacturer" varchar(200),
  "sds_document_id" uuid,
  "intended_use" text,
  "approved_areas" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "restricted_areas" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "concentration" varchar(120),
  "application_method" varchar(200),
  "contact_time" varchar(120),
  "ppe_required" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "food_contact_approved" boolean NOT NULL DEFAULT false,
  "storage_location" varchar(300),
  "expiration_date" timestamptz,
  "lot_number" varchar(120),
  "status" varchar(64) NOT NULL DEFAULT 'APPROVED',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_chemicals_tenant_idx"
  ON "industrial_sanitation_chemicals" ("tenant_id", "site_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_chemicals" TO forge_app;
ALTER TABLE "industrial_sanitation_chemicals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_chemicals" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_chemicals_tenant_isolation" ON "industrial_sanitation_chemicals";
CREATE POLICY "industrial_sanitation_chemicals_tenant_isolation" ON "industrial_sanitation_chemicals"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_environmental_samples" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "zone_id" uuid REFERENCES "industrial_sanitation_zones"("id"),
  "sample_number" varchar(64),
  "sample_point" varchar(300),
  "sample_type" varchar(64) NOT NULL DEFAULT 'ATP',
  "test_name" varchar(200),
  "collected_at" timestamptz NOT NULL DEFAULT now(),
  "collected_by_user_id" uuid REFERENCES "users"("id"),
  "laboratory" varchar(200),
  "lot_batch" varchar(120),
  "result" varchar(200),
  "result_units" varchar(64),
  "detection_limit" varchar(64),
  "pass_fail" varchar(32),
  "attachments_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "corrective_action_id" uuid REFERENCES "industrial_corrective_actions"("id"),
  "status" varchar(64) NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_env_samples_tenant_idx"
  ON "industrial_sanitation_environmental_samples" ("tenant_id", "status", "collected_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_environmental_samples" TO forge_app;
ALTER TABLE "industrial_sanitation_environmental_samples" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_environmental_samples" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_environmental_samples_tenant_isolation" ON "industrial_sanitation_environmental_samples";
CREATE POLICY "industrial_sanitation_environmental_samples_tenant_isolation" ON "industrial_sanitation_environmental_samples"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_compressed_air_requests" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "request_number" varchar(64),
  "area_identified" varchar(500) NOT NULL,
  "cleaning_reason" text,
  "equipment_status_confirmed" boolean NOT NULL DEFAULT false,
  "ignition_sources_addressed" boolean NOT NULL DEFAULT false,
  "other_ignition_controlled" boolean NOT NULL DEFAULT false,
  "ppe_confirmed" boolean NOT NULL DEFAULT false,
  "area_barricaded" boolean NOT NULL DEFAULT false,
  "dust_collection_reviewed" boolean NOT NULL DEFAULT false,
  "status" varchar(64) NOT NULL DEFAULT 'REQUESTED',
  "requested_by_user_id" uuid REFERENCES "users"("id"),
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "approved_at" timestamptz,
  "completed_at" timestamptz,
  "verified_at" timestamptz,
  "denial_reason" text,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_compressed_air_tenant_idx"
  ON "industrial_sanitation_compressed_air_requests" ("tenant_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_compressed_air_requests" TO forge_app;
ALTER TABLE "industrial_sanitation_compressed_air_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_compressed_air_requests" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_compressed_air_requests_tenant_isolation" ON "industrial_sanitation_compressed_air_requests";
CREATE POLICY "industrial_sanitation_compressed_air_requests_tenant_isolation" ON "industrial_sanitation_compressed_air_requests"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_concern_reports" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "site_id" uuid REFERENCES "industrial_sites"("id"),
  "location_id" uuid REFERENCES "industrial_sanitation_locations"("id"),
  "concern_type" varchar(64) NOT NULL,
  "description" text,
  "photos_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "routed_department_id" uuid REFERENCES "industrial_departments"("id"),
  "finding_id" uuid REFERENCES "industrial_sanitation_findings"("id"),
  "reported_by_user_id" uuid REFERENCES "users"("id"),
  "reported_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_sanitation_concerns_tenant_idx"
  ON "industrial_sanitation_concern_reports" ("tenant_id", "status", "reported_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_concern_reports" TO forge_app;
ALTER TABLE "industrial_sanitation_concern_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_concern_reports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_concern_reports_tenant_isolation" ON "industrial_sanitation_concern_reports";
CREATE POLICY "industrial_sanitation_concern_reports_tenant_isolation" ON "industrial_sanitation_concern_reports"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_sanitation_sequence_counters" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "sequence_key" varchar(64) NOT NULL,
  "year" integer NOT NULL,
  "last_value" integer NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sanitation_sequence_counters_uidx"
  ON "industrial_sanitation_sequence_counters" ("tenant_id", "sequence_key", "year");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_sanitation_sequence_counters" TO forge_app;
ALTER TABLE "industrial_sanitation_sequence_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_sanitation_sequence_counters" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_sanitation_sequence_counters_tenant_isolation" ON "industrial_sanitation_sequence_counters";
CREATE POLICY "industrial_sanitation_sequence_counters_tenant_isolation" ON "industrial_sanitation_sequence_counters"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Permissions (also mirrored in @forge/contracts INDUSTRIAL_PERMISSIONS)
INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.sanitation.view', 'View sanitation', 'View sanitation inspections, findings, schedules, and reports', 'NORMAL', false),
  ('industrial.sanitation.manage', 'Manage sanitation', 'Configure facility profiles, zones, locations, templates, and master schedules', 'ELEVATED', false),
  ('industrial.sanitation.inspect', 'Perform sanitation inspections', 'Conduct sanitation inspections and record findings', 'NORMAL', false),
  ('industrial.sanitation.clean', 'Perform cleaning tasks', 'Complete assigned sanitation cleaning tasks', 'NORMAL', false),
  ('industrial.sanitation.verify', 'Verify sanitation', 'Perform independent verification of cleaning and corrective work', 'ELEVATED', false),
  ('industrial.sanitation.report', 'Report sanitation concerns', 'Submit sanitation concern and spill reports', 'NORMAL', false)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

-- Grant new sanitation permissions to roles that already have industrial.admin
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.sanitation.view',
  'industrial.sanitation.manage',
  'industrial.sanitation.inspect',
  'industrial.sanitation.clean',
  'industrial.sanitation.verify',
  'industrial.sanitation.report'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

-- Grant to role templates that already include industrial.admin
INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.sanitation.view',
  'industrial.sanitation.manage',
  'industrial.sanitation.inspect',
  'industrial.sanitation.clean',
  'industrial.sanitation.verify',
  'industrial.sanitation.report'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id"
    AND existing."permission_id" = p."id"
);
