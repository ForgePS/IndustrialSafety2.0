-- 0050_industrial_inspections_workflow_s1
-- Department contacts, inspection typed columns alignment helpers, CA close-out tokens.

ALTER TABLE "industrial_departments"
  ADD COLUMN IF NOT EXISTS "contact_personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  ADD COLUMN IF NOT EXISTS "contact_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "contact_email" varchar(320);

ALTER TABLE "industrial_corrective_actions"
  ADD COLUMN IF NOT EXISTS "closeout_token_hash" varchar(128),
  ADD COLUMN IF NOT EXISTS "closeout_token_expires_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "closeout_completed_by_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "owner_name" varchar(300),
  ADD COLUMN IF NOT EXISTS "evidence_notes" text,
  ADD COLUMN IF NOT EXISTS "finding" text,
  ADD COLUMN IF NOT EXISTS "required_action" text;

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_corrective_actions_closeout_token_uidx"
  ON "industrial_corrective_actions" ("closeout_token_hash")
  WHERE "closeout_token_hash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "industrial_corrective_actions_parent_idx"
  ON "industrial_corrective_actions" ("tenant_id", "parent_entity_type", "parent_entity_id");
