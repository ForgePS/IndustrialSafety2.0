-- 0105_auth_browser_sessions_s1
-- Opaque browser BFF sessions: HttpOnly cookie + server-side encrypted Cognito refresh.
-- forge_app is subject to FORCE RLS, so tenant lookup uses a narrow SECURITY DEFINER helper.

CREATE TABLE IF NOT EXISTS "auth_browser_sessions" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "home_tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "session_token_hash" varchar(128) NOT NULL,
  "refresh_token_ciphertext" text NOT NULL,
  "refresh_token_nonce" varchar(64) NOT NULL,
  "csrf_token_hash" varchar(128) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "idle_expires_at" timestamptz NOT NULL,
  "absolute_expires_at" timestamptz NOT NULL,
  "rotated_from_session_id" uuid,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "auth_browser_sessions_token_uidx"
  ON "auth_browser_sessions" ("session_token_hash")
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "auth_browser_sessions_user_idx"
  ON "auth_browser_sessions" ("home_tenant_id", "user_id")
  WHERE "revoked_at" IS NULL;

CREATE INDEX IF NOT EXISTS "auth_browser_sessions_expires_idx"
  ON "auth_browser_sessions" ("expires_at")
  WHERE "revoked_at" IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON "auth_browser_sessions" TO forge_app;
ALTER TABLE "auth_browser_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_browser_sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_browser_sessions_tenant_isolation"
  ON "auth_browser_sessions";
CREATE POLICY "auth_browser_sessions_tenant_isolation"
  ON "auth_browser_sessions"
  USING (home_tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (home_tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION forge_auth_browser_session_home_tenant(p_session_hash text)
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
  SELECT home_tenant_id
    INTO v_tenant_id
  FROM auth_browser_sessions
  WHERE session_token_hash = p_session_hash
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION forge_auth_browser_session_home_tenant(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_auth_browser_session_home_tenant(text) TO forge_app;

-- Owner lookup including revoked rows (replay / family revoke).
CREATE OR REPLACE FUNCTION forge_auth_browser_session_owner(p_session_hash text)
RETURNS TABLE (home_tenant_id uuid, user_id uuid, is_revoked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_hash IS NULL OR length(p_session_hash) < 32 THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT s.home_tenant_id, s.user_id, (s.revoked_at IS NOT NULL) AS is_revoked
  FROM auth_browser_sessions s
  WHERE s.session_token_hash = p_session_hash
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION forge_auth_browser_session_owner(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION forge_auth_browser_session_owner(text) TO forge_app;
