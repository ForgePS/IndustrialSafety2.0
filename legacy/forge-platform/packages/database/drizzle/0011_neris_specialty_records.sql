-- NERIS Phase 3: specialty repeatable records, attachments, master-data proposals.
-- Also forces specialty feature-flag catalog default to false.

UPDATE "feature_definitions"
SET "default_value_json" = 'false'::jsonb,
    "description" = 'Enable Phase 3 dynamic fire/specialty workflow groups (schema-driven section activation). Default false; enable only via tenant override for approved development tenants.',
    "updated_at" = now()
WHERE "key" = 'rms.neris.specialty_workflows.enabled';

CREATE TABLE IF NOT EXISTS "forge_documents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "original_filename" varchar(500) NOT NULL,
  "stored_filename" varchar(500) NOT NULL,
  "object_key" varchar(1000) NOT NULL,
  "bucket_name" varchar(255) NOT NULL,
  "mime_type" varchar(255) NOT NULL,
  "file_size_bytes" integer NOT NULL DEFAULT 0,
  "checksum_sha256" varchar(64),
  "security_classification" varchar(40) NOT NULL DEFAULT 'INTERNAL',
  "malware_scan_status" varchar(40) NOT NULL DEFAULT 'PENDING',
  "malware_scan_detail" text,
  "retention_rule" varchar(80) NOT NULL DEFAULT 'INCIDENT_DEFAULT',
  "upload_status" varchar(40) NOT NULL DEFAULT 'INITIALIZED',
  "source" varchar(40) NOT NULL DEFAULT 'RMS_WEB',
  "capture_at" timestamptz,
  "uploaded_at" timestamptz,
  "uploaded_by_user_id" uuid REFERENCES "users"("id"),
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "forge_documents_tenant_idx" ON "forge_documents" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "forge_documents_tenant_object_uidx" ON "forge_documents" ("tenant_id", "object_key");

CREATE TABLE IF NOT EXISTS "neris_incident_attachments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "document_id" uuid NOT NULL REFERENCES "forge_documents"("id"),
  "specialty_section" varchar(64),
  "repeatable_record_type" varchar(64),
  "repeatable_record_id" uuid,
  "category" varchar(80) NOT NULL DEFAULT 'OTHER',
  "caption" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_attachments_incident_idx" ON "neris_incident_attachments" ("incident_id");
CREATE INDEX IF NOT EXISTS "neris_incident_attachments_record_idx" ON "neris_incident_attachments" ("repeatable_record_type", "repeatable_record_id");

CREATE TABLE IF NOT EXISTS "neris_incident_exposure_sequences" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "next_value" integer NOT NULL DEFAULT 1,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_exposure_sequences_incident_uidx" ON "neris_incident_exposure_sequences" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_exposures" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "exposure_number" integer NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "completion_status" varchar(40) NOT NULL DEFAULT 'INCOMPLETE',
  "address_line1" varchar(300),
  "address_line2" varchar(300),
  "city" varchar(120),
  "state" varchar(64),
  "postal_code" varchar(32),
  "location_description" text,
  "occupancy_id" uuid REFERENCES "rms_occupancies"("id"),
  "preplan_id" uuid REFERENCES "rms_preplans"("id"),
  "property_use" varchar(120),
  "construction_details" text,
  "fire_spread_mechanism" varchar(120),
  "fire_origin_relationship" varchar(120),
  "damage_description" text,
  "property_loss" numeric,
  "content_loss" numeric,
  "property_value" numeric,
  "content_value" numeric,
  "loss_exception_note" text,
  "suppression_actions" text,
  "alarm_systems_summary" text,
  "protection_systems_summary" text,
  "civilian_casualty_count" integer NOT NULL DEFAULT 0,
  "fire_service_casualty_count" integer NOT NULL DEFAULT 0,
  "narrative" text,
  "location_exception_note" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_exposures_number_uidx" ON "neris_incident_exposures" ("incident_id", "exposure_number");
CREATE INDEX IF NOT EXISTS "neris_incident_exposures_incident_idx" ON "neris_incident_exposures" ("incident_id", "status");

