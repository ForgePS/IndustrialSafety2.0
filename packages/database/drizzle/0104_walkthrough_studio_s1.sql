-- 0104_walkthrough_studio_s1
-- Walkthrough Studio entities, demo tenant flag, and studio permissions.

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "is_demo_tenant" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "walkthroughs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "code" varchar(120) NOT NULL,
  "name" varchar(300) NOT NULL,
  "description" text,
  "product_code" varchar(64) NOT NULL DEFAULT 'FORGE_INDUSTRIAL',
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "default_voice_profile_id" varchar(120),
  "published_version" varchar(32),
  "last_generated_at" timestamptz,
  "interactive_status" varchar(32) NOT NULL DEFAULT 'ready',
  "mp4_status" varchar(32) NOT NULL DEFAULT 'none',
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthroughs_tenant_code_uidx" ON "walkthroughs" ("tenant_id", "code");
CREATE INDEX IF NOT EXISTS "walkthroughs_tenant_status_idx" ON "walkthroughs" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "walkthrough_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "version" varchar(32) NOT NULL,
  "script_version" varchar(64) NOT NULL,
  "definition_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "voice_profile_id" varchar(120),
  "narration_speed" integer NOT NULL DEFAULT 100,
  "runtime_ms" integer,
  "published_at" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_versions_uidx" ON "walkthrough_versions" ("walkthrough_id", "version");
CREATE INDEX IF NOT EXISTS "walkthrough_versions_tenant_idx" ON "walkthrough_versions" ("tenant_id");

CREATE TABLE IF NOT EXISTS "walkthrough_chapters" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "version_id" uuid REFERENCES "walkthrough_versions"("id") ON DELETE CASCADE,
  "chapter_key" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "target_duration_ms" integer NOT NULL DEFAULT 20000,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_chapters_uidx" ON "walkthrough_chapters" ("walkthrough_id", "version_id", "chapter_key");
CREATE INDEX IF NOT EXISTS "walkthrough_chapters_tenant_idx" ON "walkthrough_chapters" ("tenant_id");

CREATE TABLE IF NOT EXISTS "walkthrough_scenes" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "chapter_id" uuid NOT NULL REFERENCES "walkthrough_chapters"("id") ON DELETE CASCADE,
  "scene_key" varchar(80) NOT NULL,
  "name" varchar(200) NOT NULL,
  "module_code" varchar(80),
  "route" varchar(400) NOT NULL,
  "duration_ms" integer NOT NULL DEFAULT 20000,
  "narration_text" text NOT NULL DEFAULT '',
  "caption_text" text,
  "voice_profile_id" varchar(120),
  "voice_speed" integer NOT NULL DEFAULT 100,
  "target_selector" varchar(120),
  "secondary_selectors" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "actions_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "transition_type" varchar(32) NOT NULL DEFAULT 'direct',
  "transition_duration_ms" integer NOT NULL DEFAULT 350,
  "pause_before_ms" integer NOT NULL DEFAULT 0,
  "pause_after_ms" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_scenes_uidx" ON "walkthrough_scenes" ("chapter_id", "scene_key");
CREATE INDEX IF NOT EXISTS "walkthrough_scenes_tenant_idx" ON "walkthrough_scenes" ("tenant_id");

CREATE TABLE IF NOT EXISTS "walkthrough_actions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "scene_id" uuid NOT NULL REFERENCES "walkthrough_scenes"("id") ON DELETE CASCADE,
  "action_type" varchar(64) NOT NULL,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "walkthrough_actions_scene_idx" ON "walkthrough_actions" ("scene_id");

CREATE TABLE IF NOT EXISTS "walkthrough_narrations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "scene_key" varchar(80) NOT NULL,
  "voice_profile_id" varchar(120) NOT NULL,
  "provider" varchar(32) NOT NULL DEFAULT 'polly',
  "text_hash" varchar(64) NOT NULL,
  "narration_text" text NOT NULL,
  "duration_ms" integer,
  "speed" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_narrations_uidx"
  ON "walkthrough_narrations" ("walkthrough_id", "scene_key", "voice_profile_id", "text_hash");
CREATE INDEX IF NOT EXISTS "walkthrough_narrations_tenant_idx" ON "walkthrough_narrations" ("tenant_id");

CREATE TABLE IF NOT EXISTS "walkthrough_voice_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "profile_key" varchar(120) NOT NULL,
  "display_name" varchar(200) NOT NULL,
  "gender" varchar(16) NOT NULL,
  "accent" varchar(80),
  "tone" varchar(200),
  "provider" varchar(32) NOT NULL DEFAULT 'polly',
  "provider_voice_id" varchar(120) NOT NULL,
  "style_instructions" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_voice_profiles_key_uidx"
  ON "walkthrough_voice_profiles" ("tenant_id", "profile_key");

