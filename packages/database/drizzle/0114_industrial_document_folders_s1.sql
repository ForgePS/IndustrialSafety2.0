-- 0114_industrial_document_folders_s1
-- Document Control folders that users create as needed. A document belongs to a folder
-- when its platform_documents.category equals the folder name, so empty folders persist
-- here until documents are filed in them.

CREATE TABLE IF NOT EXISTS "platform_document_folders" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "platform_document_folders_tenant_name_uidx"
  ON "platform_document_folders" ("tenant_id", lower("name"));

GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_document_folders" TO forge_app;
ALTER TABLE "platform_document_folders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_document_folders" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_document_folders_tenant_isolation" ON "platform_document_folders";
CREATE POLICY "platform_document_folders_tenant_isolation" ON "platform_document_folders"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
