-- Industrial Emergency Alerts S0: mass-notification foundation (SMS / Mvix CAP / in-app).
-- Additive. Tenant RLS. Spec: docs/industrial/EMERGENCY-ALERTING-SMS-MVIX-SYSTEM.md

CREATE TABLE IF NOT EXISTS "industrial_emergency_alerts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_number" varchar(64) NOT NULL,
  "alert_type" varchar(64) NOT NULL DEFAULT 'GENERAL',
  "severity" varchar(32) NOT NULL DEFAULT 'SEVERE',
  "headline" varchar(300) NOT NULL,
  "short_message" varchar(500) NOT NULL,
  "detailed_message" text,
  "instructions" text,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "is_drill" boolean NOT NULL DEFAULT false,
  "requires_acknowledgment" boolean NOT NULL DEFAULT false,
  "audience_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "channels_json" jsonb NOT NULL DEFAULT '["SMS","IN_APP","MVIX"]'::jsonb,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "approved_by_user_id" uuid REFERENCES "users"("id"),
  "issued_at" timestamptz,
  "effective_at" timestamptz,
  "expires_at" timestamptz,
  "cleared_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alerts_tenant_number_uidx"
  ON "industrial_emergency_alerts" ("tenant_id", "alert_number");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alerts_tenant_status_idx"
  ON "industrial_emergency_alerts" ("tenant_id", "status", "issued_at");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alerts_tenant_created_idx"
  ON "industrial_emergency_alerts" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_id" uuid NOT NULL REFERENCES "industrial_emergency_alerts"("id"),
  "version_number" integer NOT NULL,
  "change_type" varchar(32) NOT NULL DEFAULT 'ISSUE',
  "headline" varchar(300) NOT NULL,
  "short_message" varchar(500) NOT NULL,
  "detailed_message" text,
  "instructions" text,
  "severity" varchar(32) NOT NULL,
  "effective_at" timestamptz,
  "expires_at" timestamptz,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alert_versions_uidx"
  ON "industrial_emergency_alert_versions" ("alert_id", "version_number");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_versions_tenant_idx"
  ON "industrial_emergency_alert_versions" ("tenant_id", "alert_id");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(200) NOT NULL,
  "alert_type" varchar(64) NOT NULL DEFAULT 'GENERAL',
  "severity" varchar(32) NOT NULL DEFAULT 'SEVERE',
  "headline" varchar(300) NOT NULL,
  "short_message" varchar(500) NOT NULL,
  "detailed_message" text,
  "instructions" text,
  "channels_json" jsonb NOT NULL DEFAULT '["SMS","IN_APP","MVIX"]'::jsonb,
  "requires_acknowledgment" boolean NOT NULL DEFAULT false,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_templates_tenant_idx"
  ON "industrial_emergency_alert_templates" ("tenant_id", "enabled");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_recipients" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_id" uuid NOT NULL REFERENCES "industrial_emergency_alerts"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "personnel_id" uuid,
  "recipient_type" varchar(32) NOT NULL DEFAULT 'EMPLOYEE',
  "location_id" uuid,
  "department_id" uuid,
  "phone_number_snapshot" varchar(32),
  "sms_eligible" boolean NOT NULL DEFAULT false,
  "exclusion_reason" varchar(200),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_recipients_alert_idx"
  ON "industrial_emergency_alert_recipients" ("alert_id");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_recipients_tenant_idx"
  ON "industrial_emergency_alert_recipients" ("tenant_id", "alert_id");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_channels" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_id" uuid NOT NULL REFERENCES "industrial_emergency_alerts"("id"),
  "channel" varchar(32) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "target_count" integer NOT NULL DEFAULT 0,
  "success_count" integer NOT NULL DEFAULT 0,
  "failure_count" integer NOT NULL DEFAULT 0,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alert_channels_uidx"
  ON "industrial_emergency_alert_channels" ("alert_id", "channel");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_channels_tenant_idx"
  ON "industrial_emergency_alert_channels" ("tenant_id", "alert_id");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_deliveries" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_id" uuid NOT NULL REFERENCES "industrial_emergency_alerts"("id"),
  "alert_version_id" uuid REFERENCES "industrial_emergency_alert_versions"("id"),
  "recipient_id" uuid REFERENCES "industrial_emergency_alert_recipients"("id"),
  "channel" varchar(32) NOT NULL,
  "provider" varchar(64),
  "provider_message_id" varchar(200),
  "status" varchar(32) NOT NULL DEFAULT 'QUEUED',
  "queued_at" timestamptz,
  "sent_at" timestamptz,
  "delivered_at" timestamptz,
  "failed_at" timestamptz,
  "failure_code" varchar(64),
  "failure_reason" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_deliveries_alert_idx"
  ON "industrial_emergency_alert_deliveries" ("alert_id", "channel", "status");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_deliveries_tenant_idx"
  ON "industrial_emergency_alert_deliveries" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_acknowledgments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_id" uuid NOT NULL REFERENCES "industrial_emergency_alerts"("id"),
  "recipient_id" uuid NOT NULL REFERENCES "industrial_emergency_alert_recipients"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'ACKNOWLEDGED',
  "method" varchar(32) NOT NULL DEFAULT 'IN_APP',
  "acknowledged_at" timestamptz NOT NULL DEFAULT now(),
  "response_text" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alert_acks_uidx"
  ON "industrial_emergency_alert_acknowledgments" ("alert_id", "recipient_id");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_acks_tenant_idx"
  ON "industrial_emergency_alert_acknowledgments" ("tenant_id", "alert_id");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_cap_feeds" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "location_id" uuid,
  "public_feed_id" varchar(64) NOT NULL,
  "name" varchar(200) NOT NULL DEFAULT 'Facility CAP Feed',
  "enabled" boolean NOT NULL DEFAULT true,
  "feed_type" varchar(32) NOT NULL DEFAULT 'MVIX',
  "last_generated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alert_cap_feeds_uidx"
  ON "industrial_emergency_alert_cap_feeds" ("public_feed_id");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_cap_feeds_tenant_idx"
  ON "industrial_emergency_alert_cap_feeds" ("tenant_id", "enabled");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_mvix_mappings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "forge_location_id" uuid,
  "mvix_device_id" varchar(120),
  "mvix_device_group_id" varchar(120),
  "display_name" varchar(200) NOT NULL,
  "integration_method" varchar(32) NOT NULL DEFAULT 'CAP',
  "cap_feed_id" uuid REFERENCES "industrial_emergency_alert_cap_feeds"("id"),
  "enabled" boolean NOT NULL DEFAULT true,
  "last_status" varchar(64),
  "last_checked_at" timestamptz,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_mvix_tenant_idx"
  ON "industrial_emergency_alert_mvix_mappings" ("tenant_id", "enabled");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_settings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "sms_provider" varchar(64) NOT NULL DEFAULT 'STUB',
  "sms_enabled" boolean NOT NULL DEFAULT false,
  "mvix_enabled" boolean NOT NULL DEFAULT true,
  "in_app_enabled" boolean NOT NULL DEFAULT true,
  "require_send_confirmation" boolean NOT NULL DEFAULT true,
  "default_channels_json" jsonb NOT NULL DEFAULT '["SMS","IN_APP","MVIX"]'::jsonb,
  "settings_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_emergency_alert_settings_tenant_uidx"
  ON "industrial_emergency_alert_settings" ("tenant_id");

