-- 0087_industrial_document_control_qms_s1
-- Controlled Document QMS: workflow, distributions, acknowledgments on platform_documents.

-- Align / extend platform_documents
ALTER TABLE "platform_documents"
  ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "industrial_sites"("id"),
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "document_number" varchar(120),
  ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "review_due_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "current_approved_version_id" uuid,
  ADD COLUMN IF NOT EXISTS "workflow_status" varchar(64) NOT NULL DEFAULT 'DRAFT';

-- Align / extend platform_document_versions
ALTER TABLE "platform_document_versions"
  ADD COLUMN IF NOT EXISTS "workflow_status" varchar(64) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS "change_summary" text,
  ADD COLUMN IF NOT EXISTS "submitted_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "submitted_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "approved_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "approved_at" timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'platform_documents_current_approved_version_fk'
  ) THEN
    ALTER TABLE "platform_documents"
      ADD CONSTRAINT "platform_documents_current_approved_version_fk"
      FOREIGN KEY ("current_approved_version_id")
      REFERENCES "platform_document_versions"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "platform_documents_tenant_workflow_idx"
  ON "platform_documents" ("tenant_id", "workflow_status");
CREATE INDEX IF NOT EXISTS "platform_documents_tenant_review_due_idx"
  ON "platform_documents" ("tenant_id", "review_due_at");
CREATE INDEX IF NOT EXISTS "platform_document_versions_workflow_idx"
  ON "platform_document_versions" ("tenant_id", "document_id", "workflow_status");

-- Backfill migrated ACTIVE docs with versions as PUBLISHED / APPROVED
UPDATE "platform_document_versions" v
SET "workflow_status" = 'APPROVED',
    "updated_at" = now()
WHERE v."archived_at" IS NULL
  AND upper(coalesce(v."status", 'ACTIVE')) = 'ACTIVE'
  AND coalesce(v."workflow_status", 'DRAFT') IN ('DRAFT', '');

UPDATE "platform_documents" d
SET "workflow_status" = 'PUBLISHED',
    "updated_at" = now(),
    "current_approved_version_id" = (
      SELECT v."id"
      FROM "platform_document_versions" v
      WHERE v."document_id" = d."id"
        AND v."tenant_id" = d."tenant_id"
        AND v."archived_at" IS NULL
        AND coalesce(v."workflow_status", 'APPROVED') = 'APPROVED'
      ORDER BY v."version_number" DESC, v."created_at" DESC
      LIMIT 1
    )
WHERE d."archived_at" IS NULL
  AND upper(coalesce(d."status", 'ACTIVE')) IN ('ACTIVE', 'PUBLISHED')
  AND EXISTS (
    SELECT 1 FROM "platform_document_versions" v
    WHERE v."document_id" = d."id" AND v."archived_at" IS NULL
  );

