-- FORGE-SAAS MK-S14: tenant branding fields for name/contact/report/footer + approved colors.
-- logo/icon remain document UUID refs; ownership enforced in API (not FK) under forge_documents RLS.

ALTER TABLE "tenant_branding"
  ADD COLUMN IF NOT EXISTS "display_name" varchar(200),
  ADD COLUMN IF NOT EXISTS "short_name" varchar(80),
  ADD COLUMN IF NOT EXISTS "approved_colors_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "contact_name" varchar(200),
  ADD COLUMN IF NOT EXISTS "contact_phone" varchar(40),
  ADD COLUMN IF NOT EXISTS "report_identity" varchar(300),
  ADD COLUMN IF NOT EXISTS "document_footer" text;
