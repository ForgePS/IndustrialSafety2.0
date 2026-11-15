-- LEGAL ACKNOWLEDGMENTS S1: versioned legal documents, requirements,
-- append-only user acknowledgments, attestation templates & evidence.
-- Additive. Development-first. Do not backfill fake acceptances.

CREATE TABLE IF NOT EXISTS "legal_documents" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "document_key" varchar(128) NOT NULL,
  "product_scope" varchar(64) NOT NULL DEFAULT 'FORGE_INDUSTRIAL',
  "document_type" varchar(64) NOT NULL,
  "title" varchar(500) NOT NULL,
  "description" text,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "current_version_id" uuid,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "legal_documents_global_key_uidx"
  ON "legal_documents" ("document_key") WHERE "tenant_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "legal_documents_tenant_key_uidx"
  ON "legal_documents" ("tenant_id", "document_key") WHERE "tenant_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "legal_documents_product_status_idx"
  ON "legal_documents" ("product_scope", "status");
CREATE INDEX IF NOT EXISTS "legal_documents_tenant_idx"
  ON "legal_documents" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "legal_documents" TO forge_app;
ALTER TABLE "legal_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal_documents_isolation" ON "legal_documents";
CREATE POLICY "legal_documents_isolation" ON "legal_documents"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "legal_document_versions" (
  "id" uuid PRIMARY KEY,
  "legal_document_id" uuid NOT NULL REFERENCES "legal_documents"("id"),
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "version" varchar(64) NOT NULL,
  "version_number" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "published_at" timestamptz,
  "published_by_user_id" uuid REFERENCES "users"("id"),
  "content_format" varchar(32) NOT NULL DEFAULT 'HTML',
  "content" text NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "change_summary" text,
  "material_change" boolean NOT NULL DEFAULT true,
  "requires_reacknowledgment" boolean NOT NULL DEFAULT true,
  "status" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "legal_document_versions_doc_version_uidx"
  ON "legal_document_versions" ("legal_document_id", "version_number");
CREATE INDEX IF NOT EXISTS "legal_document_versions_status_effective_idx"
  ON "legal_document_versions" ("status", "effective_at");
CREATE INDEX IF NOT EXISTS "legal_document_versions_tenant_idx"
  ON "legal_document_versions" ("tenant_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "legal_document_versions" TO forge_app;
ALTER TABLE "legal_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_document_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal_document_versions_isolation" ON "legal_document_versions";
CREATE POLICY "legal_document_versions_isolation" ON "legal_document_versions"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "legal_acknowledgment_requirements" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "product" varchar(64) NOT NULL DEFAULT 'FORGE_INDUSTRIAL',
  "document_id" uuid NOT NULL REFERENCES "legal_documents"("id"),
  "document_version_id" uuid NOT NULL REFERENCES "legal_document_versions"("id"),
  "required" boolean NOT NULL DEFAULT true,
  "required_from" timestamptz NOT NULL,
  "required_until" timestamptz,
  "required_by" timestamptz,
  "role_scope" varchar(128),
  "location_scope" uuid,
  "department_scope" uuid,
  "user_scope" uuid REFERENCES "users"("id"),
  "reacknowledgment_policy" varchar(64) NOT NULL DEFAULT 'ON_MATERIAL_VERSION',
  "blocking_mode" varchar(32) NOT NULL DEFAULT 'BLOCKING',
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "legal_ack_requirements_product_idx"
  ON "legal_acknowledgment_requirements" ("product", "required_from");
CREATE INDEX IF NOT EXISTS "legal_ack_requirements_tenant_idx"
  ON "legal_acknowledgment_requirements" ("tenant_id");
CREATE INDEX IF NOT EXISTS "legal_ack_requirements_version_idx"
  ON "legal_acknowledgment_requirements" ("document_version_id");
GRANT SELECT, INSERT, UPDATE, DELETE ON "legal_acknowledgment_requirements" TO forge_app;
ALTER TABLE "legal_acknowledgment_requirements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_acknowledgment_requirements" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal_ack_requirements_isolation" ON "legal_acknowledgment_requirements";
CREATE POLICY "legal_ack_requirements_isolation" ON "legal_acknowledgment_requirements"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "user_legal_acknowledgments" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product" varchar(64) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "document_id" uuid NOT NULL REFERENCES "legal_documents"("id"),
  "document_version_id" uuid NOT NULL REFERENCES "legal_document_versions"("id"),
  "document_key" varchar(128) NOT NULL,
  "document_version" varchar(64) NOT NULL,
  "document_hash" varchar(64) NOT NULL,
  "acknowledgment_type" varchar(64) NOT NULL DEFAULT 'PLATFORM_USER',
  "acknowledgment_text_version" varchar(64),
  "accepted_at" timestamptz NOT NULL,
  "accepted_action" varchar(64) NOT NULL,
  "auth_session_id" varchar(128),
  "ip_address" varchar(64),
  "user_agent" text,
  "device_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source" varchar(64) NOT NULL DEFAULT 'LOGIN_GATE',
  "personnel_id" uuid,
  "location_id" uuid,
  "department_id" uuid,
  "role_snapshot" jsonb,
  "email_snapshot" varchar(320),
  "display_name_snapshot" varchar(320),
  "status" varchar(32) NOT NULL DEFAULT 'ACKNOWLEDGED',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_legal_acknowledgments_active_uidx"
  ON "user_legal_acknowledgments" ("tenant_id", "user_id", "document_version_id");
CREATE INDEX IF NOT EXISTS "user_legal_acknowledgments_user_idx"
  ON "user_legal_acknowledgments" ("tenant_id", "user_id", "accepted_at");
CREATE INDEX IF NOT EXISTS "user_legal_acknowledgments_document_idx"
  ON "user_legal_acknowledgments" ("document_id", "document_version_id");
GRANT SELECT, INSERT ON "user_legal_acknowledgments" TO forge_app;
REVOKE UPDATE, DELETE ON "user_legal_acknowledgments" FROM forge_app;
ALTER TABLE "user_legal_acknowledgments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_legal_acknowledgments" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_legal_acknowledgments_select" ON "user_legal_acknowledgments";
CREATE POLICY "user_legal_acknowledgments_select" ON "user_legal_acknowledgments"
  FOR SELECT
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS "user_legal_acknowledgments_insert" ON "user_legal_acknowledgments";
CREATE POLICY "user_legal_acknowledgments_insert" ON "user_legal_acknowledgments"
  FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "legal_acknowledgment_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "acknowledgment_id" uuid NOT NULL REFERENCES "user_legal_acknowledgments"("id"),
  "event_type" varchar(64) NOT NULL,
  "reason" text,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "legal_acknowledgment_events_ack_idx"
  ON "legal_acknowledgment_events" ("acknowledgment_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "legal_acknowledgment_events_tenant_idx"
  ON "legal_acknowledgment_events" ("tenant_id", "occurred_at");
GRANT SELECT, INSERT ON "legal_acknowledgment_events" TO forge_app;
REVOKE UPDATE, DELETE ON "legal_acknowledgment_events" FROM forge_app;
ALTER TABLE "legal_acknowledgment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_acknowledgment_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "legal_acknowledgment_events_select" ON "legal_acknowledgment_events";
CREATE POLICY "legal_acknowledgment_events_select" ON "legal_acknowledgment_events"
  FOR SELECT
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS "legal_acknowledgment_events_insert" ON "legal_acknowledgment_events";
CREATE POLICY "legal_acknowledgment_events_insert" ON "legal_acknowledgment_events"
  FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "attestation_templates" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "template_key" varchar(128) NOT NULL,
  "product" varchar(64) NOT NULL DEFAULT 'FORGE_INDUSTRIAL',
  "module" varchar(64) NOT NULL,
  "title" varchar(500) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "current_version_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "attestation_templates_global_key_uidx"
  ON "attestation_templates" ("template_key") WHERE "tenant_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "attestation_templates_tenant_key_uidx"
  ON "attestation_templates" ("tenant_id", "template_key") WHERE "tenant_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "attestation_templates_product_module_idx"
  ON "attestation_templates" ("product", "module");
GRANT SELECT, INSERT, UPDATE, DELETE ON "attestation_templates" TO forge_app;
ALTER TABLE "attestation_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attestation_templates" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attestation_templates_isolation" ON "attestation_templates";
CREATE POLICY "attestation_templates_isolation" ON "attestation_templates"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "attestation_template_versions" (
  "id" uuid PRIMARY KEY,
  "template_id" uuid NOT NULL REFERENCES "attestation_templates"("id"),
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "version" varchar(64) NOT NULL,
  "version_number" integer NOT NULL,
  "attestation_text" text NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "attestation_template_versions_uidx"
  ON "attestation_template_versions" ("template_id", "version_number");
GRANT SELECT, INSERT, UPDATE, DELETE ON "attestation_template_versions" TO forge_app;
ALTER TABLE "attestation_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attestation_template_versions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "attestation_template_versions_isolation" ON "attestation_template_versions";
CREATE POLICY "attestation_template_versions_isolation" ON "attestation_template_versions"
  USING (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid
  );

CREATE TABLE IF NOT EXISTS "transaction_attestations" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "product" varchar(64) NOT NULL,
  "module" varchar(64) NOT NULL,
  "record_type" varchar(128) NOT NULL,
  "record_id" uuid NOT NULL,
  "action" varchar(128) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "personnel_id" uuid,
  "attestation_template_id" uuid REFERENCES "attestation_templates"("id"),
  "attestation_version" varchar(64) NOT NULL,
  "attestation_text" text NOT NULL,
  "attestation_hash" varchar(64) NOT NULL,
  "record_snapshot_hash" varchar(64),
  "signed_at" timestamptz NOT NULL,
  "auth_session_id" varchar(128),
  "ip_address" varchar(64),
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "transaction_attestations_record_idx"
  ON "transaction_attestations" ("tenant_id", "record_type", "record_id");
CREATE INDEX IF NOT EXISTS "transaction_attestations_user_idx"
  ON "transaction_attestations" ("tenant_id", "user_id", "signed_at");
GRANT SELECT, INSERT ON "transaction_attestations" TO forge_app;
REVOKE UPDATE, DELETE ON "transaction_attestations" FROM forge_app;
ALTER TABLE "transaction_attestations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transaction_attestations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "transaction_attestations_select" ON "transaction_attestations";
CREATE POLICY "transaction_attestations_select" ON "transaction_attestations"
  FOR SELECT
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS "transaction_attestations_insert" ON "transaction_attestations";
CREATE POLICY "transaction_attestations_insert" ON "transaction_attestations"
  FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
