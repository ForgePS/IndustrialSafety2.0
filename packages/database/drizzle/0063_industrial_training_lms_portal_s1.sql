-- 0063_industrial_training_lms_portal_s1
-- LMS portal: access links, course versions, sections, progress, canonical completions.
-- Additive. Tenant RLS. Model A only.

-- ---------------------------------------------------------------------------
-- Access links (company portal + course-specific)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "industrial_training_access_links" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "link_type" varchar(32) NOT NULL DEFAULT 'COMPANY_PORTAL',
  "title" varchar(300) NOT NULL,
  "description" text,
  "source_id" uuid REFERENCES "industrial_training_sources"("id") ON DELETE SET NULL,
  "assignment_id" uuid REFERENCES "industrial_training_assignments"("id") ON DELETE SET NULL,
  "site_id" uuid REFERENCES "industrial_sites"("id") ON DELETE SET NULL,
  "department_id" uuid REFERENCES "industrial_departments"("id") ON DELETE SET NULL,
  "public_token_hash" varchar(128),
  "public_token_issued_at" timestamptz,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "expires_at" timestamptz,
  "allow_self_enrollment" boolean NOT NULL DEFAULT false,
  "assigned_only" boolean NOT NULL DEFAULT true,
  "policy_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_access_links_token_uidx"
  ON "industrial_training_access_links" ("public_token_hash")
  WHERE "public_token_hash" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "industrial_training_access_links_tenant_idx"
  ON "industrial_training_access_links" ("tenant_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_access_links" TO forge_app;
ALTER TABLE "industrial_training_access_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_access_links" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_access_links_tenant_isolation" ON "industrial_training_access_links";
CREATE POLICY "industrial_training_access_links_tenant_isolation" ON "industrial_training_access_links"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION forge_industrial_training_tenant_for_access_link(p_token_hash text)
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
  FROM industrial_training_access_links
  WHERE public_token_hash = p_token_hash
    AND archived_at IS NULL
    AND status = 'ACTIVE'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;
REVOKE ALL ON FUNCTION forge_industrial_training_tenant_for_access_link(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_training_tenant_for_access_link(text) TO forge_app;

-- ---------------------------------------------------------------------------
-- Course versions (immutable once completions exist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "industrial_training_course_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id") ON DELETE CASCADE,
  "version_number" integer NOT NULL DEFAULT 1,
  "version_label" varchar(120),
  "effective_date" date,
  "passing_percent" integer NOT NULL DEFAULT 70,
  "quiz_policy_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  "published_at" timestamptz,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_course_versions_uidx"
  ON "industrial_training_course_versions" ("source_id", "version_number");
CREATE INDEX IF NOT EXISTS "industrial_training_course_versions_tenant_idx"
  ON "industrial_training_course_versions" ("tenant_id", "source_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_course_versions" TO forge_app;
ALTER TABLE "industrial_training_course_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_course_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_course_versions_tenant_isolation" ON "industrial_training_course_versions";
CREATE POLICY "industrial_training_course_versions_tenant_isolation" ON "industrial_training_course_versions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_course_sections" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "version_id" uuid NOT NULL REFERENCES "industrial_training_course_versions"("id") ON DELETE CASCADE,
  "title" varchar(300) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "required" boolean NOT NULL DEFAULT true,
  "content_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "estimated_minutes" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_course_sections_version_idx"
  ON "industrial_training_course_sections" ("tenant_id", "version_id", "sort_order");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_course_sections" TO forge_app;
ALTER TABLE "industrial_training_course_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_course_sections" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_course_sections_tenant_isolation" ON "industrial_training_course_sections";
CREATE POLICY "industrial_training_course_sections_tenant_isolation" ON "industrial_training_course_sections"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Progress + canonical completions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "industrial_training_progress" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "industrial_training_assignments"("id") ON DELETE CASCADE,
  "assignee_id" uuid NOT NULL REFERENCES "industrial_training_assignment_assignees"("id") ON DELETE CASCADE,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id") ON DELETE SET NULL,
  "employee_number" varchar(120) NOT NULL,
  "version_id" uuid REFERENCES "industrial_training_course_versions"("id") ON DELETE SET NULL,
  "percent_complete" integer NOT NULL DEFAULT 0,
  "sections_completed" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "current_section_id" uuid REFERENCES "industrial_training_course_sections"("id") ON DELETE SET NULL,
  "first_opened_at" timestamptz,
  "last_accessed_at" timestamptz,
  "content_completed_at" timestamptz,
  "quiz_available" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_progress_assignee_uidx"
  ON "industrial_training_progress" ("assignee_id");
CREATE INDEX IF NOT EXISTS "industrial_training_progress_tenant_idx"
  ON "industrial_training_progress" ("tenant_id", "employee_number");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_progress" TO forge_app;
ALTER TABLE "industrial_training_progress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_progress" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_progress_tenant_isolation" ON "industrial_training_progress";
CREATE POLICY "industrial_training_progress_tenant_isolation" ON "industrial_training_progress"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_completions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "industrial_training_assignments"("id") ON DELETE CASCADE,
  "assignee_id" uuid NOT NULL REFERENCES "industrial_training_assignment_assignees"("id") ON DELETE CASCADE,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id") ON DELETE SET NULL,
  "employee_number" varchar(120) NOT NULL,
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id"),
  "version_id" uuid REFERENCES "industrial_training_course_versions"("id") ON DELETE SET NULL,
  "attempt_id" uuid REFERENCES "industrial_training_attempts"("id") ON DELETE SET NULL,
  "attempt_number" integer NOT NULL DEFAULT 1,
  "score_percent" integer NOT NULL,
  "passing_percent" integer NOT NULL,
  "result" varchar(32) NOT NULL,
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "completed_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_completions_pass_uidx"
  ON "industrial_training_completions" ("assignee_id", "version_id")
  WHERE result = 'PASSED';
CREATE INDEX IF NOT EXISTS "industrial_training_completions_tenant_idx"
  ON "industrial_training_completions" ("tenant_id", "personnel_id", "completed_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_completions" TO forge_app;
ALTER TABLE "industrial_training_completions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_completions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_completions_tenant_isolation" ON "industrial_training_completions";
CREATE POLICY "industrial_training_completions_tenant_isolation" ON "industrial_training_completions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_acknowledgements" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "progress_id" uuid REFERENCES "industrial_training_progress"("id") ON DELETE SET NULL,
  "completion_id" uuid REFERENCES "industrial_training_completions"("id") ON DELETE SET NULL,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id") ON DELETE SET NULL,
  "employee_number" varchar(120) NOT NULL,
  "version_id" uuid REFERENCES "industrial_training_course_versions"("id") ON DELETE SET NULL,
  "acknowledgement_text" text NOT NULL,
  "acknowledged_at" timestamptz NOT NULL DEFAULT now(),
  "request_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "industrial_training_acknowledgements_tenant_idx"
  ON "industrial_training_acknowledgements" ("tenant_id", "employee_number");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_acknowledgements" TO forge_app;
ALTER TABLE "industrial_training_acknowledgements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_acknowledgements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_acknowledgements_tenant_isolation" ON "industrial_training_acknowledgements";
CREATE POLICY "industrial_training_acknowledgements_tenant_isolation" ON "industrial_training_acknowledgements"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Public identify rate limiting (tenant + token hash + ip bucket)
CREATE TABLE IF NOT EXISTS "industrial_training_portal_rate_limits" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "bucket_key" varchar(256) NOT NULL,
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "window_started_at" timestamptz NOT NULL DEFAULT now(),
  "blocked_until" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_portal_rate_limits_uidx"
  ON "industrial_training_portal_rate_limits" ("tenant_id", "bucket_key");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_portal_rate_limits" TO forge_app;
ALTER TABLE "industrial_training_portal_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_portal_rate_limits" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_portal_rate_limits_tenant_isolation" ON "industrial_training_portal_rate_limits";
CREATE POLICY "industrial_training_portal_rate_limits_tenant_isolation" ON "industrial_training_portal_rate_limits"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Extend existing tables
ALTER TABLE "industrial_training_assignments"
  ADD COLUMN IF NOT EXISTS "course_version_id" uuid REFERENCES "industrial_training_course_versions"("id") ON DELETE SET NULL;

ALTER TABLE "industrial_training_attempts"
  ADD COLUMN IF NOT EXISTS "course_version_id" uuid REFERENCES "industrial_training_course_versions"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "attempt_number" integer NOT NULL DEFAULT 1;

ALTER TABLE "industrial_training_portal_sessions"
  ADD COLUMN IF NOT EXISTS "access_link_id" uuid REFERENCES "industrial_training_access_links"("id") ON DELETE CASCADE;

ALTER TABLE "industrial_training_portal_sessions"
  ALTER COLUMN "assignment_id" DROP NOT NULL;

ALTER TABLE "industrial_training_group_members"
  ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "industrial_training_group_members"
  ADD COLUMN IF NOT EXISTS "personnel_id" uuid REFERENCES "industrial_personnel"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_group_members_personnel_uidx"
  ON "industrial_training_group_members" ("group_id", "personnel_id")
  WHERE "personnel_id" IS NOT NULL;

-- Backfill version 1 for published sources
INSERT INTO "industrial_training_course_versions" (
  "id", "tenant_id", "source_id", "version_number", "version_label", "passing_percent",
  "status", "published_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  s.tenant_id,
  s.id,
  1,
  COALESCE(NULLIF(trim(s.edition), ''), 'Version 1'),
  70,
  CASE WHEN s.status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'DRAFT' END,
  s.published_at,
  now(),
  now()
FROM "industrial_training_sources" s
WHERE s.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "industrial_training_course_versions" v
    WHERE v.source_id = s.id AND v.version_number = 1
  );

UPDATE "industrial_training_assignments" a
SET "course_version_id" = v.id
FROM "industrial_training_course_versions" v
WHERE a.course_version_id IS NULL
  AND v.source_id = a.source_id
  AND v.version_number = 1;
