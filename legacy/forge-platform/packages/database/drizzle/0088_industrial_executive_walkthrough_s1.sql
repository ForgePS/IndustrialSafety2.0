-- 0088_industrial_executive_walkthrough_s1
-- Presentation settings, narration cache, and short-lived render tokens.

CREATE TABLE IF NOT EXISTS "industrial_executive_walkthrough_settings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "enabled" boolean NOT NULL DEFAULT true,
  "voice_id" varchar(120) NOT NULL DEFAULT 'Joanna',
  "narration_speed" integer NOT NULL DEFAULT 100,
  "captions_default" boolean NOT NULL DEFAULT true,
  "include_intro" boolean NOT NULL DEFAULT true,
  "include_outro" boolean NOT NULL DEFAULT true,
  "export_resolution" varchar(16) NOT NULL DEFAULT '1080p',
  "retention_days" integer,
  "closing_text" text,
  "scene_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_exec_walkthrough_settings_tenant_uidx"
  ON "industrial_executive_walkthrough_settings" ("tenant_id");

CREATE TABLE IF NOT EXISTS "industrial_executive_walkthrough_narration" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "scene_id" varchar(80) NOT NULL,
  "content_version" varchar(64) NOT NULL,
  "voice_id" varchar(120) NOT NULL,
  "text_hash" varchar(64) NOT NULL,
  "duration_ms" integer NOT NULL,
  "storage_bucket" varchar(200),
  "storage_key" text NOT NULL,
  "content_type" varchar(120) NOT NULL DEFAULT 'audio/mpeg',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_exec_walkthrough_narration_uidx"
  ON "industrial_executive_walkthrough_narration" ("tenant_id", "scene_id", "content_version", "voice_id");
CREATE INDEX IF NOT EXISTS "industrial_exec_walkthrough_narration_tenant_idx"
  ON "industrial_executive_walkthrough_narration" ("tenant_id");

CREATE TABLE IF NOT EXISTS "industrial_executive_walkthrough_render_tokens" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "export_job_id" uuid NOT NULL REFERENCES "platform_jobs"("id") ON DELETE CASCADE,
  "token_hash" varchar(128) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "used_at" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_exec_walkthrough_render_token_uidx"
  ON "industrial_executive_walkthrough_render_tokens" ("token_hash");
CREATE INDEX IF NOT EXISTS "industrial_exec_walkthrough_render_token_job_idx"
  ON "industrial_executive_walkthrough_render_tokens" ("export_job_id");
CREATE INDEX IF NOT EXISTS "industrial_exec_walkthrough_render_token_expires_idx"
  ON "industrial_executive_walkthrough_render_tokens" ("expires_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_executive_walkthrough_settings" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_executive_walkthrough_narration" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_executive_walkthrough_render_tokens" TO forge_app;

ALTER TABLE "industrial_executive_walkthrough_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_executive_walkthrough_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_executive_walkthrough_settings_tenant_isolation"
  ON "industrial_executive_walkthrough_settings";
CREATE POLICY "industrial_executive_walkthrough_settings_tenant_isolation"
  ON "industrial_executive_walkthrough_settings"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_executive_walkthrough_narration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_executive_walkthrough_narration" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_executive_walkthrough_narration_tenant_isolation"
  ON "industrial_executive_walkthrough_narration";
CREATE POLICY "industrial_executive_walkthrough_narration_tenant_isolation"
  ON "industrial_executive_walkthrough_narration"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_executive_walkthrough_render_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_executive_walkthrough_render_tokens" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_executive_walkthrough_render_tokens_tenant_isolation"
  ON "industrial_executive_walkthrough_render_tokens";
CREATE POLICY "industrial_executive_walkthrough_render_tokens_tenant_isolation"
  ON "industrial_executive_walkthrough_render_tokens"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Public render-token lookup (SECURITY DEFINER) for headless Chromium sessions.
CREATE OR REPLACE FUNCTION forge_industrial_exec_walkthrough_tenant_for_render_token(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_executive_walkthrough_render_tokens
  WHERE token_hash = p_token_hash
    AND used_at IS NULL
    AND expires_at > now()
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_exec_walkthrough_tenant_for_render_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_exec_walkthrough_tenant_for_render_token(text) TO forge_app;

-- Permissions (mirrored in @forge/contracts INDUSTRIAL_PERMISSIONS)
INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.presentation.executive.view', 'View executive walkthrough', 'Launch and view the Producers Rice Mill executive presentation', 'NORMAL', false),
  ('industrial.presentation.executive.manage', 'Manage executive walkthrough', 'Configure executive walkthrough settings and scenes', 'ELEVATED', false),
  ('industrial.presentation.executive.export', 'Export executive walkthrough', 'Generate and download executive walkthrough MP4 exports', 'ELEVATED', false),
  ('industrial.presentation.executive.delete_export', 'Delete executive walkthrough exports', 'Delete previously generated walkthrough MP4 exports', 'ELEVATED', true)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.presentation.executive.view',
  'industrial.presentation.executive.manage',
  'industrial.presentation.executive.export',
  'industrial.presentation.executive.delete_export'
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
  'industrial.presentation.executive.view',
  'industrial.presentation.executive.manage',
  'industrial.presentation.executive.export',
  'industrial.presentation.executive.delete_export'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id"
    AND existing."permission_id" = p."id"
);
