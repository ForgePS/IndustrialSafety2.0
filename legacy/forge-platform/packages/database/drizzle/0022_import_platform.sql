-- Universal Import Platform S1 — migration 0022
-- Additive only. FORCE RLS. No destructive DDL.
-- Checksum source: sha256 of this file recorded in docs/database/0022-import-platform-*.md
-- Canonical job statuses enforced via CHECK on import_jobs.status.

DO $$ BEGIN
  CREATE TYPE import_job_status AS ENUM (
    'UPLOADED',
    'SCANNING',
    'SCAN_FAILED',
    'READY_FOR_MAPPING',
    'MAPPED',
    'VALIDATING',
    'VALIDATION_FAILED',
    'READY_FOR_PREVIEW',
    'PREVIEW_READY',
    'AWAITING_APPROVAL',
    'APPROVED',
    'QUEUED',
    'PROCESSING',
    'COMPLETED',
    'COMPLETED_WITH_ERRORS',
    'FAILED',
    'ROLLBACK_PENDING',
    'ROLLED_BACK',
    'ROLLBACK_REFUSED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE import_rollback_safety AS ENUM (
    'SAFE',
    'CONDITIONAL',
    'UNSAFE',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "import_profiles" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "profile_key" varchar(120) NOT NULL,
  "display_name" varchar(200) NOT NULL,
  "product_code" varchar(64) NOT NULL,
  "module_code" varchar(64) NOT NULL,
  "record_type" varchar(120) NOT NULL,
  "source_type" varchar(32) NOT NULL,
  "config_namespace" varchar(64) NOT NULL DEFAULT 'import_config',
  "config_object_key" varchar(120),
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_snapshot" boolean NOT NULL DEFAULT false,
  "correlation_id" varchar(64),
  "source_hash" varchar(128),
  "idempotency_key" varchar(255),
  "archived_at" timestamptz,
  "archived_by" uuid REFERENCES "users"("id"),
  "effective_at" timestamptz,
  "expires_at" timestamptz,
  "retention_delete_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_profiles_version_positive" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "import_profiles_tenant_key_uidx"
  ON "import_profiles" ("tenant_id", "profile_key")
  WHERE "is_snapshot" = false AND "archived_at" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "import_profiles_tenant_idempotency_uidx"
  ON "import_profiles" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "import_profiles_tenant_product_idx"
  ON "import_profiles" ("tenant_id", "product_code", "module_code", "record_type");
CREATE INDEX IF NOT EXISTS "import_profiles_retention_idx"
  ON "import_profiles" ("tenant_id", "retention_delete_at")
  WHERE "retention_delete_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "import_jobs" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product_code" varchar(64) NOT NULL,
  "module_code" varchar(64) NOT NULL,
  "record_type" varchar(120) NOT NULL,
  "status" import_job_status NOT NULL DEFAULT 'UPLOADED',
  "profile_id" uuid REFERENCES "import_profiles"("id"),
  "profile_key" varchar(120),
  "profile_snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "format" varchar(32),
  "idempotency_key" varchar(255),
  "correlation_id" varchar(64),
  "request_id" varchar(64),
  "source_hash" varchar(128),
  "row_counts_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "progress_percent" integer NOT NULL DEFAULT 0,
  "current_stage" varchar(64),
  "error_summary" text,
  "rollback_safety" import_rollback_safety,
  "approved_at" timestamptz,
  "approved_by" uuid REFERENCES "users"("id"),
  "executed_at" timestamptz,
  "completed_at" timestamptz,
  "effective_at" timestamptz,
  "expires_at" timestamptz,
  "retention_delete_at" timestamptz,
  "archived_at" timestamptz,
  "archived_by" uuid REFERENCES "users"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_jobs_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_jobs_progress_range" CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "import_jobs_tenant_idempotency_uidx"
  ON "import_jobs" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "import_jobs_tenant_status_created_idx"
  ON "import_jobs" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "import_jobs_tenant_product_idx"
  ON "import_jobs" ("tenant_id", "product_code", "module_code", "record_type");
CREATE INDEX IF NOT EXISTS "import_jobs_retention_idx"
  ON "import_jobs" ("tenant_id", "retention_delete_at")
  WHERE "retention_delete_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "import_files" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "parent_file_id" uuid REFERENCES "import_files"("id"),
  "file_name" varchar(500) NOT NULL,
  "content_type" varchar(200),
  "format" varchar(32) NOT NULL,
  "byte_size" bigint,
  "content_hash" varchar(128),
  "source_hash" varchar(128),
  "s3_bucket" varchar(255) NOT NULL,
  "s3_key" varchar(1024) NOT NULL,
  "scan_status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "scan_detail" text,
  "detected_headers_json" jsonb,
  "detected_sheets_json" jsonb,
  "idempotency_key" varchar(255),
  "correlation_id" varchar(64),
  "expires_at" timestamptz,
  "retention_delete_at" timestamptz,
  "archived_at" timestamptz,
  "archived_by" uuid REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_files_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_files_scan_status_check" CHECK (
    "scan_status" IN ('PENDING', 'SCANNING', 'CLEAN', 'INFECTED', 'ERROR', 'TIMEOUT')
  )
);
CREATE INDEX IF NOT EXISTS "import_files_tenant_job_idx"
  ON "import_files" ("tenant_id", "job_id");