CREATE TABLE IF NOT EXISTS "neris_incident_civilian_casualties" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "exposure_id" uuid REFERENCES "neris_incident_exposures"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "review_status" varchar(40) NOT NULL DEFAULT 'OPEN',
  "person_known" boolean NOT NULL DEFAULT false,
  "display_name" varchar(200),
  "age" integer,
  "age_range" varchar(40),
  "sex" varchar(40),
  "civilian_role" varchar(80),
  "relationship_to_property" varchar(120),
  "location_at_injury" text,
  "location_found" text,
  "activity_at_injury" varchar(120),
  "injury_cause" varchar(120),
  "injury_type" varchar(120),
  "injury_severity" varchar(80),
  "condition_at_arrival" varchar(120),
  "rescue_involvement" boolean NOT NULL DEFAULT false,
  "contributing_factors" text,
  "mobility_limitations" text,
  "evacuation_limitations" text,
  "protective_equipment" text,
  "smoke_alarm_awareness" varchar(80),
  "treatment_provided" text,
  "transport_status" varchar(80),
  "destination_reference" varchar(200),
  "transport_exception_note" text,
  "outcome" varchar(80),
  "fatality" boolean NOT NULL DEFAULT false,
  "epcr_encounter_ref" varchar(120),
  "narrative" text,
  "unknown_person_handling" varchar(80),
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_civilian_casualties_incident_idx" ON "neris_incident_civilian_casualties" ("incident_id", "status");

CREATE TABLE IF NOT EXISTS "neris_incident_fire_service_casualties" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "exposure_id" uuid REFERENCES "neris_incident_exposures"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "safety_review_status" varchar(40) NOT NULL DEFAULT 'OPEN',
  "personnel_id" uuid REFERENCES "rms_personnel"("id"),
  "personnel_display_name" varchar(200),
  "personnel_unknown_exception" text,
  "unit_id" uuid REFERENCES "rms_units"("id"),
  "assignment" varchar(120),
  "rank" varchar(80),
  "incident_activity" varchar(120),
  "injury_location" text,
  "injury_type" varchar(120),
  "injury_severity" varchar(80),
  "exposure_category" varchar(120),
  "ppe_use" varchar(80),
  "scba_use" varchar(80),
  "pass_status" varchar(80),
  "mayday" boolean NOT NULL DEFAULT false,
  "mayday_details" text,
  "rapid_intervention" boolean NOT NULL DEFAULT false,
  "equipment_failure" text,
  "apparatus_involvement" text,
  "treatment_status" varchar(80),
  "transport_status" varchar(80),
  "lost_time_status" varchar(80),
  "return_to_duty_status" varchar(80),
  "contributing_factors" text,
  "near_miss_classification" varchar(80),
  "follow_up_requirements" text,
  "narrative" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_ff_casualties_incident_idx" ON "neris_incident_fire_service_casualties" ("incident_id", "status");

