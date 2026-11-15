-- FORGE-SAAS MK-S20: platform analytics permission + SELECT bypass for aggregate tables.
-- Not applied to production in this sprint.
-- Bypass is transaction-local (`app.bypass_rls=on`) and must only be enabled after
-- creator authorization (`platform.analytics.read`).

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'platform.analytics.read',
  'Read platform analytics',
  'Creator Console SaaS platform KPI aggregates (no tenant PII payloads)',
  'PLATFORM',
  'ELEVATED',
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'platform.analytics.read'
);

-- Allow forge_app SELECT across tenants when bypass GUC is on (analytics / system jobs).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_tenant_memberships',
    'users',
    'tenant_products',
    'tenant_module_entitlements',
    'subscriptions',
    'customer_onboarding_sessions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_tenant_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (
         tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid
         OR current_setting(''app.bypass_rls'', true) = ''on''
       ) WITH CHECK (
         tenant_id = nullif(current_setting(''app.current_tenant_id'', true), '''')::uuid
         OR current_setting(''app.bypass_rls'', true) = ''on''
       )',
      t || '_tenant_isolation',
      t
    );
  END LOOP;
END
$$;
