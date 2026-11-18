-- INDUSTRIAL TRAINING SOURCE FOLDERS S1: organize materials within a study source.
-- Additive. Tenant RLS.

CREATE TABLE IF NOT EXISTS "industrial_training_source_folders" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "source_id" uuid NOT NULL REFERENCES "industrial_training_sources"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_source_folders_source_idx"
  ON "industrial_training_source_folders" ("tenant_id", "source_id", "sort_order");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_source_folders" TO forge_app;
ALTER TABLE "industrial_training_source_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_source_folders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_source_folders_tenant_isolation" ON "industrial_training_source_folders";
CREATE POLICY "industrial_training_source_folders_tenant_isolation" ON "industrial_training_source_folders"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_training_materials"
  ADD COLUMN IF NOT EXISTS "folder_id" uuid REFERENCES "industrial_training_source_folders"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "industrial_training_materials_folder_idx"
  ON "industrial_training_materials" ("tenant_id", "source_id", "folder_id");
