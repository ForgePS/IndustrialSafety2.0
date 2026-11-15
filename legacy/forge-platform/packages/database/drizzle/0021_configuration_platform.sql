-- Configuration Platform — versioned config objects (Master Directive Phase 4 / roadmap Phase 8 product).
-- Additive only. FORCE RLS on tenant-owned tables.

CREATE TABLE IF NOT EXISTS "config_objects" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "namespace" varchar(64) NOT NULL,
  "object_key" varchar(120) NOT NULL,
  "display_name" varchar(200) NOT NULL,
  "current_published_version_id" uuid,
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "config_objects_tenant_ns_key_uidx"
  ON "config_objects" ("tenant_id", "namespace", "object_key");
CREATE INDEX IF NOT EXISTS "config_objects_tenant_ns_idx"
  ON "config_objects" ("tenant_id", "namespace");

CREATE TABLE IF NOT EXISTS "config_versions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "object_id" uuid NOT NULL REFERENCES "config_objects"("id"),
  "version" integer NOT NULL,
  "state" varchar(32) NOT NULL DEFAULT 'DRAFT',
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "content_hash" varchar(128) NOT NULL,
  "change_summary" text,
  "effective_from" timestamptz,
  "effective_to" timestamptz,
  "published_at" timestamptz,
  "scheduled_for" timestamptz,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "published_by_user_id" uuid REFERENCES "users"("id"),
  "supersedes_version_id" uuid REFERENCES "config_versions"("id"),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "config_versions_object_version_uidx"
  ON "config_versions" ("object_id", "version");
CREATE INDEX IF NOT EXISTS "config_versions_tenant_state_idx"
  ON "config_versions" ("tenant_id", "state", "created_at");
CREATE INDEX IF NOT EXISTS "config_versions_object_state_idx"
  ON "config_versions" ("object_id", "state");

ALTER TABLE "config_objects"
  DROP CONSTRAINT IF EXISTS "config_objects_current_published_version_id_fkey";
ALTER TABLE "config_objects"
  ADD CONSTRAINT "config_objects_current_published_version_id_fkey"
  FOREIGN KEY ("current_published_version_id") REFERENCES "config_versions"("id");

ALTER TABLE config_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_objects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS config_objects_tenant_isolation ON config_objects;
CREATE POLICY config_objects_tenant_isolation ON config_objects
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

ALTER TABLE config_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS config_versions_tenant_isolation ON config_versions;
CREATE POLICY config_versions_tenant_isolation ON config_versions
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
