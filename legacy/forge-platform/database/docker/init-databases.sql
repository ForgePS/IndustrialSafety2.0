-- Local-only databases created on first Postgres container start.
CREATE DATABASE forge_platform_test;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forge_app') THEN
    CREATE ROLE forge_app LOGIN PASSWORD 'forge_local_only' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
