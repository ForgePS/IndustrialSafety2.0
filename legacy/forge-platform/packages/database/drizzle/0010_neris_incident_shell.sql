CREATE TABLE IF NOT EXISTS "neris_incident_number_configs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL DEFAULT 'DEFAULT',
  "format_template" varchar(200) NOT NULL DEFAULT '{YEAR4}-{SEQ:6}',
  "reset_mode" varchar(32) NOT NULL DEFAULT 'CALENDAR',
  "scope" varchar(32) NOT NULL DEFAULT 'NONE',
  "prefix" varchar(64),
  "suffix" varchar(64),
  "agency_code" varchar(64),
  "fiscal_year_start_month" integer NOT NULL DEFAULT 1,
  "allow_manual" boolean NOT NULL DEFAULT false,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_number_configs_tenant_name_uidx"
  ON "neris_incident_number_configs" ("tenant_id", "name");

CREATE TABLE IF NOT EXISTS "neris_incident_number_sequences" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "config_id" uuid NOT NULL REFERENCES "neris_incident_number_configs"("id"),
  "period_key" varchar(32) NOT NULL,
  "station_id" uuid REFERENCES "rms_stations"("id"),
  "category_key" varchar(64),
  "next_value" integer NOT NULL DEFAULT 1,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_number_sequences_scope_uidx"
  ON "neris_incident_number_sequences" (
    "config_id",
    "period_key",
    COALESCE("station_id", '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE("category_key", '')
  );

CREATE TABLE IF NOT EXISTS "neris_incident_numbers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "number" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'ASSIGNED',
  "source" varchar(32) NOT NULL DEFAULT 'AUTO',
  "sequence_value" integer,
  "period_key" varchar(32),
  "station_id" uuid REFERENCES "rms_stations"("id"),
  "incident_id" uuid,
  "void_reason" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_numbers_tenant_number_uidx"
  ON "neris_incident_numbers" ("tenant_id", "number");
CREATE INDEX IF NOT EXISTS "neris_incident_numbers_incident_idx" ON "neris_incident_numbers" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incidents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_number" varchar(64) NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'DRAFT',
  "schema_version_id" uuid REFERENCES "neris_schema_versions"("id"),
  "incident_date" date,
  "alarm_at" timestamptz,
  "station_id" uuid REFERENCES "rms_stations"("id"),
  "shift_id" uuid REFERENCES "rms_shifts"("id"),
  "response_district" varchar(120),
  "incident_source" varchar(64),
  "dispatch_description" text,
  "mutual_aid_status" varchar(64),
  "aid_direction" varchar(64),
  "incident_commander_personnel_id" uuid REFERENCES "rms_personnel"("id"),
  "report_owner_user_id" uuid REFERENCES "users"("id"),
  "primary_incident_type_code" varchar(120),
  "secondary_incident_type_codes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "operating_mode" varchar(32) NOT NULL DEFAULT 'MANUAL_ONLY',
  "void_reason" text,
  "submitted_at" timestamptz,
  "approved_at" timestamptz,
  "finalized_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz,
  "deleted_by_user_id" uuid,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incidents_tenant_number_uidx" ON "neris_incidents" ("tenant_id", "incident_number");
CREATE INDEX IF NOT EXISTS "neris_incidents_tenant_status_idx" ON "neris_incidents" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "neris_incidents_tenant_date_idx" ON "neris_incidents" ("tenant_id", "incident_date");

CREATE TABLE IF NOT EXISTS "neris_incident_status_history" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "from_status" varchar(40),
  "to_status" varchar(40) NOT NULL,
  "reason" text,
  "actor_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_status_history_incident_idx"
  ON "neris_incident_status_history" ("incident_id", "created_at");

CREATE TABLE IF NOT EXISTS "neris_incident_sections" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "section_key" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'INCOMPLETE',
  "completion_percent" integer NOT NULL DEFAULT 0,
  "last_saved_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_sections_incident_key_uidx"
  ON "neris_incident_sections" ("incident_id", "section_key");

CREATE TABLE IF NOT EXISTS "neris_incident_repeatable_groups" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "group_key" varchar(120) NOT NULL,
  "module_key" varchar(120),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_repeatable_groups_uidx"
  ON "neris_incident_repeatable_groups" ("incident_id", "group_key");

CREATE TABLE IF NOT EXISTS "neris_incident_repeatable_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "group_id" uuid NOT NULL REFERENCES "neris_incident_repeatable_groups"("id"),
  "ordinal" integer NOT NULL DEFAULT 0,
  "label" varchar(200),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "neris_incident_repeatable_items_group_idx"
  ON "neris_incident_repeatable_items" ("group_id", "ordinal");

CREATE TABLE IF NOT EXISTS "neris_incident_field_values" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "field_id" uuid NOT NULL REFERENCES "neris_fields"("id"),
  "section_key" varchar(64) NOT NULL,
  "repeatable_item_id" uuid REFERENCES "neris_incident_repeatable_items"("id"),
  "value_text" text,
  "value_number" numeric,
  "value_boolean" boolean,
  "value_timestamp" timestamptz,
  "value_option_id" uuid REFERENCES "neris_value_options"("id"),
  "value_json" jsonb,
  "prefill_source" varchar(40),
  "user_confirmed" boolean NOT NULL DEFAULT false,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_field_values_uidx"
  ON "neris_incident_field_values" (
    "incident_id",
    "field_id",
    "section_key",
    COALESCE("repeatable_item_id", '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS "neris_incident_field_values_incident_idx"
  ON "neris_incident_field_values" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_units" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "unit_id" uuid NOT NULL REFERENCES "rms_units"("id"),
  "is_primary" boolean NOT NULL DEFAULT false,
  "unit_role" varchar(80),
  "dispatched_at" timestamptz,
  "en_route_at" timestamptz,
  "arrived_at" timestamptz,
  "cleared_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_units_incident_unit_uidx"
  ON "neris_incident_units" ("incident_id", "unit_id");

CREATE TABLE IF NOT EXISTS "neris_incident_personnel" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "personnel_id" uuid NOT NULL REFERENCES "rms_personnel"("id"),
  "unit_assignment_id" uuid REFERENCES "neris_incident_units"("id"),
  "role" varchar(80),
  "rank" varchar(80),
  "primary_action" varchar(120),
  "exposure_involved" boolean NOT NULL DEFAULT false,
  "is_incident_commander" boolean NOT NULL DEFAULT false,
  "is_reporting_officer" boolean NOT NULL DEFAULT false,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_personnel_incident_person_uidx"
  ON "neris_incident_personnel" ("incident_id", "personnel_id");

CREATE TABLE IF NOT EXISTS "neris_incident_locations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "location_type" varchar(80),
  "municipality" varchar(120),
  "county" varchar(120),
  "state" varchar(64),
  "postal_code" varchar(32),
  "latitude" double precision,
  "longitude" double precision,
  "cross_streets" varchar(300),
  "mile_marker" varchar(64),
  "highway" varchar(120),
  "apartment_suite" varchar(80),
  "location_description" text,
  "address_verification_status" varchar(40),
  "jurisdiction" varchar(120),
  "occupancy_id" uuid,
  "preplan_id" uuid,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_locations_incident_uidx"
  ON "neris_incident_locations" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_addresses" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "location_id" uuid REFERENCES "neris_incident_locations"("id"),
  "address_line1" varchar(300),
  "address_line2" varchar(300),
  "city" varchar(120),
  "state" varchar(64),
  "postal_code" varchar(32),
  "country" varchar(64) DEFAULT 'US',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_addresses_incident_idx" ON "neris_incident_addresses" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_timestamps" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "unit_assignment_id" uuid REFERENCES "neris_incident_units"("id"),
  "timestamp_kind" varchar(64) NOT NULL,
  "original_value" timestamptz,
  "corrected_value" timestamptz,
  "is_estimated" boolean NOT NULL DEFAULT false,
  "correction_reason" text,
  "source" varchar(40) NOT NULL DEFAULT 'MANUAL',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_timestamps_incident_idx"
  ON "neris_incident_timestamps" ("incident_id", "timestamp_kind");

CREATE TABLE IF NOT EXISTS "neris_incident_validation_runs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "trigger" varchar(64) NOT NULL DEFAULT 'MANUAL',
  "blocking_error_count" integer NOT NULL DEFAULT 0,
  "warning_count" integer NOT NULL DEFAULT 0,
  "guidance_count" integer NOT NULL DEFAULT 0,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_validation_runs_incident_idx"
  ON "neris_incident_validation_runs" ("incident_id", "created_at");

CREATE TABLE IF NOT EXISTS "neris_incident_validation_results" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "run_id" uuid NOT NULL REFERENCES "neris_incident_validation_runs"("id"),
  "source" varchar(40) NOT NULL,
  "severity" varchar(32) NOT NULL,
  "module_key" varchar(120),
  "section_key" varchar(64),
  "field_id" uuid REFERENCES "neris_fields"("id"),
  "message" text NOT NULL,
  "technical_reference" varchar(200),
  "suggested_correction" text,
  "is_blocking" boolean NOT NULL DEFAULT false,
  "review_status" varchar(32) NOT NULL DEFAULT 'OPEN',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_validation_results_run_idx"
  ON "neris_incident_validation_results" ("run_id", "severity");

CREATE TABLE IF NOT EXISTS "neris_incident_review_assignments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "reviewer_user_id" uuid REFERENCES "users"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "submission_note" text,
  "assigned_at" timestamptz,
  "completed_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_review_assignments_incident_idx"
  ON "neris_incident_review_assignments" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_review_comments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "assignment_id" uuid REFERENCES "neris_incident_review_assignments"("id"),
  "section_key" varchar(64),
  "field_id" uuid REFERENCES "neris_fields"("id"),
  "body" text NOT NULL,
  "author_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_review_comments_incident_idx"
  ON "neris_incident_review_comments" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_schema_snapshots" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "schema_version_id" uuid NOT NULL REFERENCES "neris_schema_versions"("id"),
  "checksum_sha256" varchar(64) NOT NULL,
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_schema_snapshots_incident_uidx"
  ON "neris_incident_schema_snapshots" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_configuration_snapshots" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "trigger" varchar(40) NOT NULL,
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_configuration_snapshots_incident_idx"
  ON "neris_incident_configuration_snapshots" ("incident_id", "created_at");

CREATE TABLE IF NOT EXISTS "neris_incident_activity" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "activity_type" varchar(64) NOT NULL,
  "summary" text NOT NULL,
  "details_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actor_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_incident_activity_incident_idx"
  ON "neris_incident_activity" ("incident_id", "created_at");

CREATE TABLE IF NOT EXISTS "neris_incident_narratives" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "body" text NOT NULL DEFAULT '',
  "character_count" integer NOT NULL DEFAULT 0,
  "template_key" varchar(64),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_narratives_incident_uidx"
  ON "neris_incident_narratives" ("incident_id");

CREATE TABLE IF NOT EXISTS "neris_incident_narrative_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "narrative_id" uuid NOT NULL REFERENCES "neris_incident_narratives"("id"),
  "incident_id" uuid NOT NULL REFERENCES "neris_incidents"("id"),
  "body" text NOT NULL,
  "character_count" integer NOT NULL DEFAULT 0,
  "version_number" integer NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_incident_narrative_versions_uidx"
  ON "neris_incident_narrative_versions" ("narrative_id", "version_number");

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "neris_incident_number_configs",
  "neris_incident_number_sequences",
  "neris_incident_numbers",
  "neris_incidents",
  "neris_incident_status_history",
  "neris_incident_sections",
  "neris_incident_repeatable_groups",
  "neris_incident_repeatable_items",
  "neris_incident_field_values",
  "neris_incident_units",
  "neris_incident_personnel",
  "neris_incident_locations",
  "neris_incident_addresses",
  "neris_incident_timestamps",
  "neris_incident_validation_runs",
  "neris_incident_validation_results",
  "neris_incident_review_assignments",
  "neris_incident_review_comments",
  "neris_incident_schema_snapshots",
  "neris_incident_configuration_snapshots",
  "neris_incident_activity",
  "neris_incident_narratives",
  "neris_incident_narrative_versions"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'neris_incident_number_configs',
    'neris_incident_number_sequences',
    'neris_incident_numbers',
    'neris_incidents',
    'neris_incident_status_history',
    'neris_incident_sections',
    'neris_incident_repeatable_groups',
    'neris_incident_repeatable_items',
    'neris_incident_field_values',
    'neris_incident_units',
    'neris_incident_personnel',
    'neris_incident_locations',
    'neris_incident_addresses',
    'neris_incident_timestamps',
    'neris_incident_validation_runs',
    'neris_incident_validation_results',
    'neris_incident_review_assignments',
    'neris_incident_review_comments',
    'neris_incident_schema_snapshots',
    'neris_incident_configuration_snapshots',
    'neris_incident_activity',
    'neris_incident_narratives',
    'neris_incident_narrative_versions'
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