CREATE INDEX IF NOT EXISTS "import_files_tenant_scan_idx"
  ON "import_files" ("tenant_id", "scan_status");
CREATE UNIQUE INDEX IF NOT EXISTS "import_files_tenant_idempotency_uidx"
  ON "import_files" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "import_column_mappings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "profile_id" uuid REFERENCES "import_profiles"("id"),
  "source_column" varchar(300) NOT NULL,
  "target_field" varchar(300) NOT NULL,
  "transform_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_required" boolean NOT NULL DEFAULT false,
  "is_sensitive" boolean NOT NULL DEFAULT false,
  "ordinal" integer NOT NULL DEFAULT 0,
  "correlation_id" varchar(64),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_column_mappings_version_positive" CHECK ("version" >= 1)
);
CREATE INDEX IF NOT EXISTS "import_column_mappings_tenant_job_idx"
  ON "import_column_mappings" ("tenant_id", "job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "import_column_mappings_job_source_uidx"
  ON "import_column_mappings" ("job_id", "source_column");

CREATE TABLE IF NOT EXISTS "import_batches" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "batch_number" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "row_count" integer NOT NULL DEFAULT 0,
  "committed_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0,
  "idempotency_key" varchar(255),
  "correlation_id" varchar(64),
  "source_hash" varchar(128),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "effective_at" timestamptz,
  "expires_at" timestamptz,
  "retention_delete_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_batches_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_batches_batch_number_positive" CHECK ("batch_number" >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "import_batches_job_number_uidx"
  ON "import_batches" ("job_id", "batch_number");
CREATE UNIQUE INDEX IF NOT EXISTS "import_batches_tenant_job_idempotency_uidx"
  ON "import_batches" ("tenant_id", "job_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "import_batches_tenant_job_idx"
  ON "import_batches" ("tenant_id", "job_id", "status");

CREATE TABLE IF NOT EXISTS "import_rows" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "batch_id" uuid REFERENCES "import_batches"("id"),
  "file_id" uuid REFERENCES "import_files"("id"),
  "source_row_key" varchar(200) NOT NULL,
  "operation_key" varchar(255),
  "source_line" integer,
  "source_sheet" varchar(200),
  "status" varchar(32) NOT NULL DEFAULT 'STAGED',
  "raw_json" jsonb,
  "raw_s3_bucket" varchar(255),
  "raw_s3_key" varchar(1024),
  "mapped_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "contains_sensitive" boolean NOT NULL DEFAULT false,
  "duplicate_action" varchar(32),
  "target_entity_id" uuid,
  "source_hash" varchar(128),
  "correlation_id" varchar(64),
  "retention_delete_at" timestamptz,
  "archived_at" timestamptz,
  "archived_by" uuid REFERENCES "users"("id"),
  "completed_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_rows_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_rows_mapped_size_check" CHECK (pg_column_size("mapped_json") <= 65536)
);
CREATE UNIQUE INDEX IF NOT EXISTS "import_rows_job_source_uidx"
  ON "import_rows" ("job_id", "source_row_key");
CREATE UNIQUE INDEX IF NOT EXISTS "import_rows_tenant_job_operation_uidx"
  ON "import_rows" ("tenant_id", "job_id", "operation_key")
  WHERE "operation_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "import_rows_tenant_job_status_idx"
  ON "import_rows" ("tenant_id", "job_id", "status");
CREATE INDEX IF NOT EXISTS "import_rows_retention_idx"
  ON "import_rows" ("tenant_id", "retention_delete_at")
  WHERE "retention_delete_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "import_row_errors" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "row_id" uuid NOT NULL REFERENCES "import_rows"("id"),
  "severity" varchar(16) NOT NULL DEFAULT 'ERROR',
  "rule_code" varchar(120) NOT NULL,
  "field_path" varchar(300),
  "message" text NOT NULL,
  "details_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "correlation_id" varchar(64),
  "retention_delete_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_row_errors_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_row_errors_severity_check" CHECK ("severity" IN ('ERROR', 'WARNING'))
);
CREATE INDEX IF NOT EXISTS "import_row_errors_tenant_job_idx"
  ON "import_row_errors" ("tenant_id", "job_id");
CREATE INDEX IF NOT EXISTS "import_row_errors_row_idx"
  ON "import_row_errors" ("row_id");

CREATE TABLE IF NOT EXISTS "import_duplicate_candidates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "row_id" uuid NOT NULL REFERENCES "import_rows"("id"),
  "matched_entity_id" uuid,
  "matched_entity_type" varchar(120),
  "confidence" numeric(5,4) NOT NULL DEFAULT 0,
  "recommended_action" varchar(32) NOT NULL,
  "resolved_action" varchar(32),
  "match_fields_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "correlation_id" varchar(64),
  "retention_delete_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_duplicate_candidates_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_duplicate_candidates_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 1)
);
CREATE INDEX IF NOT EXISTS "import_duplicate_candidates_tenant_job_idx"
  ON "import_duplicate_candidates" ("tenant_id", "job_id");
