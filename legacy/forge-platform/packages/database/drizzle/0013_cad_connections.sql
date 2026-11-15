-- NERIS Phase 4A: CAD connections + tenant CAD configuration extensions.
-- Forward-safe. Does not touch application DB secret or Aurora cluster.
-- FORCE RLS on all new tenant-scoped tables.

-- ---------------------------------------------------------------------------
-- Tenant NERIS configuration: CAD behavioral settings
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant_neris_configuration"
  ADD COLUMN IF NOT EXISTS "allow_manual_creation_when_cad_enabled" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "manual_override_requires_reason" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "manual_override_permission" varchar(120) NOT NULL DEFAULT 'rms.cad.incident.manual_override',
  ADD COLUMN IF NOT EXISTS "cad_update_cutoff_policy" varchar(64) NOT NULL DEFAULT 'UNTIL_FINALIZED',
  ADD COLUMN IF NOT EXISTS "duplicate_match_threshold" integer NOT NULL DEFAULT 95,
  ADD COLUMN IF NOT EXISTS "possible_duplicate_threshold" integer NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS "auto_link_threshold" integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "require_match_review" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "preserve_cad_comments" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "caller_data_retention_days" integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "raw_payload_retention_days" integer NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS "cad_quiet_hours_json" jsonb,
  ADD COLUMN IF NOT EXISTS "cad_expected_operating_window_json" jsonb;

ALTER TABLE "tenant_neris_configuration"
  DROP CONSTRAINT IF EXISTS "tenant_neris_configuration_cad_cutoff_chk";
ALTER TABLE "tenant_neris_configuration"
  ADD CONSTRAINT "tenant_neris_configuration_cad_cutoff_chk"
  CHECK ("cad_update_cutoff_policy" IN (
    'UNTIL_INCIDENT_CLOSED',
    'UNTIL_OFFICER_REVIEW',
    'UNTIL_FINALIZED',
    'FIXED_TIME_AFTER_CLEAR',
    'MANUAL_STOP'
  ));

ALTER TABLE "tenant_neris_configuration"
  DROP CONSTRAINT IF EXISTS "tenant_neris_configuration_match_thresholds_chk";
ALTER TABLE "tenant_neris_configuration"
  ADD CONSTRAINT "tenant_neris_configuration_match_thresholds_chk"
  CHECK (
    "duplicate_match_threshold" BETWEEN 0 AND 100
    AND "possible_duplicate_threshold" BETWEEN 0 AND 100
    AND "auto_link_threshold" BETWEEN 0 AND 100
  );

-- ---------------------------------------------------------------------------
-- Mapping profiles (created before connections FK)
-- Global templates: tenant_id NULL. Tenant copies: tenant_id set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cad_mapping_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "vendor" varchar(120) NOT NULL,
  "adapter_key" varchar(120) NOT NULL,
  "source_version" varchar(64) NOT NULL DEFAULT '*',
  "name" varchar(200) NOT NULL,
  "description" text,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "current_version" integer NOT NULL DEFAULT 1,
  "published_at" timestamptz,
  "deprecated_at" timestamptz,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_mapping_profiles_status_chk" CHECK ("status" IN (
    'DRAFT', 'TESTING', 'PUBLISHED', 'DEPRECATED', 'ARCHIVED'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_mapping_profiles_tenant_name_uidx"
  ON "cad_mapping_profiles" ("tenant_id", "name")
  WHERE "tenant_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "cad_mapping_profiles_global_name_uidx"
  ON "cad_mapping_profiles" ("vendor", "adapter_key", "name")
  WHERE "tenant_id" IS NULL;
CREATE INDEX IF NOT EXISTS "cad_mapping_profiles_tenant_idx"
  ON "cad_mapping_profiles" ("tenant_id");
CREATE INDEX IF NOT EXISTS "cad_mapping_profiles_adapter_idx"
  ON "cad_mapping_profiles" ("adapter_key", "status");

