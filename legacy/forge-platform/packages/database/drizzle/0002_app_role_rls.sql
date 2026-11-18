-- Application role that is subject to RLS (table owner / superuser bypasses FORCE RLS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    CREATE ROLE forge_app LOGIN PASSWORD 'forge_local_only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO forge_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forge_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forge_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO forge_app;

-- Bypass role for migrations / system jobs (explicit, not default app connection)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_migrator') THEN
    CREATE ROLE forge_migrator LOGIN PASSWORD 'forge_local_only' NOSUPERUSER CREATEDB;
  END IF;
END
$$;
GRANT forge_app TO forge_migrator;
