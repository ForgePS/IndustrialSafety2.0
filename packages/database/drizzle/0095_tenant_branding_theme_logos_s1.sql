-- 0095_tenant_branding_theme_logos_s1
-- Add dark-theme logo document ref; existing logo_document_id remains the light logo.

ALTER TABLE "tenant_branding"
  ADD COLUMN IF NOT EXISTS "logo_dark_document_id" uuid;
