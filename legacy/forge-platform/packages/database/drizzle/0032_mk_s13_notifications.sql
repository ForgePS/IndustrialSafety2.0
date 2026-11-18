-- FORGE-SAAS MK-S13: in-app notifications + email template permission seeds.
-- Does not configure production SES identities.

CREATE TABLE IF NOT EXISTS "user_notifications" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "type" varchar(120) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "priority" varchar(32) NOT NULL DEFAULT 'NORMAL',
  "destination" varchar(32) NOT NULL DEFAULT 'IN_APP',
  "href" varchar(500),
  "read_at" timestamptz,
  "expires_at" timestamptz,
  "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_notifications_tenant_user_created_idx"
  ON "user_notifications" ("tenant_id", "user_id", "created_at");

CREATE INDEX IF NOT EXISTS "user_notifications_tenant_user_unread_idx"
  ON "user_notifications" ("tenant_id", "user_id", "read_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_notifications" TO forge_app;

ALTER TABLE "user_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_notifications" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_notifications_tenant_isolation" ON "user_notifications";
CREATE POLICY "user_notifications_tenant_isolation" ON "user_notifications"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.notification.read',
  'Read own notifications',
  'List inbox and unread counts for the authenticated user in the current tenant',
  'TENANT',
  'NORMAL',
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.notification.read'
);

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.notification.manage',
  'Manage tenant notifications',
  'Create or broadcast tenant notifications and trigger templated email delivery',
  'TENANT',
  'ELEVATED',
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.notification.manage'
);
