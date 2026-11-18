-- FORGE-SAAS MK-S1: canonical tenant facilities + DEPARTMENT organization type allowance.
-- Additive only. Does not rename tenants / rms_stations / config studio documents.

CREATE TABLE IF NOT EXISTS "facilities" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "organization_id" uuid REFERENCES "organizations"("id"),
  "facility_key" varchar(120) NOT NULL,
  "name" varchar(200) NOT NULL,
  "facility_type" varchar(64) NOT NULL DEFAULT 'SITE',
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "address_line_1" varchar(300),
  "address_line_2" varchar(300),
  "city" varchar(120),
  "state_province" varchar(120),
  "postal_code" varchar(32),
  "country_code" varchar(2),
  "timezone" varchar(64),
  "record_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  CONSTRAINT "facilities_status_check"
    CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "facilities_tenant_key_uidx"
  ON "facilities" ("tenant_id", "facility_key");
CREATE INDEX IF NOT EXISTS "facilities_tenant_status_idx"
  ON "facilities" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "facilities_tenant_org_idx"
  ON "facilities" ("tenant_id", "organization_id");

GRANT SELECT, INSERT, UPDATE, DELETE ON "facilities" TO forge_app;

DO $$
BEGIN
  EXECUTE 'ALTER TABLE facilities ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE facilities FORCE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS facilities_tenant_isolation ON facilities';
  EXECUTE $policy$
    CREATE POLICY facilities_tenant_isolation ON facilities
      USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  $policy$;
END
$$;
