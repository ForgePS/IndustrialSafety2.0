-- Universal Import Platform S4 — duplicates, profile rules, ZIP/API metadata
-- Additive only. No secret changes.

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "match_algorithm" varchar(64);

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "confidence_band" varchar(16);

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "match_reasons_json" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "merge_candidate_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "review_status" varchar(32) NOT NULL DEFAULT 'PENDING';

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "candidate_status" varchar(32) NOT NULL DEFAULT 'OPEN';

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "review_notes" text;

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;

ALTER TABLE "import_duplicate_candidates"
  ADD COLUMN IF NOT EXISTS "resolved_by" uuid REFERENCES "users"("id");

ALTER TABLE "import_duplicate_candidates"
  DROP CONSTRAINT IF EXISTS "import_duplicate_candidates_confidence_band_check";

ALTER TABLE "import_duplicate_candidates"
  ADD CONSTRAINT "import_duplicate_candidates_confidence_band_check" CHECK (
    "confidence_band" IS NULL OR "confidence_band" IN ('HIGH', 'MEDIUM', 'LOW')
  );

ALTER TABLE "import_duplicate_candidates"
  DROP CONSTRAINT IF EXISTS "import_duplicate_candidates_review_status_check";

ALTER TABLE "import_duplicate_candidates"
  ADD CONSTRAINT "import_duplicate_candidates_review_status_check" CHECK (
    "review_status" IN ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED')
  );

ALTER TABLE "import_duplicate_candidates"
  DROP CONSTRAINT IF EXISTS "import_duplicate_candidates_candidate_status_check";

ALTER TABLE "import_duplicate_candidates"
  ADD CONSTRAINT "import_duplicate_candidates_candidate_status_check" CHECK (
    "candidate_status" IN ('OPEN', 'RESOLVED', 'CANCELLED')
  );

CREATE INDEX IF NOT EXISTS "import_duplicate_candidates_tenant_review_idx"
  ON "import_duplicate_candidates" ("tenant_id", "review_status", "created_at");

ALTER TABLE "import_profiles"
  ADD COLUMN IF NOT EXISTS "duplicate_rules_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_profiles"
  ADD COLUMN IF NOT EXISTS "zip_metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "import_profiles"
  ADD COLUMN IF NOT EXISTS "api_source_metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "import_profile_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "profile_id" uuid NOT NULL REFERENCES "import_profiles"("id"),
  "version_number" integer NOT NULL,
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "duplicate_rules_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "zip_metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "api_source_metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "change_summary" text,
  "correlation_id" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "created_by" uuid REFERENCES "users"("id"),
  CONSTRAINT "import_profile_versions_version_positive" CHECK ("version_number" >= 1),
  CONSTRAINT "import_profile_versions_profile_version_uidx" UNIQUE ("profile_id", "version_number")
);

CREATE INDEX IF NOT EXISTS "import_profile_versions_tenant_profile_idx"
  ON "import_profile_versions" ("tenant_id", "profile_id", "created_at");

ALTER TABLE import_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_profile_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_profile_versions_tenant_isolation ON import_profile_versions;
CREATE POLICY import_profile_versions_tenant_isolation ON import_profile_versions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE import_profile_versions TO forge_app;
  END IF;
END
$$;
