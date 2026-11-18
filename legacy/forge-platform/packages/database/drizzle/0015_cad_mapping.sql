-- NERIS Phase 4A: CAD mapping rules, aliases, versions, unmapped-value queue.

CREATE TABLE IF NOT EXISTS "cad_mapping_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "mapping_profile_id" uuid NOT NULL REFERENCES "cad_mapping_profiles"("id"),
  "version_number" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "change_summary" text,
  "published_at" timestamptz,
  "published_by_user_id" uuid,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_mapping_versions_status_chk" CHECK ("status" IN (
    'DRAFT', 'TESTING', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_mapping_versions_profile_version_uidx"
  ON "cad_mapping_versions" ("mapping_profile_id", "version_number");
CREATE INDEX IF NOT EXISTS "cad_mapping_versions_tenant_idx"
  ON "cad_mapping_versions" ("tenant_id");

CREATE TABLE IF NOT EXISTS "cad_mapping_rules" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "mapping_profile_id" uuid NOT NULL REFERENCES "cad_mapping_profiles"("id"),
  "mapping_version" integer NOT NULL DEFAULT 1,
  "source_path" varchar(500),
  "source_field" varchar(200),
  "source_value" text,
  "normalized_target" varchar(200),
  "forge_target" varchar(200),
  "neris_field_id" uuid,
  "transformation_type" varchar(40) NOT NULL DEFAULT 'DIRECT',
  "transformation_config" jsonb,
  "default_value" text,
  "condition_json" jsonb,
  "required_behavior" varchar(40),
  "unknown_behavior" varchar(40) NOT NULL DEFAULT 'QUEUE_FOR_MAPPING',
  "confidence" numeric(5, 2),
  "notes" text,
  "effective_at" timestamptz,
  "expires_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_mapping_rules_transform_chk" CHECK ("transformation_type" IN (
    'DIRECT', 'LOOKUP', 'CONCATENATE', 'DATE_TIME_PARSE', 'TIMEZONE_CONVERT',
    'BOOLEAN', 'NUMBER', 'UNIT_NORMALIZE', 'ADDRESS_PARSE', 'COORDINATE_PARSE',
    'CODE_TRANSLATE', 'CONDITIONAL', 'FALLBACK', 'IGNORE'
  )),
  CONSTRAINT "cad_mapping_rules_unknown_chk" CHECK ("unknown_behavior" IN (
    'PRESERVE', 'QUEUE_FOR_MAPPING', 'USE_DEFAULT', 'REJECT', 'WARN', 'IGNORE_WITH_REASON'
  ))
);

CREATE INDEX IF NOT EXISTS "cad_mapping_rules_profile_version_idx"
  ON "cad_mapping_rules" ("mapping_profile_id", "mapping_version");
CREATE INDEX IF NOT EXISTS "cad_mapping_rules_tenant_idx"
  ON "cad_mapping_rules" ("tenant_id");

CREATE TABLE IF NOT EXISTS "cad_mapping_value_aliases" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "mapping_profile_id" uuid NOT NULL REFERENCES "cad_mapping_profiles"("id"),
  "mapping_version" integer NOT NULL DEFAULT 1,
  "source_field" varchar(200) NOT NULL,
  "source_value" text NOT NULL,
  "normalized_value" text NOT NULL,
  "neris_value_option_id" uuid,
  "notes" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_mapping_value_aliases_uidx"
  ON "cad_mapping_value_aliases" (
    "mapping_profile_id",
    "mapping_version",
    "source_field",
    "source_value"
  );
CREATE INDEX IF NOT EXISTS "cad_mapping_value_aliases_tenant_idx"
  ON "cad_mapping_value_aliases" ("tenant_id");

CREATE TABLE IF NOT EXISTS "cad_unmapped_values" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "category" varchar(64) NOT NULL,
  "source_field" varchar(200) NOT NULL,
  "source_value" text NOT NULL,
  "normalized_context_json" jsonb,
  "occurrence_count" integer NOT NULL DEFAULT 1,
  "first_seen_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "affected_message_count" integer NOT NULL DEFAULT 1,
  "proposed_mapping_json" jsonb,
  "status" varchar(32) NOT NULL DEFAULT 'OPEN',
  "assigned_reviewer_user_id" uuid,
  "resolved_at" timestamptz,
  "resolved_by_user_id" uuid,
  "resolution_reason" text,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_unmapped_values_status_chk" CHECK ("status" IN (
    'OPEN', 'MAPPED', 'IGNORED_WITH_REASON', 'DEPRECATED', 'ESCALATED'
  )),
  CONSTRAINT "cad_unmapped_values_category_chk" CHECK ("category" IN (
    'call_type', 'call_subtype', 'priority', 'disposition', 'status',
    'unit', 'personnel', 'station', 'zone', 'agency', 'alarm_level',
    'response_plan', 'comment_category', 'other'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_unmapped_values_uidx"
  ON "cad_unmapped_values" (
    "tenant_id",
    "cad_connection_id",
    "category",
    "source_field",
    "source_value"
  );
CREATE INDEX IF NOT EXISTS "cad_unmapped_values_status_idx"
  ON "cad_unmapped_values" ("tenant_id", "status", "last_seen_at" DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cad_mapping_versions",
  "cad_mapping_rules",
  "cad_mapping_value_aliases",
  "cad_unmapped_values"
TO forge_app;

-- Nullable-tenant mapping child tables: same pattern as profiles
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cad_mapping_versions',
    'cad_mapping_rules',
    'cad_mapping_value_aliases'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (
        tenant_id IS NULL
        OR tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid
        OR current_setting(''app.bypass_rls'', true) = ''on''
      ) WITH CHECK (
        tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid
        OR current_setting(''app.bypass_rls'', true) = ''on''
      )',
      t || '_tenant_isolation', t
    );
  END LOOP;
END
$$;

ALTER TABLE "cad_unmapped_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cad_unmapped_values" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cad_unmapped_values_tenant_isolation" ON "cad_unmapped_values";
CREATE POLICY "cad_unmapped_values_tenant_isolation" ON "cad_unmapped_values"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
