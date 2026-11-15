-- Universal Import Platform S5 — execution locks, progress, batch checkpoints, rollback prep
-- Additive only. FORCE RLS preserved. No secret changes.

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "cancellation_requested" boolean NOT NULL DEFAULT false;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "cancellation_requested_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "cancellation_requested_by" uuid REFERENCES "users"("id");

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_lock_owner" varchar(128);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_lock_acquired_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_lock_heartbeat_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_lock_expires_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_attempt" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_idempotency_key" varchar(255);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "adapter_key" varchar(160);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "adapter_version" varchar(64);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "worker_id" varchar(128);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "execution_started_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "last_progress_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "estimated_completion_at" timestamptz;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "mapping_snapshot_json" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "result_summary_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "rollback_classification_summary_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_jobs"
  DROP CONSTRAINT IF EXISTS "import_jobs_execution_attempt_nonneg";

ALTER TABLE "import_jobs"
  ADD CONSTRAINT "import_jobs_execution_attempt_nonneg" CHECK ("execution_attempt" >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS "import_jobs_tenant_execution_idempotency_uidx"
  ON "import_jobs" ("tenant_id", "execution_idempotency_key")
  WHERE "execution_idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "import_jobs_tenant_lock_idx"
  ON "import_jobs" ("tenant_id", "execution_lock_owner", "execution_lock_expires_at")
  WHERE "execution_lock_owner" IS NOT NULL;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "worker_id" varchar(128);

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "attempt_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "skipped_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "duplicate_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "cancelled_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "checkpoint_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "last_processed_row_id" uuid;

ALTER TABLE "import_batches"
  ADD COLUMN IF NOT EXISTS "duration_ms" integer;

ALTER TABLE "import_batches"
  DROP CONSTRAINT IF EXISTS "import_batches_attempt_nonneg";

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_attempt_nonneg" CHECK ("attempt_count" >= 0);

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "destination_record_id" varchar(255);

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "operation_type" varchar(64);

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "rollback_classification" varchar(64);

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "rollback_journal_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "commit_attempt" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "adapter_key" varchar(160);

ALTER TABLE "import_rows"
  ADD COLUMN IF NOT EXISTS "adapter_version" varchar(64);

ALTER TABLE "import_rows"
  DROP CONSTRAINT IF EXISTS "import_rows_rollback_classification_check";

ALTER TABLE "import_rows"
  ADD CONSTRAINT "import_rows_rollback_classification_check" CHECK (
    "rollback_classification" IS NULL OR "rollback_classification" IN (
      'FULLY_REVERSIBLE',
      'COMPENSATING_ACTION',
      'MANUAL_REVIEW_REQUIRED',
      'NOT_REVERSIBLE'
    )
  );

ALTER TABLE "import_row_errors"
  ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_row_errors"
  ADD COLUMN IF NOT EXISTS "last_retry_at" timestamptz;

ALTER TABLE "import_row_errors"
  ADD COLUMN IF NOT EXISTS "disposition" varchar(64) NOT NULL DEFAULT 'OPEN';

ALTER TABLE "import_row_errors"
  ADD COLUMN IF NOT EXISTS "failure_class" varchar(64);

ALTER TABLE "import_rollback_events"
  ADD COLUMN IF NOT EXISTS "classification" varchar(64);

ALTER TABLE "import_rollback_events"
  ADD COLUMN IF NOT EXISTS "journal_json" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "import_rollback_events"
  DROP CONSTRAINT IF EXISTS "import_rollback_events_classification_check";

ALTER TABLE "import_rollback_events"
  ADD CONSTRAINT "import_rollback_events_classification_check" CHECK (
    "classification" IS NULL OR "classification" IN (
      'FULLY_REVERSIBLE',
      'COMPENSATING_ACTION',
      'MANUAL_REVIEW_REQUIRED',
      'NOT_REVERSIBLE'
    )
  );

CREATE TABLE IF NOT EXISTS "import_execution_journal" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "job_id" uuid NOT NULL REFERENCES "import_jobs"("id"),
  "batch_id" uuid REFERENCES "import_batches"("id"),
  "row_id" uuid REFERENCES "import_rows"("id"),
  "adapter_key" varchar(160) NOT NULL,
  "adapter_version" varchar(64) NOT NULL,
  "operation_type" varchar(64) NOT NULL,
  "destination_record_id" varchar(255),
  "rollback_classification" varchar(64) NOT NULL,
  "before_ref_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after_ref_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "compensation_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "idempotency_key" varchar(255),
  "correlation_id" varchar(64),
  "committed_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_execution_journal_version_positive" CHECK ("version" >= 1),
  CONSTRAINT "import_execution_journal_classification_check" CHECK (
    "rollback_classification" IN (
      'FULLY_REVERSIBLE',
      'COMPENSATING_ACTION',
      'MANUAL_REVIEW_REQUIRED',
      'NOT_REVERSIBLE'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "import_execution_journal_tenant_idempotency_uidx"
  ON "import_execution_journal" ("tenant_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "import_execution_journal_tenant_job_idx"
  ON "import_execution_journal" ("tenant_id", "job_id", "committed_at");

ALTER TABLE import_execution_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_execution_journal FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_execution_journal_tenant_isolation ON import_execution_journal;
CREATE POLICY import_execution_journal_tenant_isolation ON import_execution_journal
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON import_execution_journal TO forge_app;
  END IF;
END $$;