CREATE TABLE IF NOT EXISTS "walkthrough_audio_assets" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "narration_id" uuid REFERENCES "walkthrough_narrations"("id") ON DELETE SET NULL,
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "scene_key" varchar(80) NOT NULL,
  "voice_profile_id" varchar(120) NOT NULL,
  "text_hash" varchar(64) NOT NULL,
  "duration_ms" integer NOT NULL,
  "storage_bucket" varchar(200),
  "storage_key" text NOT NULL,
  "content_type" varchar(120) NOT NULL DEFAULT 'audio/mpeg',
  "audio_hash" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_audio_assets_uidx"
  ON "walkthrough_audio_assets" ("walkthrough_id", "scene_key", "voice_profile_id", "text_hash");
CREATE INDEX IF NOT EXISTS "walkthrough_audio_assets_tenant_idx" ON "walkthrough_audio_assets" ("tenant_id");

CREATE TABLE IF NOT EXISTS "walkthrough_video_exports" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "version_id" uuid REFERENCES "walkthrough_versions"("id") ON DELETE SET NULL,
  "export_job_id" uuid REFERENCES "platform_jobs"("id") ON DELETE SET NULL,
  "voice_profile_id" varchar(120),
  "resolution" varchar(16) NOT NULL DEFAULT '1080p',
  "duration_ms" integer,
  "caption_mode" varchar(32) NOT NULL DEFAULT 'off',
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "file_size_bytes" integer,
  "storage_bucket" varchar(200),
  "storage_key" text,
  "content_version" varchar(64),
  "render_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "override_runtime" boolean NOT NULL DEFAULT false,
  "requested_by_user_id" uuid REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "walkthrough_video_exports_tenant_idx" ON "walkthrough_video_exports" ("tenant_id");
CREATE INDEX IF NOT EXISTS "walkthrough_video_exports_status_idx" ON "walkthrough_video_exports" ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "walkthrough_share_links" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "public_token" varchar(32) NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "pin_hash" varchar(128),
  "expires_at" timestamptz,
  "allow_interactive" boolean NOT NULL DEFAULT true,
  "allow_video_download" boolean NOT NULL DEFAULT false,
  "allow_chapter_navigation" boolean NOT NULL DEFAULT true,
  "is_revoked" boolean NOT NULL DEFAULT false,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_share_links_token_uidx" ON "walkthrough_share_links" ("token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "walkthrough_share_links_public_uidx" ON "walkthrough_share_links" ("public_token");
CREATE INDEX IF NOT EXISTS "walkthrough_share_links_tenant_idx" ON "walkthrough_share_links" ("tenant_id");

CREATE TABLE IF NOT EXISTS "walkthrough_sessions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid NOT NULL REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "share_link_id" uuid REFERENCES "walkthrough_share_links"("id") ON DELETE SET NULL,
  "mode" varchar(32) NOT NULL DEFAULT 'interactive',
  "voice_profile_id" varchar(120),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "last_chapter_key" varchar(80),
  "watch_duration_ms" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "walkthrough_sessions_tenant_idx" ON "walkthrough_sessions" ("tenant_id", "walkthrough_id");

CREATE TABLE IF NOT EXISTS "walkthrough_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "walkthrough_id" uuid REFERENCES "walkthroughs"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "walkthrough_sessions"("id") ON DELETE SET NULL,
  "event_type" varchar(64) NOT NULL,
  "chapter_key" varchar(80),
  "scene_key" varchar(80),
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "walkthrough_events_tenant_idx" ON "walkthrough_events" ("tenant_id", "event_type");
CREATE INDEX IF NOT EXISTS "walkthrough_events_walkthrough_idx" ON "walkthrough_events" ("walkthrough_id", "created_at");

CREATE TABLE IF NOT EXISTS "demo_seed_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "seed_key" varchar(80) NOT NULL DEFAULT 'default',
  "version" varchar(32) NOT NULL,
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "seeded_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "demo_seed_versions_uidx" ON "demo_seed_versions" ("tenant_id", "seed_key", "version");
CREATE INDEX IF NOT EXISTS "demo_seed_versions_active_idx" ON "demo_seed_versions" ("tenant_id", "is_active");

GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthroughs" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_versions" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_chapters" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_scenes" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_actions" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_narrations" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_voice_profiles" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_audio_assets" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_video_exports" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_share_links" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_sessions" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "walkthrough_events" TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "demo_seed_versions" TO forge_app;

