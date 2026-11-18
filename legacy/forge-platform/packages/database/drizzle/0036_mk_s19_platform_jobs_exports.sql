-- FORGE-SAAS MK-S19: shared platform jobs + export permissions.
-- Not applied to production in this sprint.

CREATE TABLE IF NOT EXISTS "platform_jobs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "type" varchar(80) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "progress" integer NOT NULL DEFAULT 0,
  "attempt" integer NOT NULL DEFAULT 0,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "correlation_id" varchar(120) NOT NULL,
  "request_id" varchar(120),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "failure" text,
  "result_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "artifact_object_key" text,
  "artifact_content_type" varchar(120),
  "artifact_filename" varchar(200),
  "artifact_inline" text,
  "artifact_expires_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "platform_jobs_tenant_created_idx"
  ON "platform_jobs" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "platform_jobs_tenant_status_idx"
  ON "platform_jobs" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "platform_jobs_tenant_type_idx"
  ON "platform_jobs" ("tenant_id", "type");

GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_jobs" TO forge_app;
ALTER TABLE "platform_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_jobs_tenant_isolation" ON "platform_jobs";
CREATE POLICY "platform_jobs_tenant_isolation" ON "platform_jobs"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'platform.jobs.read',
  'Read platform jobs',
  'List and view shared SaaS background jobs for a tenant',
  'PLATFORM',
  'STANDARD',
  false,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'platform.jobs.read');

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.export.read',
  'Read tenant exports',
  'Download authorized tenant export artifacts',
  'TENANT',
  'ELEVATED',
  true,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'tenant.export.read');

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.export.create',
  'Create tenant exports',
  'Create authorized tenant-scoped export jobs',
  'TENANT',
  'ELEVATED',
  true,
  now(),
  now()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'tenant.export.create');
