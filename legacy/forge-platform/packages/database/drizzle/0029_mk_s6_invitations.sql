-- FORGE-SAAS MK-S6: facility scope on invitations and memberships.
-- Additive only. Not applied to production in this sprint.

ALTER TABLE "user_invitations"
  ADD COLUMN IF NOT EXISTS "facility_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "user_tenant_memberships"
  ADD COLUMN IF NOT EXISTS "facility_ids_json" jsonb NOT NULL DEFAULT '[]'::jsonb;
