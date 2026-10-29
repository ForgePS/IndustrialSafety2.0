-- 0100_industrial_sanitation_ui_settings_s1
-- Tenant-scoped Sanitation sub-module (tab) visibility for Admin / Creator.

CREATE TABLE IF NOT EXISTS "industrial_sanitation_ui_settings" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "disabled_tabs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "updated_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_sanitation_ui_settings_tenant_uidx"
  ON "industrial_sanitation_ui_settings" ("tenant_id");