-- ---------------------------------------------------------------------------
-- CAD connections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "cad_connections" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "public_id" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL,
  "description" text,
  "vendor" varchar(120) NOT NULL,
  "adapter_key" varchar(120) NOT NULL,
  "adapter_version" varchar(64) NOT NULL,
  "environment" varchar(32) NOT NULL,
  "transport_type" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "intake_mode" varchar(32) NOT NULL DEFAULT 'MANUAL_ONLY',
  "configuration_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "mapping_profile_id" uuid REFERENCES "cad_mapping_profiles"("id"),
  "credentials_secret_arn" text,
  "webhook_secret_arn" text,
  "webhook_key_id" varchar(64),
  "polling_interval_seconds" integer,
  "polling_cursor" text,
  "polling_watermark" timestamptz,
  "expected_operating_window_json" jsonb,
  "quiet_hours_json" jsonb,
  "health_status" varchar(32) NOT NULL DEFAULT 'UNKNOWN',
  "last_connected_at" timestamptz,
  "last_message_at" timestamptz,
  "last_success_at" timestamptz,
  "last_failure_at" timestamptz,
  "last_error_code" varchar(80),
  "last_error_summary" text,
  "enabled_at" timestamptz,
  "disabled_at" timestamptz,
  "archived_at" timestamptz,
  "archived_by_user_id" uuid,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_by_user_id" uuid NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_connections_status_chk" CHECK ("status" IN (
    'DRAFT', 'CONFIGURED', 'TESTING', 'ACTIVE', 'DEGRADED', 'DISABLED', 'ERROR', 'ARCHIVED'
  )),
  CONSTRAINT "cad_connections_health_chk" CHECK ("health_status" IN (
    'UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY'
  )),
  CONSTRAINT "cad_connections_environment_chk" CHECK ("environment" IN (
    'SIMULATOR', 'DEVELOPMENT', 'TEST', 'STAGING', 'PRODUCTION'
  )),
  CONSTRAINT "cad_connections_intake_mode_chk" CHECK ("intake_mode" IN (
    'MANUAL_ONLY', 'CAD_ENABLED', 'HYBRID'
  )),
  CONSTRAINT "cad_connections_polling_interval_chk" CHECK (
    "polling_interval_seconds" IS NULL OR "polling_interval_seconds" >= 30
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_connections_tenant_name_uidx"
  ON "cad_connections" ("tenant_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "cad_connections_public_id_uidx"
  ON "cad_connections" ("public_id");
CREATE INDEX IF NOT EXISTS "cad_connections_tenant_status_idx"
  ON "cad_connections" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "cad_connections_tenant_health_idx"
  ON "cad_connections" ("tenant_id", "health_status");

-- Webhook key rotation metadata (secret values live in Secrets Manager only)
CREATE TABLE IF NOT EXISTS "cad_webhook_keys" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "cad_connection_id" uuid NOT NULL REFERENCES "cad_connections"("id"),
  "key_id" varchar(64) NOT NULL,
  "secret_arn" text NOT NULL,
  "role" varchar(32) NOT NULL DEFAULT 'CURRENT',
  "active_from" timestamptz NOT NULL DEFAULT now(),
  "active_until" timestamptz,
  "rotated_by_user_id" uuid,
  "rotation_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cad_webhook_keys_role_chk" CHECK ("role" IN ('CURRENT', 'NEXT', 'PREVIOUS'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cad_webhook_keys_connection_key_uidx"
  ON "cad_webhook_keys" ("cad_connection_id", "key_id");
CREATE INDEX IF NOT EXISTS "cad_webhook_keys_tenant_idx"
  ON "cad_webhook_keys" ("tenant_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON
  "cad_mapping_profiles",
  "cad_connections",
  "cad_webhook_keys"
TO forge_app;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cad_connections',
    'cad_webhook_keys'
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

-- Mapping profiles: allow reading global templates (tenant_id IS NULL);
-- writes to tenant-owned rows only via WITH CHECK.
ALTER TABLE "cad_mapping_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cad_mapping_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cad_mapping_profiles_tenant_isolation" ON "cad_mapping_profiles";
CREATE POLICY "cad_mapping_profiles_tenant_isolation" ON "cad_mapping_profiles"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );
