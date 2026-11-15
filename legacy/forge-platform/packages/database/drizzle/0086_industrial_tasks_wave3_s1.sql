-- INDUSTRIAL TASKS WAVE 3: subtasks, checklist items, activity trail.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_task_subtasks" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "task_id" uuid NOT NULL REFERENCES "industrial_tasks"("id") ON DELETE CASCADE,
  "title" varchar(500) NOT NULL,
  "is_done" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "industrial_task_subtasks_task_idx"
  ON "industrial_task_subtasks" ("tenant_id", "task_id", "sort_order");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_task_subtasks" TO forge_app;
ALTER TABLE "industrial_task_subtasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_task_subtasks" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_task_subtasks_tenant_isolation" ON "industrial_task_subtasks";
CREATE POLICY "industrial_task_subtasks_tenant_isolation" ON "industrial_task_subtasks"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_task_checklist_items" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "task_id" uuid NOT NULL REFERENCES "industrial_tasks"("id") ON DELETE CASCADE,
  "title" varchar(500) NOT NULL,
  "is_done" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "industrial_task_checklist_items_task_idx"
  ON "industrial_task_checklist_items" ("tenant_id", "task_id", "sort_order");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_task_checklist_items" TO forge_app;
ALTER TABLE "industrial_task_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_task_checklist_items" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_task_checklist_items_tenant_isolation" ON "industrial_task_checklist_items";
CREATE POLICY "industrial_task_checklist_items_tenant_isolation" ON "industrial_task_checklist_items"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_task_activity" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "task_id" uuid NOT NULL REFERENCES "industrial_tasks"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "action" varchar(64) NOT NULL,
  "detail_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "industrial_task_activity_task_idx"
  ON "industrial_task_activity" ("tenant_id", "task_id", "created_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_task_activity" TO forge_app;
ALTER TABLE "industrial_task_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_task_activity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_task_activity_tenant_isolation" ON "industrial_task_activity";
CREATE POLICY "industrial_task_activity_tenant_isolation" ON "industrial_task_activity"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