CREATE TABLE IF NOT EXISTS "platform_document_distributions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "platform_documents"("id") ON DELETE CASCADE,
  "scope_type" varchar(32) NOT NULL,
  "scope_id" uuid,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "platform_document_distributions_doc_idx"
  ON "platform_document_distributions" ("tenant_id", "document_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_document_distributions" TO forge_app;
ALTER TABLE "platform_document_distributions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_document_distributions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_document_distributions_tenant_isolation" ON "platform_document_distributions";
CREATE POLICY "platform_document_distributions_tenant_isolation" ON "platform_document_distributions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "platform_document_ack_requirements" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "platform_documents"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "platform_document_versions"("id") ON DELETE CASCADE,
  "distribution_id" uuid REFERENCES "platform_document_distributions"("id") ON DELETE SET NULL,
  "required" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "platform_document_ack_requirements_version_idx"
  ON "platform_document_ack_requirements" ("tenant_id", "version_id");
CREATE INDEX IF NOT EXISTS "platform_document_ack_requirements_doc_idx"
  ON "platform_document_ack_requirements" ("tenant_id", "document_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_document_ack_requirements" TO forge_app;
ALTER TABLE "platform_document_ack_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_document_ack_requirements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_document_ack_requirements_tenant_isolation" ON "platform_document_ack_requirements";
CREATE POLICY "platform_document_ack_requirements_tenant_isolation" ON "platform_document_ack_requirements"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "platform_document_acknowledgments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "document_id" uuid NOT NULL REFERENCES "platform_documents"("id") ON DELETE CASCADE,
  "version_id" uuid NOT NULL REFERENCES "platform_document_versions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "accepted_at" timestamptz NOT NULL DEFAULT now(),
  "source" varchar(64) NOT NULL DEFAULT 'DOCUMENT_CONTROL',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_document_acknowledgments_user_version_uidx"
  ON "platform_document_acknowledgments" ("tenant_id", "user_id", "version_id");
CREATE INDEX IF NOT EXISTS "platform_document_acknowledgments_doc_idx"
  ON "platform_document_acknowledgments" ("tenant_id", "document_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_document_acknowledgments" TO forge_app;
ALTER TABLE "platform_document_acknowledgments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_document_acknowledgments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_document_acknowledgments_tenant_isolation" ON "platform_document_acknowledgments";
CREATE POLICY "platform_document_acknowledgments_tenant_isolation" ON "platform_document_acknowledgments"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- Default TENANT distribution for published migrated docs (ack-ready)
INSERT INTO "platform_document_distributions" ("id", "tenant_id", "document_id", "scope_type", "scope_id", "enabled", "created_at", "updated_at")
SELECT gen_random_uuid(), d."tenant_id", d."id", 'TENANT', NULL, true, now(), now()
FROM "platform_documents" d
WHERE d."archived_at" IS NULL
  AND d."workflow_status" = 'PUBLISHED'
  AND NOT EXISTS (
    SELECT 1 FROM "platform_document_distributions" x
    WHERE x."document_id" = d."id" AND x."tenant_id" = d."tenant_id"
  );

-- Permissions (also mirrored in @forge/contracts INDUSTRIAL_PERMISSIONS)
INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT gen_random_uuid(), v.code, v.name, v.description, 'TENANT', v.risk_level, v.is_sensitive, now(), now()
FROM (VALUES
  ('industrial.documents.view', 'View controlled documents', 'View Document Control library, versions, and published files', 'NORMAL', false),
  ('industrial.documents.manage', 'Manage controlled documents', 'Create documents, upload versions, edit metadata, and set distribution', 'ELEVATED', false),
  ('industrial.documents.approve', 'Approve controlled documents', 'Approve or reject document versions in review', 'ELEVATED', true),
  ('industrial.documents.acknowledge', 'Acknowledge controlled documents', 'Acknowledge required published document versions', 'NORMAL', false)
) AS v(code, name, description, risk_level, is_sensitive)
WHERE NOT EXISTS (SELECT 1 FROM "permissions" p WHERE p.code = v.code);

-- Grant new document permissions to roles that already have industrial.admin
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", p."id"
FROM "role_permissions" rp
JOIN "permissions" admin_p ON admin_p."id" = rp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.documents.view',
  'industrial.documents.manage',
  'industrial.documents.approve',
  'industrial.documents.acknowledge'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = rp."role_id" AND existing."permission_id" = p."id"
);

-- Grant to role templates that already include industrial.admin
INSERT INTO "role_template_permissions" ("role_template_id", "permission_id")
SELECT DISTINCT rtp."role_template_id", p."id"
FROM "role_template_permissions" rtp
JOIN "permissions" admin_p ON admin_p."id" = rtp."permission_id" AND admin_p."code" = 'industrial.admin'
JOIN "permissions" p ON p."code" IN (
  'industrial.documents.view',
  'industrial.documents.manage',
  'industrial.documents.approve',
  'industrial.documents.acknowledge'
)
WHERE NOT EXISTS (
  SELECT 1 FROM "role_template_permissions" existing
  WHERE existing."role_template_id" = rtp."role_template_id"
    AND existing."permission_id" = p."id"
);
