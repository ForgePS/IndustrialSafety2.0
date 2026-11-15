-- Sprint 1E hotfix: identity lookup EXECUTE for the runtime DB role.
--
-- Aurora development secrets currently authenticate as forge_admin (table owner).
-- Migration 0005 granted EXECUTE only to forge_app. Auth /me calls
-- forge_lookup_user_tenants and failed with "permission denied for function".
-- Grant EXECUTE to both forge_app and forge_admin when those roles exist.

DO $$
DECLARE
  f text;
  r text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'forge_lookup_identity(text, text)',
    'forge_lookup_invitation(text)',
    'forge_lookup_user_tenants(uuid)'
  ]
  LOOP
    FOREACH r IN ARRAY ARRAY['forge_app', 'forge_admin']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, r);
      END IF;
    END LOOP;
  END LOOP;
END
$$;
