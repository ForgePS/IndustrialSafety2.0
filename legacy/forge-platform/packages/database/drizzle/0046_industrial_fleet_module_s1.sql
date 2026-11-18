-- 0046_industrial_fleet_module_s1
-- Fleet Management S1: extend vehicles, align drivers, history + maintenance + documents.

ALTER TABLE "industrial_fleet_vehicles"
  ADD COLUMN IF NOT EXISTS "asset_number" varchar(64),
  ADD COLUMN IF NOT EXISTS "asset_type" varchar(64) NOT NULL DEFAULT 'FLEET_VEHICLE',
  ADD COLUMN IF NOT EXISTS "custom_asset_type_label" varchar(120),
  ADD COLUMN IF NOT EXISTS "trim" varchar(120),
  ADD COLUMN IF NOT EXISTS "serial_number" varchar(120),
  ADD COLUMN IF NOT EXISTS "license_state" varchar(32),
  ADD COLUMN IF NOT EXISTS "registration_renewal_month" integer,
  ADD COLUMN IF NOT EXISTS "assigned_driver_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  ADD COLUMN IF NOT EXISTS "assigned_driver_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "county_assessment_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "county_assessment_notes" text,
  ADD COLUMN IF NOT EXISTS "insurance_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "mileage_updated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "engine_hours" integer,
  ADD COLUMN IF NOT EXISTS "engine_hours_updated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "not_on_vehicle_fringe_ss" boolean,
  ADD COLUMN IF NOT EXISTS "commute_use_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "commute_use_notes" text,
  ADD COLUMN IF NOT EXISTS "form_2290_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "form_2290_notes" text,
  ADD COLUMN IF NOT EXISTS "irp_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "irp_notes" text,
  ADD COLUMN IF NOT EXISTS "disposition_status" varchar(64),
  ADD COLUMN IF NOT EXISTS "disposition_date" date,
  ADD COLUMN IF NOT EXISTS "disposition_notes" text,
  ADD COLUMN IF NOT EXISTS "out_of_service" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "out_of_service_reason" text;

CREATE INDEX IF NOT EXISTS "industrial_fleet_vehicles_tenant_type_idx"
  ON "industrial_fleet_vehicles" ("tenant_id", "asset_type");
CREATE INDEX IF NOT EXISTS "industrial_fleet_vehicles_tenant_renewal_idx"
  ON "industrial_fleet_vehicles" ("tenant_id", "renewal_date");
CREATE INDEX IF NOT EXISTS "industrial_fleet_vehicles_tenant_asset_number_idx"
  ON "industrial_fleet_vehicles" ("tenant_id", "asset_number");

-- Driver columns already present in 0040 for some envs; ADD IF NOT EXISTS is safe.
ALTER TABLE "industrial_fleet_drivers"
  ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "industrial_sites"("id"),
  ADD COLUMN IF NOT EXISTS "employee_number" varchar(120),
  ADD COLUMN IF NOT EXISTS "date_of_birth" date,
  ADD COLUMN IF NOT EXISTS "initial_mvr_date" date,
  ADD COLUMN IF NOT EXISTS "last_mvr_date" date,
  ADD COLUMN IF NOT EXISTS "next_mvr_due_date" date,
  ADD COLUMN IF NOT EXISTS "insurance_effective_date" date,
  ADD COLUMN IF NOT EXISTS "insurance_removed_date" date,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "license_expiry_date" date;

CREATE TABLE IF NOT EXISTS "industrial_fleet_assignment_history" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "industrial_fleet_vehicles"("id"),
  "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  "driver_id" uuid REFERENCES "industrial_fleet_drivers"("id"),
  "driver_name" varchar(300),
  "action" varchar(64) NOT NULL,
  "effective_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_fleet_assignment_history_vehicle_idx"
  ON "industrial_fleet_assignment_history" ("tenant_id", "vehicle_id", "effective_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_assignment_history" TO forge_app;
ALTER TABLE "industrial_fleet_assignment_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_assignment_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_assignment_history_tenant_isolation" ON "industrial_fleet_assignment_history";
CREATE POLICY "industrial_fleet_assignment_history_tenant_isolation" ON "industrial_fleet_assignment_history"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_fleet_mileage_history" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "industrial_fleet_vehicles"("id"),
  "mileage" integer NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_fleet_mileage_history_vehicle_idx"
  ON "industrial_fleet_mileage_history" ("tenant_id", "vehicle_id", "recorded_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_mileage_history" TO forge_app;
ALTER TABLE "industrial_fleet_mileage_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_mileage_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_mileage_history_tenant_isolation" ON "industrial_fleet_mileage_history";
CREATE POLICY "industrial_fleet_mileage_history_tenant_isolation" ON "industrial_fleet_mileage_history"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_fleet_engine_hours_history" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "industrial_fleet_vehicles"("id"),
  "engine_hours" integer NOT NULL,
  "recorded_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_fleet_engine_hours_history_vehicle_idx"
  ON "industrial_fleet_engine_hours_history" ("tenant_id", "vehicle_id", "recorded_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_engine_hours_history" TO forge_app;
ALTER TABLE "industrial_fleet_engine_hours_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_engine_hours_history" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_engine_hours_history_tenant_isolation" ON "industrial_fleet_engine_hours_history";
CREATE POLICY "industrial_fleet_engine_hours_history_tenant_isolation" ON "industrial_fleet_engine_hours_history"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_fleet_maintenance" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "industrial_fleet_vehicles"("id"),
  "title" varchar(500) NOT NULL,
  "maintenance_type" varchar(64) NOT NULL DEFAULT 'REPAIR',
  "status" varchar(64) NOT NULL DEFAULT 'OPEN',
  "due_date" date,
  "completed_at" timestamptz,
  "cost_cents" integer,
  "notes" text,
  "source_system" varchar(64) NOT NULL DEFAULT 'FORGE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_fleet_maintenance_vehicle_idx"
  ON "industrial_fleet_maintenance" ("tenant_id", "vehicle_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_maintenance" TO forge_app;
ALTER TABLE "industrial_fleet_maintenance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_maintenance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_maintenance_tenant_isolation" ON "industrial_fleet_maintenance";
CREATE POLICY "industrial_fleet_maintenance_tenant_isolation" ON "industrial_fleet_maintenance"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_fleet_documents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "vehicle_id" uuid NOT NULL REFERENCES "industrial_fleet_vehicles"("id"),
  "title" varchar(500) NOT NULL,
  "document_type" varchar(64) NOT NULL DEFAULT 'OTHER',
  "storage_key" varchar(512),
  "content_type" varchar(120),
  "notes" text,
  "source_system" varchar(64) NOT NULL DEFAULT 'FORGE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_fleet_documents_vehicle_idx"
  ON "industrial_fleet_documents" ("tenant_id", "vehicle_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_fleet_documents" TO forge_app;
ALTER TABLE "industrial_fleet_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_fleet_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_fleet_documents_tenant_isolation" ON "industrial_fleet_documents";
CREATE POLICY "industrial_fleet_documents_tenant_isolation" ON "industrial_fleet_documents"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

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
