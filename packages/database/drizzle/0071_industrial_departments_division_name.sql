ALTER TABLE "industrial_departments"
  ADD COLUMN IF NOT EXISTS "division_name" varchar(300);

UPDATE "industrial_departments"
SET "division_name" = NULLIF(BTRIM(COALESCE("source_payload"->>'division', '')), '')
WHERE "division_name" IS NULL
  AND "source_payload" ? 'division';

CREATE INDEX IF NOT EXISTS "industrial_departments_tenant_site_division_idx"
  ON "industrial_departments" ("tenant_id", "site_id", "division_name");
