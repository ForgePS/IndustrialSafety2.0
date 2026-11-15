-- ONBOARDING-CLOSEOUT-S1: durable org lookups for Positions and Employment Types.
-- Additive. Tenant-isolated via RLS. Extends industrial personnel FKs.

CREATE TABLE IF NOT EXISTS "industrial_positions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "department_id" uuid REFERENCES "industrial_departments"("id"),
  "name" varchar(200) NOT NULL,
  "description" varchar(1000),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FORGE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_positions_tenant_name_uidx"
  ON "industrial_positions" ("tenant_id", "name") WHERE "archived_at" IS NULL;
CREATE INDEX IF NOT EXISTS "industrial_positions_tenant_dept_idx"
  ON "industrial_positions" ("tenant_id", "department_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_positions" TO forge_app;
ALTER TABLE "industrial_positions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_positions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_positions_tenant_isolation" ON "industrial_positions";
CREATE POLICY "industrial_positions_tenant_isolation" ON "industrial_positions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "industrial_employment_types" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL,
  "description" varchar(1000),
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "source_system" varchar(64) NOT NULL DEFAULT 'FORGE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "industrial_employment_types_tenant_name_uidx"
  ON "industrial_employment_types" ("tenant_id", "name") WHERE "archived_at" IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_employment_types" TO forge_app;
ALTER TABLE "industrial_employment_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_employment_types" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_employment_types_tenant_isolation" ON "industrial_employment_types";
CREATE POLICY "industrial_employment_types_tenant_isolation" ON "industrial_employment_types"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE "industrial_personnel"
  ADD COLUMN IF NOT EXISTS "position_id" uuid REFERENCES "industrial_positions"("id"),
  ADD COLUMN IF NOT EXISTS "employment_type_id" uuid REFERENCES "industrial_employment_types"("id"),
  ADD COLUMN IF NOT EXISTS "hire_date" date,
  ADD COLUMN IF NOT EXISTS "phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "supervisor_name" varchar(300);

CREATE TABLE IF NOT EXISTS "platform_company_documents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL,
  "title" varchar(300) NOT NULL,
  "category" varchar(64) NOT NULL DEFAULT 'GENERAL',
  "mime_type" varchar(255) NOT NULL,
  "original_filename" varchar(500) NOT NULL,
  "byte_size" integer NOT NULL,
  "status" varchar(64) NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "platform_company_documents_tenant_idx"
  ON "platform_company_documents" ("tenant_id", "status");
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_company_documents" TO forge_app;
ALTER TABLE "platform_company_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_company_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_company_documents_tenant_isolation" ON "platform_company_documents";
CREATE POLICY "platform_company_documents_tenant_isolation" ON "platform_company_documents"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