CREATE TABLE IF NOT EXISTS "neris_incident_hazmat_substances" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "product_name" varchar(200) NOT NULL,
  "un_na_number" varchar(32),
  "cas_number" varchar(40),
  "hazard_class" varchar(80),
  "physical_state" varchar(40),
  "quantity_released" numeric,
  "quantity_threatened" numeric,
  "unit_of_measure" varchar(40),
  "release_status" varchar(80),
  "exposure_routes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "environmental_impact" text,
  "waterway_impact" text,
  "responsible_party" text,
  "narrative" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_hazmat_substances_incident_idx" ON "neris_incident_hazmat_substances" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_hazmat_containers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "substance_id" uuid REFERENCES "neris_incident_hazmat_substances"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "container_type" varchar(120) NOT NULL,
  "capacity" numeric,
  "capacity_unit" varchar(40),
  "product_name" varchar(200),
  "damage" text,
  "leak_location" varchar(120),
  "pressure_status" varchar(80),
  "control_action" text,
  "recovery_status" varchar(80),
  "disposal_status" varchar(80),
  "narrative" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_hazmat_containers_incident_idx" ON "neris_incident_hazmat_containers" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_alarm_systems" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "exposure_id" uuid REFERENCES "neris_incident_exposures"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "system_type" varchar(80) NOT NULL DEFAULT 'ALARM',
  "device_type" varchar(120),
  "location" varchar(200),
  "presence" varchar(40),
  "activation" varchar(80),
  "operation" varchar(80),
  "effectiveness" varchar(80),
  "impairment" boolean NOT NULL DEFAULT false,
  "failure_reason" text,
  "number_activated" integer,
  "number_activated_unknown" boolean NOT NULL DEFAULT false,
  "manual_intervention" boolean NOT NULL DEFAULT false,
  "contractor" varchar(200),
  "corrective_action" text,
  "inspection_referral" text,
  "review_comments" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_alarm_systems_incident_idx" ON "neris_incident_alarm_systems" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_protection_systems" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "exposure_id" uuid REFERENCES "neris_incident_exposures"("id"),
  "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
  "system_type" varchar(80) NOT NULL,
  "location" varchar(200),
  "presence" varchar(40),
  "activation" varchar(80),
  "operation" varchar(80),
  "effectiveness" varchar(80),
  "impairment" boolean NOT NULL DEFAULT false,
  "failure_reason" text,
  "number_activated" integer,
  "number_activated_unknown" boolean NOT NULL DEFAULT false,
  "manual_intervention" boolean NOT NULL DEFAULT false,
  "contractor" varchar(200),
  "corrective_action" text,
  "inspection_referral" text,
  "review_comments" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_protection_systems_incident_idx" ON "neris_incident_protection_systems" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_occupancy_links" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "exposure_id" uuid REFERENCES "neris_incident_exposures"("id"),
  "occupancy_id" uuid REFERENCES "rms_occupancies"("id"),
  "preplan_id" uuid REFERENCES "rms_preplans"("id"),
  "prefill_source" varchar(40) NOT NULL DEFAULT 'OCCUPANCY',
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "incident_corrections_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_occupancy_links_incident_idx" ON "neris_incident_occupancy_links" ("incident_id");
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_occupancy_links_scope_uidx"
  ON "neris_incident_occupancy_links" (
    "incident_id",
    COALESCE("exposure_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("occupancy_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE IF NOT EXISTS "neris_proposed_master_updates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "target_type" varchar(40) NOT NULL,
  "target_id" uuid NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'PROPOSED',
  "proposed_changes_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "review_note" text,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamptz,
  "applied_at" timestamptz,
  "applied_by_user_id" uuid,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_proposed_master_updates_tenant_status_idx" ON "neris_proposed_master_updates" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "neris_proposed_master_updates_incident_idx" ON "neris_proposed_master_updates" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_section_approvals" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "section_key" varchar(64) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'APPROVED',
  "reviewer_role" varchar(80),
  "note" text,
  "approved_by_user_id" uuid,
  "approved_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_section_approvals_uidx" ON "neris_incident_section_approvals" ("incident_id", "section_key");

CREATE TABLE IF NOT EXISTS "neris_casualty_access_audit" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "casualty_type" varchar(40) NOT NULL,
  "casualty_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" varchar(40) NOT NULL,
  "correlation_id" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_casualty_access_audit_incident_idx" ON "neris_casualty_access_audit" ("incident_id");

ALTER TABLE "neris_incident_review_comments"
  ADD COLUMN IF NOT EXISTS "specialty_record_type" varchar(64),
  ADD COLUMN IF NOT EXISTS "specialty_record_id" uuid,
  ADD COLUMN IF NOT EXISTS "attachment_id" uuid,
  ADD COLUMN IF NOT EXISTS "validation_result_id" uuid,
  ADD COLUMN IF NOT EXISTS "reviewer_role" varchar(80),
  ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "resolution_note" text,
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "resolved_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now();

ALTER TABLE "neris_incident_validation_results"
  ADD COLUMN IF NOT EXISTS "specialty_record_type" varchar(64),
  ADD COLUMN IF NOT EXISTS "specialty_record_id" uuid,
  ADD COLUMN IF NOT EXISTS "attachment_id" uuid,
  ADD COLUMN IF NOT EXISTS "correction_path" varchar(300);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "forge_documents",
  "neris_incident_attachments",
  "neris_incident_exposure_sequences",
  "neris_incident_exposures",
  "neris_incident_civilian_casualties",
  "neris_incident_fire_service_casualties",
  "neris_incident_hazmat_substances",
  "neris_incident_hazmat_containers",
  "neris_incident_alarm_systems",
  "neris_incident_protection_systems",
  "neris_incident_occupancy_links",
  "neris_proposed_master_updates",
  "neris_incident_section_approvals",
  "neris_casualty_access_audit"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'forge_documents',
    'neris_incident_attachments',
    'neris_incident_exposure_sequences',
    'neris_incident_exposures',
    'neris_incident_civilian_casualties',
    'neris_incident_fire_service_casualties',
    'neris_incident_hazmat_substances',
    'neris_incident_hazmat_containers',
    'neris_incident_alarm_systems',
    'neris_incident_protection_systems',
    'neris_incident_occupancy_links',
    'neris_proposed_master_updates',
    'neris_incident_section_approvals',
    'neris_casualty_access_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid)',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;
