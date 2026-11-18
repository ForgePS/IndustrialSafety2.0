-- 0103_forge_photo_markup_s1 — Photo markup originals + revision history
-- Additive. Tenant RLS. Originals are never overwritten.

CREATE TABLE IF NOT EXISTS "forge_photos" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "original_document_id" uuid NOT NULL REFERENCES "forge_documents"("id"),
  "original_file_name" varchar(500) NOT NULL,
  "mime_type" varchar(255) NOT NULL,
  "width" integer,
  "height" integer,
  "file_size_bytes" integer,
  "source" varchar(40) NOT NULL DEFAULT 'upload',
  "module" varchar(80),
  "record_id" uuid,
  "location_id" uuid,
  "division_id" uuid,
  "captured_by_user_id" uuid REFERENCES "users"("id"),
  "uploaded_by_user_id" uuid REFERENCES "users"("id"),
  "captured_at" timestamptz,
  "uploaded_at" timestamptz NOT NULL DEFAULT now(),
  "caption" text,
  "description" text,
  "has_markup" boolean NOT NULL DEFAULT false,
  "current_revision_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "record_version" integer NOT NULL DEFAULT 1,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "forge_photos_tenant_idx" ON "forge_photos" ("tenant_id");
CREATE INDEX IF NOT EXISTS "forge_photos_tenant_module_record_idx"
  ON "forge_photos" ("tenant_id", "module", "record_id");
CREATE INDEX IF NOT EXISTS "forge_photos_original_document_idx"
  ON "forge_photos" ("original_document_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "forge_photos" TO forge_app;
ALTER TABLE "forge_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forge_photos" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "forge_photos_tenant_isolation" ON "forge_photos";
CREATE POLICY "forge_photos_tenant_isolation" ON "forge_photos"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "photo_markup_revisions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "photo_id" uuid NOT NULL REFERENCES "forge_photos"("id"),
  "version" integer NOT NULL,
  "status" varchar(40) NOT NULL DEFAULT 'final',
  "annotation_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "annotation_document_id" uuid REFERENCES "forge_documents"("id"),
  "rendered_document_id" uuid REFERENCES "forge_documents"("id"),
  "thumbnail_document_id" uuid REFERENCES "forge_documents"("id"),
  "canvas_width" integer NOT NULL DEFAULT 0,
  "canvas_height" integer NOT NULL DEFAULT 0,
  "source_revision_id" uuid,
  "notes" text,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "photo_markup_revisions_photo_idx"
  ON "photo_markup_revisions" ("photo_id");
CREATE UNIQUE INDEX IF NOT EXISTS "photo_markup_revisions_photo_version_uidx"
  ON "photo_markup_revisions" ("photo_id", "version");
CREATE INDEX IF NOT EXISTS "photo_markup_revisions_tenant_idx"
  ON "photo_markup_revisions" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "photo_markup_revisions" TO forge_app;
ALTER TABLE "photo_markup_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "photo_markup_revisions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "photo_markup_revisions_tenant_isolation" ON "photo_markup_revisions";
CREATE POLICY "photo_markup_revisions_tenant_isolation" ON "photo_markup_revisions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
