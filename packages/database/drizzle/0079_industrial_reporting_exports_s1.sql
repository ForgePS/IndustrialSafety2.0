-- Reporting exports: S3 object key + optional platform job link for large artifacts.
ALTER TABLE "report_exports"
  ADD COLUMN IF NOT EXISTS "artifact_object_key" text,
  ADD COLUMN IF NOT EXISTS "job_id" uuid;

CREATE INDEX IF NOT EXISTS "report_exports_tenant_job_idx"
  ON "report_exports" ("tenant_id", "job_id");
