-- INDUSTRIAL TRAINING EMPLOYEE NUMBER S1: assignees keyed by employee_number.
-- Additive. Tenant RLS.

ALTER TABLE "industrial_training_assignment_assignees"
  ADD COLUMN IF NOT EXISTS "employee_number" varchar(120);

UPDATE "industrial_training_assignment_assignees" AS aa
SET "employee_number" = trim(p."employee_number")
FROM "industrial_personnel" AS p
WHERE aa."personnel_id" = p."id"
  AND (aa."employee_number" IS NULL OR trim(aa."employee_number") = '');

CREATE INDEX IF NOT EXISTS "industrial_training_assignment_assignees_employee_idx"
  ON "industrial_training_assignment_assignees" ("tenant_id", "employee_number", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_assignment_assignees_employee_uidx"
  ON "industrial_training_assignment_assignees" ("assignment_id", lower(trim("employee_number")))
  WHERE "employee_number" IS NOT NULL AND trim("employee_number") <> '';
