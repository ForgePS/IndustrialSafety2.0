-- Sprint 1E: session revocation and tenant-agnostic identity resolution (ADR-029).
--
-- Authentication has a bootstrap problem: a bearer token carries a Cognito
-- subject, not a tenant, so the very first read cannot set app.current_tenant_id.
-- Rather than granting the application an RLS bypass, this migration introduces
-- a dedicated NOLOGIN role that holds narrow SELECT-only policies on the few
-- routing columns, and SECURITY DEFINER functions owned by that role. forge_app
-- is granted EXECUTE on the functions and is never granted the role itself, so
-- it can resolve a tenant but cannot read tenant data outside its RLS scope.

-- ---------------------------------------------------------------------------
-- Session revocation
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "sessions_revoked_at" timestamp with time zone;

COMMENT ON COLUMN "users"."sessions_revoked_at" IS
  'Access tokens issued (iat) before this instant are refused. Set by logout-all, disablement and membership suspension.';

-- ---------------------------------------------------------------------------
-- Identity resolution role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_identity_lookup') THEN
    CREATE ROLE forge_identity_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO forge_identity_lookup;

GRANT SELECT ON
  "tenants",
  "users",
  "authentication_identities",
  "user_invitations",
  "user_tenant_memberships",
  "user_tenant_access"
  TO forge_identity_lookup;

-- Read-only, role-scoped policies. forge_app is unaffected by these because a
-- policy applies only to the roles named in its TO clause.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants',
    'users',
    'authentication_identities',
    'user_invitations',
    'user_tenant_memberships',
    'user_tenant_access'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_identity_lookup', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO forge_identity_lookup USING (true)',
      t || '_identity_lookup', t
    );
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Resolution functions
-- ---------------------------------------------------------------------------

-- Maps a provider subject to the owning user and tenant. Returns only the
-- routing and session-guard columns; profile data is read later under RLS.
CREATE OR REPLACE FUNCTION forge_lookup_identity(p_provider text, p_subject text)
RETURNS TABLE (
  identity_id uuid,
  user_id uuid,
  tenant_id uuid,
  user_status text,
  session_version integer,
  sessions_revoked_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ai.id,
    u.id,
    u.tenant_id,
    u.status::text,
    u.session_version,
    u.sessions_revoked_at
  FROM authentication_identities ai
  JOIN users u ON u.id = ai.user_id
  WHERE ai.provider = p_provider
    AND ai.provider_subject = p_subject
  LIMIT 1;
$$;

-- Maps an invitation token hash to its tenant so acceptance can open a
-- correctly scoped transaction. No token material is returned.
CREATE OR REPLACE FUNCTION forge_lookup_invitation(p_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  tenant_id uuid,
  status text,
  expires_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.tenant_id, i.status::text, i.expires_at
  FROM user_invitations i
  WHERE i.invitation_token_hash = p_token_hash
  LIMIT 1;
$$;

-- Tenants a user may select. Driven by the membership aggregate; the legacy
-- user_tenant_access projection is only consulted for rows not yet migrated.
CREATE OR REPLACE FUNCTION forge_lookup_user_tenants(p_user_id uuid)
RETURNS TABLE (
  tenant_id uuid,
  tenant_slug text,
  tenant_display_name text,
  tenant_status text,
  membership_id uuid,
  membership_status text,
  is_default_tenant boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    t.id,
    t.slug::text,
    t.display_name::text,
    t.status::text,
    m.id,
    m.status::text,
    m.is_default_tenant
  FROM user_tenant_memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = p_user_id
  UNION
  SELECT
    t.id,
    t.slug::text,
    t.display_name::text,
    t.status::text,
    NULL::uuid,
    a.status::text,
    a.is_default_tenant
  FROM user_tenant_access a
  JOIN tenants t ON t.id = a.tenant_id
  WHERE a.user_id = p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM user_tenant_memberships m2
      WHERE m2.user_id = a.user_id AND m2.tenant_id = a.tenant_id
    );
$$;

DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'forge_lookup_identity(text, text)',
    'forge_lookup_invitation(text)',
    'forge_lookup_user_tenants(uuid)'
  ]
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO forge_identity_lookup', f);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO forge_app', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_admin') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO forge_admin', f);
    END IF;
  END LOOP;
END
$$;
