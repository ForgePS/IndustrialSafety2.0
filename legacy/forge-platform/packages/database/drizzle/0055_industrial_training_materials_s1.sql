-- INDUSTRIAL TRAINING MATERIALS S1: uploadable PPT/PDF/video/doc study assets.
-- Additive. Tenant RLS. Links to forge_documents for S3 object metadata.

CREATE TABLE IF NOT EXISTS "industrial_training_materials" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL,
  "title" varchar(300) NOT NULL,
  "description" text,
  "category" varchar(64) NOT NULL DEFAULT 'GENERAL',
  "mime_type" varchar(255) NOT NULL,
  "original_filename" varchar(500) NOT NULL,
  "byte_size" integer NOT NULL DEFAULT 0,
  "status" varchar(64) NOT NULL DEFAULT 'PENDING_UPLOAD',
  "visibility" varchar(32) NOT NULL DEFAULT 'PUBLISHED',
  "source_id" uuid REFERENCES "industrial_training_sources"("id") ON DELETE SET NULL,
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_training_materials_tenant_idx"
  ON "industrial_training_materials" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "industrial_training_materials_source_idx"
  ON "industrial_training_materials" ("tenant_id", "source_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_materials" TO forge_app;
ALTER TABLE "industrial_training_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_materials" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_materials_tenant_isolation" ON "industrial_training_materials";
CREATE POLICY "industrial_training_materials_tenant_isolation" ON "industrial_training_materials"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