ALTER TABLE "walkthroughs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthroughs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthroughs_tenant_isolation" ON "walkthroughs";
CREATE POLICY "walkthroughs_tenant_isolation" ON "walkthroughs"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_versions_tenant_isolation" ON "walkthrough_versions";
CREATE POLICY "walkthrough_versions_tenant_isolation" ON "walkthrough_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_chapters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_chapters" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_chapters_tenant_isolation" ON "walkthrough_chapters";
CREATE POLICY "walkthrough_chapters_tenant_isolation" ON "walkthrough_chapters"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_scenes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_scenes" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_scenes_tenant_isolation" ON "walkthrough_scenes";
CREATE POLICY "walkthrough_scenes_tenant_isolation" ON "walkthrough_scenes"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_actions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_actions_tenant_isolation" ON "walkthrough_actions";
CREATE POLICY "walkthrough_actions_tenant_isolation" ON "walkthrough_actions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_narrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_narrations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_narrations_tenant_isolation" ON "walkthrough_narrations";
CREATE POLICY "walkthrough_narrations_tenant_isolation" ON "walkthrough_narrations"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_voice_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_voice_profiles" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_voice_profiles_tenant_isolation" ON "walkthrough_voice_profiles";
CREATE POLICY "walkthrough_voice_profiles_tenant_isolation" ON "walkthrough_voice_profiles"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'on'
  );

ALTER TABLE "walkthrough_audio_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_audio_assets" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_audio_assets_tenant_isolation" ON "walkthrough_audio_assets";
CREATE POLICY "walkthrough_audio_assets_tenant_isolation" ON "walkthrough_audio_assets"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_video_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_video_exports" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_video_exports_tenant_isolation" ON "walkthrough_video_exports";
CREATE POLICY "walkthrough_video_exports_tenant_isolation" ON "walkthrough_video_exports"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_share_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_share_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_share_links_tenant_isolation" ON "walkthrough_share_links";
CREATE POLICY "walkthrough_share_links_tenant_isolation" ON "walkthrough_share_links"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_sessions_tenant_isolation" ON "walkthrough_sessions";
CREATE POLICY "walkthrough_sessions_tenant_isolation" ON "walkthrough_sessions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "walkthrough_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthrough_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "walkthrough_events_tenant_isolation" ON "walkthrough_events";
CREATE POLICY "walkthrough_events_tenant_isolation" ON "walkthrough_events"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "demo_seed_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "demo_seed_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "demo_seed_versions_tenant_isolation" ON "demo_seed_versions";
CREATE POLICY "demo_seed_versions_tenant_isolation" ON "demo_seed_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.walkthrough.view', 'View walkthroughs', 'View Walkthrough Studio presentations', 'NORMAL', false),
  ('industrial.walkthrough.manage', 'Manage walkthroughs', 'Create and edit walkthrough presentations', 'ELEVATED', false),
  ('industrial.walkthrough.narration.edit', 'Edit walkthrough narration', 'Edit narration scripts and voice settings', 'ELEVATED', false),
  ('industrial.walkthrough.voices.manage', 'Manage walkthrough voices', 'Configure narration voice profiles', 'ELEVATED', false),
  ('industrial.walkthrough.demo.manage', 'Manage demo tenant', 'Manage Forge Industrial Demo environment', 'ELEVATED', true),
  ('industrial.walkthrough.demo.reset', 'Reset demo tenant', 'Reset demo tenant to seed snapshot', 'ELEVATED', true),
  ('industrial.walkthrough.videos.generate', 'Generate walkthrough videos', 'Generate walkthrough MP4 exports', 'ELEVATED', false),
  ('industrial.walkthrough.videos.download', 'Download walkthrough videos', 'Download generated walkthrough MP4 files', 'ELEVATED', false),
  ('industrial.walkthrough.share.manage', 'Manage walkthrough share links', 'Create and manage shareable walkthrough links', 'ELEVATED', false),
  ('industrial.walkthrough.analytics.view', 'View walkthrough analytics', 'View walkthrough usage analytics', 'NORMAL', false)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.walkthrough.view',
  'industrial.walkthrough.manage',
  'industrial.walkthrough.narration.edit',
  'industrial.walkthrough.voices.manage',
  'industrial.walkthrough.demo.manage',
  'industrial.walkthrough.demo.reset',
  'industrial.walkthrough.videos.generate',
  'industrial.walkthrough.videos.download',
  'industrial.walkthrough.share.manage',
  'industrial.walkthrough.analytics.view'
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
  'industrial.walkthrough.view',
  'industrial.walkthrough.manage',
  'industrial.walkthrough.narration.edit',
  'industrial.walkthrough.voices.manage',
  'industrial.walkthrough.demo.manage',
  'industrial.walkthrough.demo.reset',
  'industrial.walkthrough.videos.generate',
  'industrial.walkthrough.videos.download',
  'industrial.walkthrough.share.manage',
  'industrial.walkthrough.analytics.view'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id"
    AND existing."permission_id" = p."id"
);