CREATE INDEX IF NOT EXISTS "import_duplicate_candidates_row_idx"
  ON "import_duplicate_candidates" ("row_id");

CREATE TABLE IF NOT EXISTS "import_rollback_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "batch_id" uuid REFERENCES "import_batches"("id"),
  "status" varchar(32) NOT NULL DEFAULT 'REQUESTED',
  "safety_class" import_rollback_safety NOT NULL,
  "reason" text,
  "entities_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "idempotency_key" varchar(255),
  "correlation_id" varchar(64),
  "completed_at" timestamptz,
  "effective_at" timestamptz,
  "retention_delete_at" timestamptz,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "updated_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_rollback_events_version_positive" CHECK ("version" >= 1)
);
CREATE INDEX IF NOT EXISTS "import_rollback_events_tenant_job_idx"
  ON "import_rollback_events" ("tenant_id", "job_id");
CREATE UNIQUE INDEX IF NOT EXISTS "import_rollback_events_tenant_idempotency_uidx"
  ON "import_rollback_events" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- FORCE RLS (application role cannot bypass)
ALTER TABLE import_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_profiles_tenant_isolation ON import_profiles;
CREATE POLICY import_profiles_tenant_isolation ON import_profiles
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_jobs_tenant_isolation ON import_jobs;
CREATE POLICY import_jobs_tenant_isolation ON import_jobs
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_files_tenant_isolation ON import_files;
CREATE POLICY import_files_tenant_isolation ON import_files
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_column_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_column_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_column_mappings_tenant_isolation ON import_column_mappings;
CREATE POLICY import_column_mappings_tenant_isolation ON import_column_mappings
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_batches_tenant_isolation ON import_batches;
CREATE POLICY import_batches_tenant_isolation ON import_batches
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_rows_tenant_isolation ON import_rows;
CREATE POLICY import_rows_tenant_isolation ON import_rows
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_row_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_row_errors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_row_errors_tenant_isolation ON import_row_errors;
CREATE POLICY import_row_errors_tenant_isolation ON import_row_errors
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_duplicate_candidates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_duplicate_candidates_tenant_isolation ON import_duplicate_candidates;
CREATE POLICY import_duplicate_candidates_tenant_isolation ON import_duplicate_candidates
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE import_rollback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rollback_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_rollback_events_tenant_isolation ON import_rollback_events;
CREATE POLICY import_rollback_events_tenant_isolation ON import_rollback_events
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- DML grants for forge_app (RLS still enforced)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'import_profiles',
    'import_jobs',
    'import_files',
    'import_column_mappings',
    'import_batches',
    'import_rows',
    'import_row_errors',
    'import_duplicate_candidates',
    'import_rollback_events'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO forge_app', t);
    END IF;
  END LOOP;
END
$$;
