-- Universal Import Platform S6 — malware scan events, quarantine, security holds
-- Additive only. FORCE RLS preserved. No secret changes.

DO $$
BEGIN
  ALTER TYPE import_job_status ADD VALUE IF NOT EXISTS 'QUARANTINED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "malware_verdict" varchar(64) NOT NULL DEFAULT 'NOT_SUBMITTED';

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "malware_verdict_at" timestamptz;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "current_scan_event_id" uuid;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "quarantine_status" varchar(32) NOT NULL DEFAULT 'NONE';

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "quarantined_at" timestamptz;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "quarantine_object_key" varchar(1024);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "scan_attempt_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "rescan_required" boolean NOT NULL DEFAULT false;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "verdict_hash" varchar(128);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "object_version_id" varchar(255);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "detected_mime_type" varchar(200);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "security_hold" boolean NOT NULL DEFAULT false;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "security_hold" boolean NOT NULL DEFAULT false;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "malware_gate_passed_at" timestamptz;

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_scan_status_check";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_scan_status_check" CHECK (
    "scan_status" IN (
      'PENDING',
      'SUBMITTED',
      'SCANNING',
      'CLEAN',
      'INFECTED',
      'SUSPICIOUS',
      'QUARANTINED',
      'ERROR',
      'TIMEOUT',
      'SCAN_FAILED',
      'UNSUPPORTED',
      'RESCAN_REQUIRED',
      'OVERRIDE_APPROVED',
      'OVERRIDE_DENIED'
    )
  );

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_malware_verdict_check";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_malware_verdict_check" CHECK (
    "malware_verdict" IN (
      'NOT_SUBMITTED',
      'SUBMITTED',
      'SCANNING',
      'CLEAN',
      'INFECTED',
      'SUSPICIOUS',
      'SCAN_FAILED',
      'SCAN_TIMEOUT',
      'UNSUPPORTED',
      'QUARANTINED',
      'RESCAN_REQUIRED',
      'OVERRIDE_APPROVED',
      'OVERRIDE_DENIED'
    )
  );

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_quarantine_status_check";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_quarantine_status_check" CHECK (
    "quarantine_status" IN ('NONE', 'QUARANTINED', 'RELEASED', 'DESTROYED')
  );

CREATE TABLE IF NOT EXISTS "import_file_scan_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "import_job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "import_file_id" uuid NOT NULL REFERENCES "import_files"("id"),
  "attempt_number" integer NOT NULL DEFAULT 1,
  "provider_key" varchar(120) NOT NULL,
  "provider_version" varchar(64) NOT NULL,
  "provider_scan_reference" varchar(255),
  "status" varchar(32) NOT NULL DEFAULT 'SUBMITTED',
  "verdict" varchar(64) NOT NULL DEFAULT 'SUBMITTED',
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "timed_out_at" timestamptz,
  "file_sha256" varchar(128),
  "file_size" bigint,
  "object_key" varchar(1024) NOT NULL,
  "object_version_id" varchar(255),
  "object_etag" varchar(255),
  "detected_mime_type" varchar(200),
  "malware_family" varchar(255),
  "failure_code" varchar(120),
  "failure_message_sanitized" text,
  "is_current" boolean NOT NULL DEFAULT true,
  "idempotency_key" varchar(255),
  "correlation_id" varchar(64),
  "created_by" uuid REFERENCES "users"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "import_file_scan_events_attempt_positive" CHECK ("attempt_number" >= 1),
  CONSTRAINT "import_file_scan_events_version_positive" CHECK ("version" >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "import_file_scan_events_tenant_idempotency_uidx"
  ON "import_file_scan_events" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "import_file_scan_events_tenant_file_idx"
  ON "import_file_scan_events" ("tenant_id", "import_file_id", "created_at");

CREATE INDEX IF NOT EXISTS "import_file_scan_events_tenant_job_idx"
  ON "import_file_scan_events" ("tenant_id", "import_job_id", "verdict");

CREATE INDEX IF NOT EXISTS "import_file_scan_events_provider_ref_idx"
  ON "import_file_scan_events" ("tenant_id", "provider_scan_reference")
  WHERE "provider_scan_reference" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "import_file_scan_events_current_idx"
  ON "import_file_scan_events" ("tenant_id", "import_file_id")
  WHERE "is_current" = true;

ALTER TABLE import_file_scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_file_scan_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_file_scan_events_tenant_isolation ON import_file_scan_events;
CREATE POLICY import_file_scan_events_tenant_isolation ON import_file_scan_events
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON import_file_scan_events TO forge_app;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "import_security_artifacts" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "artifact_type" varchar(64) NOT NULL,
  "classification" varchar(32) NOT NULL DEFAULT 'MASKED',
  "s3_bucket" varchar(255) NOT NULL,
  "s3_key" varchar(1024) NOT NULL,
  "content_hash" varchar(128),
  "byte_size" bigint,
  "expires_at" timestamptz,
  "retention_delete_at" timestamptz,
  "security_hold" boolean NOT NULL DEFAULT false,
  "correlation_id" varchar(64),
  "created_by" uuid REFERENCES "users"("id"),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "import_security_artifacts_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_security_artifacts_classification_check" CHECK (
    "classification" IN ('MASKED', 'PRIVILEGED', 'SECURITY_REPORT')
  )
);

CREATE INDEX IF NOT EXISTS "import_security_artifacts_tenant_job_idx"
  ON "import_security_artifacts" ("tenant_id", "job_id", "created_at");

ALTER TABLE import_security_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_security_artifacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_security_artifacts_tenant_isolation ON import_security_artifacts;
CREATE POLICY import_security_artifacts_tenant_isolation ON import_security_artifacts
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON import_security_artifacts TO forge_app;
  END IF;
END $$;
