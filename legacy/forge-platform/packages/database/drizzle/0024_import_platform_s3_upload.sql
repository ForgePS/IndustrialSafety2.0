-- Universal Import Platform S3 — upload orchestration columns
-- Additive only. No secret changes.

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "stored_file_name" varchar(500);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "upload_status" varchar(32) NOT NULL DEFAULT 'INITIALIZED';

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "validation_status" varchar(32) NOT NULL DEFAULT 'PENDING';

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "encryption_status" varchar(32) NOT NULL DEFAULT 'SSE_KMS';

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "multipart_upload_id" varchar(255);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "upload_progress_percent" integer NOT NULL DEFAULT 0;

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "client_checksum_sha256" varchar(128);

ALTER TABLE "import_files"
  ADD COLUMN IF NOT EXISTS "validation_detail" text;

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_scan_status_check";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_scan_status_check" CHECK (
    "scan_status" IN (
      'PENDING',
      'SCANNING',
      'CLEAN',
      'INFECTED',
      'QUARANTINED',
      'ERROR',
      'TIMEOUT',
      'SCAN_FAILED'
    )
  );

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_upload_status_check";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_upload_status_check" CHECK (
    "upload_status" IN (
      'INITIALIZED',
      'UPLOADING',
      'COMPLETED',
      'CANCELLED',
      'FAILED',
      'ABORTED'
    )
  );

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_validation_status_check";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_validation_status_check" CHECK (
    "validation_status" IN (
      'PENDING',
      'RUNNING',
      'PASSED',
      'FAILED',
      'SKIPPED'
    )
  );

ALTER TABLE "import_files"
  DROP CONSTRAINT IF EXISTS "import_files_upload_progress_range";

ALTER TABLE "import_files"
  ADD CONSTRAINT "import_files_upload_progress_range" CHECK (
    "upload_progress_percent" >= 0 AND "upload_progress_percent" <= 100
  );

UPDATE "import_files"
  SET "stored_file_name" = COALESCE("stored_file_name", "file_name")
  WHERE "stored_file_name" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "import_files_tenant_content_hash_uidx"
  ON "import_files" ("tenant_id", "content_hash")
  WHERE "content_hash" IS NOT NULL
    AND "upload_status" = 'COMPLETED'
    AND "archived_at" IS NULL;

CREATE INDEX IF NOT EXISTS "import_files_tenant_upload_status_idx"
  ON "import_files" ("tenant_id", "upload_status", "created_at");
