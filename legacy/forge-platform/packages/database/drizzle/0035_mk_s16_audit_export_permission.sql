-- FORGE-SAAS MK-S16: audit export permission seed.
-- Does not alter CloudWatch / CloudTrail infrastructure.

INSERT INTO "permissions" (
  "id", "code", "name", "description", "scope_type", "risk_level", "is_sensitive", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  'platform.audit.export',
  'Export audit events',
  'Generate tenant-scoped audit export payloads (self-audited)',
  'PLATFORM',
  'ELEVATED',
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "permissions" WHERE "code" = 'platform.audit.export'
);
