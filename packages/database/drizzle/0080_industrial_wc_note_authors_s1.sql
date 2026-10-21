-- Workers' Comp: track who authored medical / work-status notes so authors can edit their own.
ALTER TABLE "industrial_workers_comp_medical_encounters"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");

ALTER TABLE "industrial_workers_comp_work_status_periods"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id");

CREATE INDEX IF NOT EXISTS "industrial_wc_medical_created_by_idx"
  ON "industrial_workers_comp_medical_encounters" ("tenant_id", "created_by_user_id");

CREATE INDEX IF NOT EXISTS "industrial_wc_work_status_created_by_idx"
  ON "industrial_workers_comp_work_status_periods" ("tenant_id", "created_by_user_id");
