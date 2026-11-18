-- FORGE-SAAS MK-S15: tenant API keys + outbound webhook endpoints/deliveries.
-- Not applied to production in this sprint. Distinct from CAD/billing inbound webhooks.

CREATE TABLE IF NOT EXISTS "tenant_api_keys" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL,
  "key_prefix" varchar(32) NOT NULL,
  "display_hint" varchar(64) NOT NULL,
  "key_hash" varchar(64) NOT NULL,
  "scopes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "expires_at" timestamptz,
  "last_used_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_api_keys_key_hash_uidx"
  ON "tenant_api_keys" ("key_hash");
CREATE INDEX IF NOT EXISTS "tenant_api_keys_tenant_created_idx"
  ON "tenant_api_keys" ("tenant_id", "created_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_api_keys" TO forge_app;
ALTER TABLE "tenant_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_api_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_api_keys_tenant_isolation" ON "tenant_api_keys";
CREATE POLICY "tenant_api_keys_tenant_isolation" ON "tenant_api_keys"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "tenant_webhook_endpoints" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "name" varchar(120) NOT NULL,
  "endpoint_url" text NOT NULL,
  "event_types_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "signing_secret" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "disabled_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tenant_webhook_endpoints_tenant_idx"
  ON "tenant_webhook_endpoints" ("tenant_id", "created_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_webhook_endpoints" TO forge_app;
ALTER TABLE "tenant_webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_webhook_endpoints" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_webhook_endpoints_tenant_isolation" ON "tenant_webhook_endpoints";
CREATE POLICY "tenant_webhook_endpoints_tenant_isolation" ON "tenant_webhook_endpoints"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS "tenant_webhook_deliveries" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "endpoint_id" uuid NOT NULL REFERENCES "tenant_webhook_endpoints"("id"),
  "event_type" varchar(120) NOT NULL,
  "payload_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(32) NOT NULL DEFAULT 'PENDING',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "http_status" integer,
  "duration_ms" integer,
  "response_body_preview" text,
  "error_message" text,
  "last_attempt_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tenant_webhook_deliveries_endpoint_created_idx"
  ON "tenant_webhook_deliveries" ("endpoint_id", "created_at");
CREATE INDEX IF NOT EXISTS "tenant_webhook_deliveries_tenant_status_idx"
  ON "tenant_webhook_deliveries" ("tenant_id", "status");

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_webhook_deliveries" TO forge_app;
ALTER TABLE "tenant_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_webhook_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_webhook_deliveries_tenant_isolation" ON "tenant_webhook_deliveries";
CREATE POLICY "tenant_webhook_deliveries_tenant_isolation" ON "tenant_webhook_deliveries"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.api_key.read',
  'Read tenant API keys',
  'List API key metadata (never raw secrets) for the current tenant',
  'TENANT',
  'NORMAL',
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.api_key.read'
);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.api_key.manage',
  'Manage tenant API keys',
  'Create and revoke tenant API keys; raw key shown once at creation',
  'TENANT',
  'ELEVATED',
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.api_key.manage'
);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.webhook.read',
  'Read tenant webhooks',
  'List outbound webhook endpoints and delivery history for the current tenant',
  'TENANT',
  'NORMAL',
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.webhook.read'
);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.webhook.manage',
  'Manage tenant webhooks',
  'Create, disable, rotate, deliver, and replay outbound webhooks for the current tenant',
  'TENANT',
  'ELEVATED',
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.webhook.manage'
);
