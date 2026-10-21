-- 0092_industrial_printer_bridge_s1
-- Forge Printer Bridge Phase 1: bridges, printers, jobs, templates, media, batches.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_printer_bridges" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(200) NOT NULL,
  "device_id" varchar(120) NOT NULL,
  "computer_name" varchar(200),
  "location_id" uuid REFERENCES "industrial_sites"("id"),
  "division_id" uuid REFERENCES "industrial_departments"("id"),
  "os_version" varchar(120),
  "bridge_version" varchar(64),
  "status" varchar(32) NOT NULL DEFAULT 'PAIRING',
  "last_seen_at" timestamptz,
  "registered_at" timestamptz,
  "registered_by" uuid REFERENCES "users"("id"),
  "certificate_thumbprint" varchar(128),
  "device_public_key" text,
  "remote_ip" varchar(64),
  "auto_update_enabled" boolean NOT NULL DEFAULT true,
  "enabled" boolean NOT NULL DEFAULT true,
  "access_token_hash" varchar(128),
  "pairing_code_hash" varchar(128),
  "pairing_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_printer_bridges_device_uidx"
  ON "industrial_printer_bridges" ("tenant_id", "device_id");
CREATE INDEX IF NOT EXISTS "industrial_printer_bridges_tenant_idx"
  ON "industrial_printer_bridges" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_printer_bridges_location_idx"
  ON "industrial_printer_bridges" ("tenant_id", "location_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_printer_bridges" TO forge_app;
ALTER TABLE "industrial_printer_bridges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_printer_bridges" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_printer_bridges_tenant_isolation" ON "industrial_printer_bridges";
CREATE POLICY "industrial_printer_bridges_tenant_isolation" ON "industrial_printer_bridges"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_printers" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "bridge_id" uuid REFERENCES "industrial_printer_bridges"("id") ON DELETE SET NULL,
  "name" varchar(200) NOT NULL,
  "display_name" varchar(300),
  "manufacturer" varchar(120),
  "model" varchar(120),
  "serial_number" varchar(120),
  "connection_type" varchar(64),
  "transport_type" varchar(64),
  "windows_queue_name" varchar(300),
  "device_identifier" varchar(200),
  "bluetooth_device_id" varchar(200),
  "bluetooth_saved_id" varchar(200),
  "ip_address" varchar(64),
  "mac_address" varchar(64),
  "dpi" integer,
  "max_print_width_inches" double precision,
  "supports_bitmap" boolean NOT NULL DEFAULT true,
  "supports_cut" boolean NOT NULL DEFAULT false,
  "supports_feed" boolean NOT NULL DEFAULT true,
  "supports_multiple_copies" boolean NOT NULL DEFAULT true,
  "location_id" uuid REFERENCES "industrial_sites"("id"),
  "division_id" uuid REFERENCES "industrial_departments"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "online" boolean NOT NULL DEFAULT false,
  "connected" boolean NOT NULL DEFAULT false,
  "ready" boolean NOT NULL DEFAULT false,
  "is_default" boolean NOT NULL DEFAULT false,
  "enabled" boolean NOT NULL DEFAULT true,
  "last_seen_at" timestamptz,
  "last_error_code" varchar(64),
  "last_error_message" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_printers_tenant_idx"
  ON "industrial_printers" ("tenant_id", "enabled");
CREATE INDEX IF NOT EXISTS "industrial_printers_bridge_idx"
  ON "industrial_printers" ("tenant_id", "bridge_id");
CREATE INDEX IF NOT EXISTS "industrial_printers_location_idx"
  ON "industrial_printers" ("tenant_id", "location_id");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_printers_device_uidx"
  ON "industrial_printers" ("tenant_id", "bridge_id", "device_identifier");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_printers" TO forge_app;
ALTER TABLE "industrial_printers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_printers" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_printers_tenant_isolation" ON "industrial_printers";
CREATE POLICY "industrial_printers_tenant_isolation" ON "industrial_printers"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_label_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "code" varchar(120) NOT NULL,
  "name" varchar(300) NOT NULL,
  "category" varchar(120) NOT NULL DEFAULT 'Custom Labels',
  "description" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_label_templates_code_uidx"
  ON "industrial_label_templates" ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "industrial_label_templates_tenant_idx"
  ON "industrial_label_templates" ("tenant_id", "category", "enabled");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_label_templates" TO forge_app;
ALTER TABLE "industrial_label_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_label_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_label_templates_tenant_isolation" ON "industrial_label_templates";
CREATE POLICY "industrial_label_templates_tenant_isolation" ON "industrial_label_templates"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_label_template_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "template_id" uuid NOT NULL REFERENCES "industrial_label_templates"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "layout_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "dpi" integer NOT NULL DEFAULT 300,
  "width_inches" double precision NOT NULL,
  "height_inches" double precision NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_label_template_versions_uidx"
  ON "industrial_label_template_versions" ("template_id", "version");
CREATE INDEX IF NOT EXISTS "industrial_label_template_versions_tenant_idx"
  ON "industrial_label_template_versions" ("tenant_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_label_template_versions" TO forge_app;
ALTER TABLE "industrial_label_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_label_template_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_label_template_versions_tenant_isolation" ON "industrial_label_template_versions";
CREATE POLICY "industrial_label_template_versions_tenant_isolation" ON "industrial_label_template_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_label_template_fields" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "template_version_id" uuid NOT NULL REFERENCES "industrial_label_template_versions"("id") ON DELETE CASCADE,
  "field_key" varchar(120) NOT NULL,
  "field_type" varchar(64) NOT NULL,
  "label" varchar(300),
  "required" boolean NOT NULL DEFAULT false,
  "default_value" text,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_label_template_fields_uidx"
  ON "industrial_label_template_fields" ("template_version_id", "field_key");
CREATE INDEX IF NOT EXISTS "industrial_label_template_fields_tenant_idx"
  ON "industrial_label_template_fields" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_label_template_fields" TO forge_app;
ALTER TABLE "industrial_label_template_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_label_template_fields" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_label_template_fields_tenant_isolation" ON "industrial_label_template_fields";
CREATE POLICY "industrial_label_template_fields_tenant_isolation" ON "industrial_label_template_fields"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_printer_media_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "manufacturer" varchar(120) NOT NULL,
  "printer_model" varchar(120) NOT NULL,
  "part_number" varchar(120),
  "name" varchar(300) NOT NULL,
  "width_inches" double precision NOT NULL,
  "height_inches" double precision NOT NULL,
  "continuous" boolean NOT NULL DEFAULT false,
  "die_cut" boolean NOT NULL DEFAULT true,
  "printable_width" double precision,
  "printable_height" double precision,
  "orientation" varchar(32),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_printer_media_profiles_tenant_idx"
  ON "industrial_printer_media_profiles" ("tenant_id", "manufacturer", "printer_model");
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_printer_media_profiles_part_uidx"
  ON "industrial_printer_media_profiles" ("tenant_id", "manufacturer", "printer_model", "part_number");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_printer_media_profiles" TO forge_app;
ALTER TABLE "industrial_printer_media_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_printer_media_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_printer_media_profiles_tenant_isolation" ON "industrial_printer_media_profiles";
CREATE POLICY "industrial_printer_media_profiles_tenant_isolation" ON "industrial_printer_media_profiles"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_printer_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "printer_id" uuid NOT NULL REFERENCES "industrial_printers"("id") ON DELETE CASCADE,
  "dpi" integer,
  "default_media_id" uuid REFERENCES "industrial_printer_media_profiles"("id") ON DELETE SET NULL,
  "default_orientation" varchar(32),
  "default_copies" integer NOT NULL DEFAULT 1,
  "default_cut_mode" varchar(32),
  "darkness" integer,
  "speed" integer,
  "x_offset" double precision,
  "y_offset" double precision,
  "preferred_transport" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_printer_profiles_printer_uidx"
  ON "industrial_printer_profiles" ("printer_id");
CREATE INDEX IF NOT EXISTS "industrial_printer_profiles_tenant_idx"
  ON "industrial_printer_profiles" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_printer_profiles" TO forge_app;
ALTER TABLE "industrial_printer_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_printer_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_printer_profiles_tenant_isolation" ON "industrial_printer_profiles";
CREATE POLICY "industrial_printer_profiles_tenant_isolation" ON "industrial_printer_profiles"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_print_batches" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "requested_by" uuid REFERENCES "users"("id"),
  "printer_id" uuid REFERENCES "industrial_printers"("id") ON DELETE SET NULL,
  "total_jobs" integer NOT NULL DEFAULT 0,
  "completed_jobs" integer NOT NULL DEFAULT 0,
  "failed_jobs" integer NOT NULL DEFAULT 0,
  "status" varchar(64) NOT NULL DEFAULT 'CREATED',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_print_batches_tenant_idx"
  ON "industrial_print_batches" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_print_batches_printer_idx"
  ON "industrial_print_batches" ("tenant_id", "printer_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_print_batches" TO forge_app;
ALTER TABLE "industrial_print_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_print_batches" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_print_batches_tenant_isolation" ON "industrial_print_batches";
CREATE POLICY "industrial_print_batches_tenant_isolation" ON "industrial_print_batches"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_print_jobs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "printer_id" uuid REFERENCES "industrial_printers"("id") ON DELETE SET NULL,
  "bridge_id" uuid REFERENCES "industrial_printer_bridges"("id") ON DELETE SET NULL,
  "batch_id" uuid REFERENCES "industrial_print_batches"("id") ON DELETE SET NULL,
  "template_id" uuid REFERENCES "industrial_label_templates"("id") ON DELETE SET NULL,
  "template_version" integer,
  "module" varchar(120),
  "record_type" varchar(120),
  "record_id" uuid,
  "requested_by" uuid REFERENCES "users"("id"),
  "requested_from_device" varchar(200),
  "copies" integer NOT NULL DEFAULT 1,
  "width_inches" double precision,
  "height_inches" double precision,
  "dpi" integer,
  "orientation" varchar(32),
  "cut_mode" varchar(32),
  "artifact_type" varchar(64),
  "artifact_storage_key" text,
  "artifact_sha256" varchar(64),
  "status" varchar(64) NOT NULL DEFAULT 'CREATED',
  "priority" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "queued_at" timestamptz,
  "delivered_at" timestamptz,
  "received_at" timestamptz,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "failed_at" timestamptz,
  "expires_at" timestamptz,
  "retry_count" integer NOT NULL DEFAULT 0,
  "parent_job_id" uuid REFERENCES "industrial_print_jobs"("id") ON DELETE SET NULL,
  "reprint_reason" text,
  "error_code" varchar(64),
  "error_message" text
);
CREATE INDEX IF NOT EXISTS "industrial_print_jobs_tenant_status_idx"
  ON "industrial_print_jobs" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_print_jobs_printer_idx"
  ON "industrial_print_jobs" ("tenant_id", "printer_id");
CREATE INDEX IF NOT EXISTS "industrial_print_jobs_bridge_idx"
  ON "industrial_print_jobs" ("tenant_id", "bridge_id");
CREATE INDEX IF NOT EXISTS "industrial_print_jobs_batch_idx"
  ON "industrial_print_jobs" ("tenant_id", "batch_id");
CREATE INDEX IF NOT EXISTS "industrial_print_jobs_record_idx"
  ON "industrial_print_jobs" ("tenant_id", "module", "record_type", "record_id");
CREATE INDEX IF NOT EXISTS "industrial_print_jobs_parent_idx"
  ON "industrial_print_jobs" ("parent_job_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_print_jobs" TO forge_app;
ALTER TABLE "industrial_print_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_print_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_print_jobs_tenant_isolation" ON "industrial_print_jobs";
CREATE POLICY "industrial_print_jobs_tenant_isolation" ON "industrial_print_jobs"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_print_job_events" (
  "id" uuid PRIMARY KEY,
  "print_job_id" uuid NOT NULL REFERENCES "industrial_print_jobs"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "event" varchar(120) NOT NULL,
  "status" varchar(64),
  "message" text,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_print_job_events_job_idx"
  ON "industrial_print_job_events" ("print_job_id", "created_at");
CREATE INDEX IF NOT EXISTS "industrial_print_job_events_tenant_idx"
  ON "industrial_print_job_events" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_print_job_events" TO forge_app;
ALTER TABLE "industrial_print_job_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_print_job_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_print_job_events_tenant_isolation" ON "industrial_print_job_events";
CREATE POLICY "industrial_print_job_events_tenant_isolation" ON "industrial_print_job_events"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_bridge_pairing_codes" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "code_hash" varchar(128) NOT NULL,
  "code_display" varchar(32) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_by" uuid REFERENCES "users"("id"),
  "consumed_at" timestamptz,
  "bridge_id" uuid REFERENCES "industrial_printer_bridges"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_bridge_pairing_codes_hash_uidx"
  ON "industrial_bridge_pairing_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "industrial_bridge_pairing_codes_tenant_idx"
  ON "industrial_bridge_pairing_codes" ("tenant_id", "expires_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_bridge_pairing_codes" TO forge_app;
ALTER TABLE "industrial_bridge_pairing_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_bridge_pairing_codes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_bridge_pairing_codes_tenant_isolation" ON "industrial_bridge_pairing_codes";
CREATE POLICY "industrial_bridge_pairing_codes_tenant_isolation" ON "industrial_bridge_pairing_codes"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Default Brady i4311 media profile is NOT tenant-specific.
-- Skip global seed; seed per-tenant at bridge/printer provisioning time if needed.
-- Example (do not run globally):
-- INSERT INTO industrial_printer_media_profiles (...) VALUES (..., 'Brady', 'i4311', ...);

-- Permissions (mirrored in @forge/contracts INDUSTRIAL_PERMISSIONS when contracts are updated)
INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.printer.view', 'View printers', 'View printers, bridges, and print job status', 'NORMAL', false),
  ('industrial.printer.print', 'Print labels', 'Submit print jobs to registered printers', 'NORMAL', false),
  ('industrial.printer.quick_print', 'Quick print', 'Use quick-print flows for common label jobs', 'NORMAL', false),
  ('industrial.printer.reprint', 'Reprint jobs', 'Reprint previously completed or failed print jobs', 'NORMAL', false),
  ('industrial.printer.cancel', 'Cancel print jobs', 'Cancel queued or in-progress print jobs', 'NORMAL', false),
  ('industrial.printer.manage', 'Manage printers', 'Create, edit, enable, and disable printers', 'ELEVATED', false),
  ('industrial.printer.manage_defaults', 'Manage printer defaults', 'Configure default printers and routing preferences', 'ELEVATED', false),
  ('industrial.printer.manage_media', 'Manage media profiles', 'Create and edit printer media and supply profiles', 'ELEVATED', false),
  ('industrial.printer.manage_templates', 'Manage label templates', 'Create, version, and publish label templates', 'ELEVATED', false),
  ('industrial.printer.manage_bridge', 'Manage printer bridges', 'Register, enable, disable, and remove printer bridges', 'ELEVATED', true),
  ('industrial.printer.pair_bluetooth', 'Pair Bluetooth printers', 'Initiate Bluetooth pairing for mobile printers', 'ELEVATED', false),
  ('industrial.printer.view_logs', 'View print logs', 'View print job events and bridge diagnostics logs', 'NORMAL', false),
  ('industrial.printer.run_diagnostics', 'Run printer diagnostics', 'Run bridge and printer diagnostic checks', 'ELEVATED', false)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.printer.view',
  'industrial.printer.print',
  'industrial.printer.quick_print',
  'industrial.printer.reprint',
  'industrial.printer.cancel',
  'industrial.printer.manage',
  'industrial.printer.manage_defaults',
  'industrial.printer.manage_media',
  'industrial.printer.manage_templates',
  'industrial.printer.manage_bridge',
  'industrial.printer.pair_bluetooth',
  'industrial.printer.view_logs',
  'industrial.printer.run_diagnostics'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.printer.view',
  'industrial.printer.print',
  'industrial.printer.quick_print',
  'industrial.printer.reprint',
  'industrial.printer.cancel',
  'industrial.printer.manage',
  'industrial.printer.manage_defaults',
  'industrial.printer.manage_media',
  'industrial.printer.manage_templates',
  'industrial.printer.manage_bridge',
  'industrial.printer.pair_bluetooth',
  'industrial.printer.view_logs',
  'industrial.printer.run_diagnostics'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id"
    AND existing."permission_id" = p."id"
);

-- Public bridge auth lookup (SECURITY DEFINER) for pairing + device token resolution.
CREATE OR REPLACE FUNCTION forge_industrial_printer_bridge_tenant_for_pairing_code(p_code_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_code_hash IS NULL OR length(p_code_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_bridge_pairing_codes
  WHERE code_hash = p_code_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_printer_bridge_tenant_for_pairing_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_printer_bridge_tenant_for_pairing_code(text) TO forge_app;

CREATE OR REPLACE FUNCTION forge_industrial_printer_bridge_tenant_for_device_token(
  p_device_id text,
  p_token_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 1 THEN
    RETURN NULL;
  END IF;
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_printer_bridges
  WHERE device_id = p_device_id
    AND access_token_hash = p_token_hash
    AND enabled = true
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_printer_bridge_tenant_for_device_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_printer_bridge_tenant_for_device_token(text, text) TO forge_app;
