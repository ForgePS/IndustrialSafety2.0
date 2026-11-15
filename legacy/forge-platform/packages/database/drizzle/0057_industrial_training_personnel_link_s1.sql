-- INDUSTRIAL TRAINING ASSIGNMENTS S2: link assignees and records to personnel roster.
-- Additive. Tenant RLS.

ALTER TABLE "industrial_training_assignment_assignees"
  ADD COLUMN IF NOT EXISTS "personnel_id" uuid REFERENCES "industrial_personnel"("id") ON DELETE SET NULL;

ALTER TABLE "industrial_training_assignment_assignees"
  ALTER COLUMN "user_id" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_assignment_assignees_personnel_uidx"
  ON "industrial_training_assignment_assignees" ("assignment_id", "personnel_id")
  WHERE "personnel_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "industrial_training_assignment_assignees_personnel_idx"
  ON "industrial_training_assignment_assignees" ("tenant_id", "personnel_id", "status");

ALTER TABLE "industrial_training_assignment_assignees"
  DROP CONSTRAINT IF EXISTS "industrial_training_assignment_assignees_user_or_personnel_chk";

ALTER TABLE "industrial_training_assignment_assignees"
  ADD CONSTRAINT "industrial_training_assignment_assignees_user_or_personnel_chk"
  CHECK ("user_id" IS NOT NULL OR "personnel_id" IS NOT NULL);
