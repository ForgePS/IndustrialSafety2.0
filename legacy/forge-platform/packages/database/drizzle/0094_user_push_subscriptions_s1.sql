-- Web Push subscriptions for Field (and other Forge surfaces).
-- VAPID private keys stay in env / Secrets Manager, not in this table.

CREATE TABLE IF NOT EXISTS "user_push_subscriptions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" varchar(500),
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "user_push_subscriptions_tenant_user_idx"
  ON "user_push_subscriptions" ("tenant_id", "user_id");

CREATE INDEX IF NOT EXISTS "user_push_subscriptions_endpoint_idx"
  ON "user_push_subscriptions" ("endpoint");

GRANT SELECT, INSERT, UPDATE, DELETE ON "user_push_subscriptions" TO forge_app;

ALTER TABLE "user_push_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_push_subscriptions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_push_subscriptions_tenant_isolation" ON "user_push_subscriptions";
CREATE POLICY "user_push_subscriptions_tenant_isolation" ON "user_push_subscriptions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);
