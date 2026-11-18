-- FORGE-SAAS MK-S10: contract pricing override JSON + billing read permission seed.

ALTER TABLE "billing_contracts"
  ADD COLUMN IF NOT EXISTS "pricing_json" jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'tenant.billing.read',
  'Read tenant billing',
  'View billing overview, contracts, invoices, and contact (no commercial mutations)',
  'TENANT',
  'NORMAL',
  false,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'tenant.billing.read'
);
