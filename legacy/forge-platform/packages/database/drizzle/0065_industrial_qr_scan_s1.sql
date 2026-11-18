-- 0065_industrial_qr_scan_s1
-- Extend unified qr_links for Forge QR Scan module (S1 data foundation).
-- Reuses qr_links + industrial_qr_link_scan_events from 0040; no parallel QR tables.

ALTER TABLE "qr_links"
  ADD COLUMN IF NOT EXISTS "display_code" varchar(64),
  ADD COLUMN IF NOT EXISTS "description" text,
  ADD COLUMN IF NOT EXISTS "access_mode" varchar(64) NOT NULL DEFAULT 'AUTHENTICATED_ONLY',
  ADD COLUMN IF NOT EXISTS "action_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "department_id" uuid REFERENCES "industrial_departments"("id"),
  ADD COLUMN IF NOT EXISTS "replacement_qr_id" uuid REFERENCES "qr_links"("id"),
  ADD COLUMN IF NOT EXISTS "token_issued_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "activated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "deactivated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "last_scanned_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "scan_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "qr_links_token_hash_uidx"
  ON "qr_links" ("token_hash")
  WHERE "token_hash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "qr_links_tenant_target_idx"
  ON "qr_links" ("tenant_id", "target_type", "target_id");

CREATE INDEX IF NOT EXISTS "qr_links_display_code_idx"
  ON "qr_links" ("tenant_id", "display_code")
  WHERE "display_code" IS NOT NULL;

ALTER TABLE "industrial_qr_link_scan_events"
  ADD COLUMN IF NOT EXISTS "action" varchar(64),
  ADD COLUMN IF NOT EXISTS "personnel_id" uuid REFERENCES "industrial_personnel"("id"),
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "site_id" uuid REFERENCES "industrial_sites"("id"),
  ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS "industrial_qr_link_scan_events_action_idx"
  ON "industrial_qr_link_scan_events" ("tenant_id", "action", "scanned_at");

CREATE TABLE IF NOT EXISTS "industrial_qr_link_audit_events" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "qr_link_id" uuid REFERENCES "qr_links"("id") ON DELETE SET NULL,
  "event_type" varchar(64) NOT NULL,
  "event_at" timestamptz NOT NULL DEFAULT now(),
  "actor_user_id" uuid REFERENCES "users"("id"),
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_system" varchar(64) NOT NULL DEFAULT 'FORGE',
  "source_project" varchar(128),
  "source_collection" varchar(128),
  "source_document_id" varchar(256),
  "source_path" varchar(512),
  "source_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "industrial_qr_link_audit_events_link_idx"
  ON "industrial_qr_link_audit_events" ("tenant_id", "qr_link_id", "event_at");
GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_qr_link_audit_events" TO forge_app;
ALTER TABLE "industrial_qr_link_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_qr_link_audit_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_qr_link_audit_events_tenant_isolation" ON "industrial_qr_link_audit_events";
CREATE POLICY "industrial_qr_link_audit_events_tenant_isolation" ON "industrial_qr_link_audit_events"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION forge_industrial_qr_link_tenant_for_token(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_token_hash IS NULL OR length(p_token_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM qr_links
  WHERE token_hash = p_token_hash
    AND archived_at IS NULL
    AND status = 'ACTIVE'
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_qr_link_tenant_for_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_qr_link_tenant_for_token(text) TO forge_app;

-- Backfill activation timestamps for migrated active links.
UPDATE "qr_links"
SET activated_at = coalesce(activated_at, created_at),
    updated_at = now()
WHERE status = 'ACTIVE'
  AND activated_at IS NULL;
