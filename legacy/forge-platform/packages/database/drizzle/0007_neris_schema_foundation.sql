-- NERIS Phase 1: schema foundation (platform catalog + tenant overlays).
-- Official field keys, option codes, cardinality, mappings, and conditions are
-- immutable after publish. Tenant customization uses overlay tables only.

CREATE TABLE IF NOT EXISTS "neris_schema_packages" (
  "id" uuid PRIMARY KEY,
  "code" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_schema_packages_code_uidx"
  ON "neris_schema_packages" ("code");

CREATE TABLE IF NOT EXISTS "neris_schema_versions" (
  "id" uuid PRIMARY KEY,
  "package_id" uuid NOT NULL REFERENCES "neris_schema_packages"("id"),
  "version_label" varchar(64) NOT NULL,
  "checksum_sha256" varchar(64) NOT NULL,
  "state" varchar(32) NOT NULL DEFAULT 'STAGED',
  "source_field_registry_path" text,
  "source_value_sets_path" text,
  "module_count" integer NOT NULL DEFAULT 0,
  "field_count" integer NOT NULL DEFAULT 0,
  "value_set_count" integer NOT NULL DEFAULT 0,
  "option_count" integer NOT NULL DEFAULT 0,
  "effective_from" timestamptz,
  "effective_to" timestamptz,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "neris_schema_versions_state_chk"
    CHECK ("state" IN ('STAGED', 'PUBLISHED', 'SUPERSEDED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_schema_versions_package_checksum_uidx"
  ON "neris_schema_versions" ("package_id", "checksum_sha256");
CREATE INDEX IF NOT EXISTS "neris_schema_versions_state_idx"
  ON "neris_schema_versions" ("state");

CREATE TABLE IF NOT EXISTS "neris_modules" (
  "id" uuid PRIMARY KEY,
  "schema_version_id" uuid NOT NULL REFERENCES "neris_schema_versions"("id"),
  "module_key" varchar(128) NOT NULL,
  "name" varchar(300) NOT NULL,
  "area" varchar(200),
  "source_workbook" varchar(200),
  "field_count" integer NOT NULL DEFAULT 0,
  "ordinal" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_modules_version_key_uidx"
  ON "neris_modules" ("schema_version_id", "module_key");
CREATE INDEX IF NOT EXISTS "neris_modules_area_idx" ON "neris_modules" ("area");

CREATE TABLE IF NOT EXISTS "neris_module_groups" (
  "id" uuid PRIMARY KEY,
  "module_id" uuid NOT NULL REFERENCES "neris_modules"("id"),
  "group_key" varchar(128) NOT NULL,
  "ordinal" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_module_groups_module_key_uidx"
  ON "neris_module_groups" ("module_id", "group_key");

CREATE TABLE IF NOT EXISTS "neris_fields" (
  "id" uuid PRIMARY KEY,
  "schema_version_id" uuid NOT NULL REFERENCES "neris_schema_versions"("id"),
  "module_id" uuid NOT NULL REFERENCES "neris_modules"("id"),
  "group_id" uuid REFERENCES "neris_module_groups"("id"),
  "field_key" varchar(200) NOT NULL,
  "data_type" varchar(128),
  "cardinality" varchar(32),
  "format" varchar(128),
  "official_required" boolean NOT NULL DEFAULT false,
  "neris_core" boolean NOT NULL DEFAULT false,
  "neris_core_aid" boolean NOT NULL DEFAULT false,
  "computed" boolean NOT NULL DEFAULT false,
  "computed_from" text,
  "value_set_ref" boolean NOT NULL DEFAULT false,
  "value_set_location" varchar(200),
  "value_set_candidates_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "definition" text,
  "example_json" jsonb,
  "comments" text,
  "ordinal" integer NOT NULL DEFAULT 0,
  "immutable_official" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_fields_version_module_key_ord_uidx"
  ON "neris_fields" ("schema_version_id", "module_id", "field_key", "ordinal");
CREATE INDEX IF NOT EXISTS "neris_fields_value_set_location_idx"
  ON "neris_fields" ("value_set_location");

CREATE TABLE IF NOT EXISTS "neris_field_conditions" (
  "id" uuid PRIMARY KEY,
  "field_id" uuid NOT NULL REFERENCES "neris_fields"("id"),
  "condition_kind" varchar(32) NOT NULL,
  "raw_expression" text,
  "rule_json" jsonb,
  "parse_status" varchar(32) NOT NULL DEFAULT 'EMPTY',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "neris_field_conditions_kind_chk"
    CHECK ("condition_kind" IN ('POSSIBLE_IF', 'NERIS_CORE_IF')),
  CONSTRAINT "neris_field_conditions_parse_chk"
    CHECK ("parse_status" IN ('PARSED', 'NEEDS_REVIEW', 'EMPTY'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_field_conditions_field_kind_uidx"
  ON "neris_field_conditions" ("field_id", "condition_kind");
CREATE INDEX IF NOT EXISTS "neris_field_conditions_parse_status_idx"
  ON "neris_field_conditions" ("parse_status");

CREATE TABLE IF NOT EXISTS "neris_field_mappings" (
  "id" uuid PRIMARY KEY,
  "field_id" uuid NOT NULL REFERENCES "neris_fields"("id"),
  "map_orm_landing" text,
  "map_app" text,
  "payload_path" text,
  "immutable_official" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_field_mappings_field_uidx"
  ON "neris_field_mappings" ("field_id");

CREATE TABLE IF NOT EXISTS "neris_value_sets" (
  "id" uuid PRIMARY KEY,
  "schema_version_id" uuid NOT NULL REFERENCES "neris_schema_versions"("id"),
  "package_id" uuid NOT NULL REFERENCES "neris_schema_packages"("id"),
  "source_key" varchar(300) NOT NULL,
  "name" varchar(200) NOT NULL,
  "source_workbook" varchar(200),
  "option_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_value_sets_version_source_key_uidx"
  ON "neris_value_sets" ("schema_version_id", "source_key");
CREATE INDEX IF NOT EXISTS "neris_value_sets_name_idx" ON "neris_value_sets" ("name");

CREATE TABLE IF NOT EXISTS "neris_value_options" (
  "id" uuid PRIMARY KEY,
  "value_set_id" uuid NOT NULL REFERENCES "neris_value_sets"("id"),
  "code" varchar(300) NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "description" text,
  "definition" text,
  "source" text,
  "ordinal" integer NOT NULL DEFAULT 0,
  "value_1" varchar(300),
  "value_2" varchar(300),
  "value_3" varchar(300),
  "description_1" text,
  "description_2" text,
  "description_3" text,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_value_options_set_code_uidx"
  ON "neris_value_options" ("value_set_id", "code");
CREATE INDEX IF NOT EXISTS "neris_value_options_active_idx"
  ON "neris_value_options" ("value_set_id", "active");

CREATE TABLE IF NOT EXISTS "neris_value_set_hierarchy" (
  "id" uuid PRIMARY KEY,
  "value_set_id" uuid NOT NULL REFERENCES "neris_value_sets"("id"),
  "parent_option_id" uuid REFERENCES "neris_value_options"("id"),
  "child_option_id" uuid REFERENCES "neris_value_options"("id"),
  "parent_code" varchar(300) NOT NULL,
  "child_code" varchar(300) NOT NULL,
  "level" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "neris_value_set_hierarchy_edge_uidx"
  ON "neris_value_set_hierarchy" ("value_set_id", "parent_code", "child_code", "level");

CREATE TABLE IF NOT EXISTS "neris_schema_import_history" (
  "id" uuid PRIMARY KEY,
  "package_id" uuid NOT NULL REFERENCES "neris_schema_packages"("id"),
  "schema_version_id" uuid REFERENCES "neris_schema_versions"("id"),
  "checksum_sha256" varchar(64) NOT NULL,
  "outcome" varchar(32) NOT NULL,
  "module_count" integer NOT NULL DEFAULT 0,
  "field_count" integer NOT NULL DEFAULT 0,
  "value_set_count" integer NOT NULL DEFAULT 0,
  "option_count" integer NOT NULL DEFAULT 0,
  "details_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "neris_schema_import_history_created_idx"
  ON "neris_schema_import_history" ("created_at");

CREATE TABLE IF NOT EXISTS "neris_schema_validation_results" (
  "id" uuid PRIMARY KEY,
  "schema_version_id" uuid NOT NULL REFERENCES "neris_schema_versions"("id"),
  "import_history_id" uuid REFERENCES "neris_schema_import_history"("id"),
  "severity" varchar(16) NOT NULL,
  "code" varchar(64) NOT NULL,
  "message" text NOT NULL,
  "resource_type" varchar(64),
  "resource_key" varchar(300),
  "details_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "neris_schema_validation_results_severity_chk"
    CHECK ("severity" IN ('ERROR', 'WARNING', 'ADVISORY', 'INFO'))
);
CREATE INDEX IF NOT EXISTS "neris_schema_validation_results_version_idx"
  ON "neris_schema_validation_results" ("schema_version_id", "severity");

CREATE TABLE IF NOT EXISTS "tenant_neris_configuration" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "schema_version_id" uuid REFERENCES "neris_schema_versions"("id"),
  "operating_mode" varchar(32) NOT NULL DEFAULT 'MANUAL_ONLY',
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_neris_configuration_mode_chk"
    CHECK ("operating_mode" IN ('MANUAL_ONLY', 'CAD_ENABLED', 'HYBRID'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_neris_configuration_tenant_uidx"
  ON "tenant_neris_configuration" ("tenant_id");

CREATE TABLE IF NOT EXISTS "tenant_neris_field_overlays" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "configuration_id" uuid NOT NULL REFERENCES "tenant_neris_configuration"("id"),
  "field_id" uuid NOT NULL REFERENCES "neris_fields"("id"),
  "display_label" varchar(300),
  "help_text" text,
  "local_alias" varchar(300),
  "display_order" integer,
  "favorite" boolean NOT NULL DEFAULT false,
  "optional_visible" boolean,
  "safe_default_json" jsonb,
  "local_validation_json" jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_neris_field_overlays_tenant_field_uidx"
  ON "tenant_neris_field_overlays" ("tenant_id", "field_id");

CREATE TABLE IF NOT EXISTS "tenant_neris_value_overlays" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "configuration_id" uuid NOT NULL REFERENCES "tenant_neris_configuration"("id"),
  "value_option_id" uuid NOT NULL REFERENCES "neris_value_options"("id"),
  "local_alias" varchar(300),
  "display_order" integer,
  "favorite" boolean NOT NULL DEFAULT false,
  "notes" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_neris_value_overlays_tenant_option_uidx"
  ON "tenant_neris_value_overlays" ("tenant_id", "value_option_id");

-- Platform catalog grants (readable by forge_app; writes via migrator/import).
GRANT SELECT ON
  "neris_schema_packages",
  "neris_schema_versions",
  "neris_modules",
  "neris_module_groups",
  "neris_fields",
  "neris_field_conditions",
  "neris_field_mappings",
  "neris_value_sets",
  "neris_value_options",
  "neris_value_set_hierarchy",
  "neris_schema_import_history",
  "neris_schema_validation_results"
TO forge_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "tenant_neris_configuration",
  "tenant_neris_field_overlays",
  "tenant_neris_value_overlays"
TO forge_app;

-- Tenant overlay RLS (FORCE).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_neris_configuration',
    'tenant_neris_field_overlays',
    'tenant_neris_value_overlays'
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
