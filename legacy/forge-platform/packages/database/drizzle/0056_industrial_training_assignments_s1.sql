-- INDUSTRIAL TRAINING ASSIGNMENTS S1: groups, assignments, per-user progress.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_training_groups" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(200) NOT NULL,
  "description" text,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_groups_tenant_idx"
  ON "industrial_training_groups" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_groups" TO forge_app;
ALTER TABLE "industrial_training_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_groups" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_groups_tenant_isolation" ON "industrial_training_groups";
CREATE POLICY "industrial_training_groups_tenant_isolation" ON "industrial_training_groups"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_group_members" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "group_id" uuid NOT NULL REFERENCES "industrial_training_groups"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_group_members_uidx"
  ON "industrial_training_group_members" ("group_id", "user_id");
CREATE INDEX IF NOT EXISTS "industrial_training_group_members_user_idx"
  ON "industrial_training_group_members" ("tenant_id", "user_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_group_members" TO forge_app;
ALTER TABLE "industrial_training_group_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_group_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_group_members_tenant_isolation" ON "industrial_training_group_members";
CREATE POLICY "industrial_training_group_members_tenant_isolation" ON "industrial_training_group_members"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_assignments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "title" varchar(500) NOT NULL,
  "description" text,
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id"),
  "material_id" uuid REFERENCES "industrial_training_materials"("id") ON DELETE SET NULL,
  "chapter_ids" jsonb NOT NULL DEFAULT '[]',
  "due_at" timestamptz,
  "passing_percent" integer NOT NULL DEFAULT 70,
  "quiz_mode" varchar(32) NOT NULL DEFAULT 'STANDARD',
  "option_count" integer NOT NULL DEFAULT 4,
  "feedback_enabled" boolean NOT NULL DEFAULT true,
  "timer_seconds" integer,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_assignments_tenant_idx"
  ON "industrial_training_assignments" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_training_assignments_source_idx"
  ON "industrial_training_assignments" ("tenant_id", "source_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_assignments" TO forge_app;
ALTER TABLE "industrial_training_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_assignments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_assignments_tenant_isolation" ON "industrial_training_assignments";
CREATE POLICY "industrial_training_assignments_tenant_isolation" ON "industrial_training_assignments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_training_assignment_assignees" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "industrial_training_assignments"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'NOT_STARTED',
  "attempt_id" uuid REFERENCES "industrial_training_attempts"("id") ON DELETE SET NULL,
  "best_percent" integer,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_assignment_assignees_uidx"
  ON "industrial_training_assignment_assignees" ("assignment_id", "user_id");
CREATE INDEX IF NOT EXISTS "industrial_training_assignment_assignees_user_idx"
  ON "industrial_training_assignment_assignees" ("tenant_id", "user_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_assignment_assignees" TO forge_app;
ALTER TABLE "industrial_training_assignment_assignees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_assignment_assignees" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_assignment_assignees_tenant_isolation" ON "industrial_training_assignment_assignees";
CREATE POLICY "industrial_training_assignment_assignees_tenant_isolation" ON "industrial_training_assignment_assignees"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_training_attempts"
  ADD COLUMN IF NOT EXISTS "assignment_id" uuid REFERENCES "industrial_training_assignments"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "industrial_training_attempts_assignment_idx"
  ON "industrial_training_attempts" ("tenant_id", "assignment_id");

ALTER TABLE "industrial_training_quizzes"
  ADD COLUMN IF NOT EXISTS "assignment_id" uuid REFERENCES "industrial_training_assignments"("id") ON DELETE SET NULL;