CREATE TABLE IF NOT EXISTS "industrial_emergency_alert_audit_logs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "alert_id" uuid REFERENCES "industrial_emergency_alerts"("id"),
  "actor_user_id" uuid REFERENCES "users"("id"),
  "action" varchar(64) NOT NULL,
  "detail_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_audit_tenant_idx"
  ON "industrial_emergency_alert_audit_logs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "industrial_emergency_alert_audit_alert_idx"
  ON "industrial_emergency_alert_audit_logs" ("alert_id", "created_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alerts" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_versions" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_templates" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_recipients" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_channels" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_deliveries" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_acknowledgments" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_cap_feeds" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_mvix_mappings" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_settings" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_emergency_alert_audit_logs" TO forge_app;

ALTER TABLE "industrial_emergency_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alerts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alerts_tenant_isolation" ON "industrial_emergency_alerts";
CREATE POLICY "industrial_emergency_alerts_tenant_isolation" ON "industrial_emergency_alerts"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_versions_tenant_isolation" ON "industrial_emergency_alert_versions";
CREATE POLICY "industrial_emergency_alert_versions_tenant_isolation" ON "industrial_emergency_alert_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_templates_tenant_isolation" ON "industrial_emergency_alert_templates";
CREATE POLICY "industrial_emergency_alert_templates_tenant_isolation" ON "industrial_emergency_alert_templates"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_recipients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_recipients_tenant_isolation" ON "industrial_emergency_alert_recipients";
CREATE POLICY "industrial_emergency_alert_recipients_tenant_isolation" ON "industrial_emergency_alert_recipients"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_channels" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_channels_tenant_isolation" ON "industrial_emergency_alert_channels";
CREATE POLICY "industrial_emergency_alert_channels_tenant_isolation" ON "industrial_emergency_alert_channels"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_deliveries_tenant_isolation" ON "industrial_emergency_alert_deliveries";
CREATE POLICY "industrial_emergency_alert_deliveries_tenant_isolation" ON "industrial_emergency_alert_deliveries"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_acknowledgments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_acknowledgments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_acks_tenant_isolation" ON "industrial_emergency_alert_acknowledgments";
CREATE POLICY "industrial_emergency_alert_acks_tenant_isolation" ON "industrial_emergency_alert_acknowledgments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_cap_feeds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_cap_feeds" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_cap_feeds_tenant_isolation" ON "industrial_emergency_alert_cap_feeds";
CREATE POLICY "industrial_emergency_alert_cap_feeds_tenant_isolation" ON "industrial_emergency_alert_cap_feeds"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_mvix_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_mvix_mappings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_mvix_tenant_isolation" ON "industrial_emergency_alert_mvix_mappings";
CREATE POLICY "industrial_emergency_alert_mvix_tenant_isolation" ON "industrial_emergency_alert_mvix_mappings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_settings_tenant_isolation" ON "industrial_emergency_alert_settings";
CREATE POLICY "industrial_emergency_alert_settings_tenant_isolation" ON "industrial_emergency_alert_settings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_emergency_alert_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_emergency_alert_audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_emergency_alert_audit_tenant_isolation" ON "industrial_emergency_alert_audit_logs";
CREATE POLICY "industrial_emergency_alert_audit_tenant_isolation" ON "industrial_emergency_alert_audit_logs"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Permissions (also mirrored in @forge/contracts INDUSTRIAL_PERMISSIONS)
INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.emergency_alerts.view', 'View emergency alerts', 'View emergency alert dashboard, active alerts, and history', 'NORMAL', false),
  ('industrial.emergency_alerts.create', 'Create emergency alerts', 'Draft emergency alerts and compose messages', 'ELEVATED', false),
  ('industrial.emergency_alerts.send', 'Send emergency alerts', 'Broadcast emergency alerts to configured channels', 'CRITICAL', true),
  ('industrial.emergency_alerts.update', 'Update emergency alerts', 'Issue updates to active emergency alerts', 'ELEVATED', true),
  ('industrial.emergency_alerts.clear', 'Clear emergency alerts', 'Issue all-clear for active emergency alerts', 'ELEVATED', true),
  ('industrial.emergency_alerts.cancel', 'Cancel emergency alerts', 'Cancel draft or pending emergency alerts', 'ELEVATED', false),
  ('industrial.emergency_alerts.approve', 'Approve emergency alerts', 'Approve alerts that require dual authorization', 'CRITICAL', true),
  ('industrial.emergency_alerts.resend', 'Resend emergency alerts', 'Resend failed or selected deliveries', 'ELEVATED', true),
  ('industrial.emergency_alerts.view_delivery', 'View alert delivery', 'View delivery and acknowledgment status', 'NORMAL', false),
  ('industrial.emergency_alerts.manage_templates', 'Manage alert templates', 'Create and edit emergency alert templates', 'ELEVATED', false),
  ('industrial.emergency_alerts.manage_groups', 'Manage alert groups', 'Manage emergency alert audience groups', 'ELEVATED', false),
  ('industrial.emergency_alerts.manage_mvix', 'Manage Mvix displays', 'Manage Mvix CAP feeds and display mappings', 'ELEVATED', false),
  ('industrial.emergency_alerts.manage_settings', 'Manage alert settings', 'Configure SMS and emergency alert tenant settings', 'ELEVATED', true),
  ('industrial.emergency_alerts.run_drills', 'Run alert drills', 'Send drill or test emergency alerts', 'ELEVATED', false),
  ('industrial.emergency_alerts.admin', 'Administer emergency alerts', 'Full administration of the Emergency Alerts module', 'CRITICAL', true)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);
