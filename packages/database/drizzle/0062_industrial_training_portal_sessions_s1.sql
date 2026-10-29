-- 0062_industrial_training_portal_sessions_s1
-- Opaque portal sessions for public training QR flows (employee number verified once).
-- forge_app is subject to FORCE RLS, so tenant lookup uses a narrow SECURITY DEFINER helper.

CREATE TABLE IF NOT EXISTS "industrial_training_portal_sessions" (
  "id" uuid PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "assignment_id" uuid NOT NULL REFERENCES "industrial_training_assignments"("id") ON DELETE CASCADE,
  "access_token_hash" varchar(128) NOT NULL,
  "session_token_hash" varchar(128) NOT NULL,
  "personnel_id" uuid REFERENCES "industrial_personnel"("id") ON DELETE SET NULL,
  "employee_number" varchar(120) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "revoked_at" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "industrial_training_portal_sessions_token_uidx"
  ON "industrial_training_portal_sessions" ("session_token_hash")
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "industrial_training_portal_sessions_assignment_idx"
  ON "industrial_training_portal_sessions" ("tenant_id", "assignment_id", "employee_number");

CREATE INDEX IF NOT EXISTS "industrial_training_portal_sessions_expires_idx"
  ON "industrial_training_portal_sessions" ("expires_at")
  WHERE "revoked_at" IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON "industrial_training_portal_sessions" TO forge_app;
ALTER TABLE "industrial_training_portal_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "industrial_training_portal_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "industrial_training_portal_sessions_tenant_isolation"
  ON "industrial_training_portal_sessions";
CREATE POLICY "industrial_training_portal_sessions_tenant_isolation"
  ON "industrial_training_portal_sessions"
  USING (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION forge_industrial_training_tenant_for_portal_session(p_session_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  IF p_session_hash IS NULL OR length(p_session_hash) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT tenant_id
    INTO v_tenant_id
  FROM industrial_training_portal_sessions
  WHERE session_token_hash = p_session_hash
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_industrial_training_tenant_for_portal_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_industrial_training_tenant_for_portal_session(text) TO forge_app;
