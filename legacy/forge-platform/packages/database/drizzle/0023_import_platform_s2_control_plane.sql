-- Universal Import Platform S2 — control-plane columns for import_jobs
-- Additive only. No RLS policy changes. No secret changes.
-- Checksum source: sha256 of this file recorded in S2 apply report.

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "display_name" varchar(200);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "description" text;

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "source_type" varchar(32);

ALTER TABLE "import_jobs"
  ADD COLUMN IF NOT EXISTS "requested_mode" varchar(32);

UPDATE "import_jobs"
  SET "display_name" = COALESCE("display_name", CONCAT("product_code", '-', "module_code", '-', "record_type"))
  WHERE "display_name" IS NULL;

ALTER TABLE "import_jobs"
  ALTER COLUMN "display_name" SET NOT NULL;

ALTER TABLE "import_jobs"
  ALTER COLUMN "display_name" SET DEFAULT 'Import job';

CREATE INDEX IF NOT EXISTS "import_jobs_tenant_display_name_idx"
  ON "import_jobs" ("tenant_id", "display_name");
