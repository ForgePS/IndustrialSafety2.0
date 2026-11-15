-- Forge 2.0 platform shim for 1.0's Aurora PostgreSQL.
--
-- 2.0's migrations are written for Supabase. The translator (scripts/portability/translate-migrations.cjs)
-- renames schemas and roles; this file creates what those names point at:
--   public        -> forge2       2.0's tables and functions
--   auth          -> forge2_auth  a stand-in for Supabase Auth: a users table filled from Cognito,
--                                 and uid()/role()/jwt() reading the JWT claims PostgREST sets
--   extensions    -> forge2_ext   pgcrypto, vector, btree_gist
--   anon, authenticated, service_role -> forge2_anon, forge2_authenticated, forge2_service
--
-- Run once per database as an administrator (rds_superuser on Aurora) before the first 2.0
-- migration. Safe to re-run. Login passwords are never set here: ops sets the
-- forge2_authenticator and forge2_migrator passwords from Secrets Manager.

create schema if not exists forge2;
create schema if not exists forge2_auth;
create schema if not exists forge2_ext;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'forge2_anon') then
    create role forge2_anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'forge2_authenticated') then
    create role forge2_authenticated nologin;
  end if;
  -- Matches Supabase's service_role: 2.0 server code authorizes in the app and reads as this role.
  if not exists (select 1 from pg_roles where rolname = 'forge2_service') then
    create role forge2_service nologin bypassrls;
  end if;
  -- PostgREST connects as this role and switches to one of the three above per request.
  if not exists (select 1 from pg_roles where rolname = 'forge2_authenticator') then
    create role forge2_authenticator login noinherit;
  end if;
  -- Runs 2.0 migrations and owns 2.0's objects. It never receives rights on 1.0's tables.
  if not exists (select 1 from pg_roles where rolname = 'forge2_migrator') then
    create role forge2_migrator login;
  end if;
end
$$;

grant forge2_anon, forge2_authenticated, forge2_service to forge2_authenticator;

-- The administrator running this file is not a true superuser on Aurora (rds_superuser) or
-- Supabase, so it must be a member of forge2_migrator to hand ownership to it.
grant forge2_migrator to current_user;

alter schema forge2 owner to forge2_migrator;
alter schema forge2_auth owner to forge2_migrator;
grant usage, create on schema forge2_ext to forge2_migrator;
grant usage on schema forge2, forge2_auth, forge2_ext to forge2_anon, forge2_authenticated, forge2_service;

create extension if not exists pgcrypto with schema forge2_ext;
create extension if not exists vector with schema forge2_ext;
create extension if not exists btree_gist with schema forge2_ext;

-- Supabase creates these in every project; 2.0's migrations assume them.
create table if not exists forge2_auth.users (
  id uuid primary key,
  -- The Cognito user this row stands for. Cognito subs are UUIDs; new users get id = sub.
  cognito_sub text unique,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  deleted_at timestamptz,
  is_sso_user boolean not null default false,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table forge2_auth.users owner to forge2_migrator;
revoke all on forge2_auth.users from public, forge2_anon, forge2_authenticated;
grant select, insert, update, delete on forge2_auth.users to forge2_service;

-- Same definitions as Supabase's auth.uid()/role()/jwt(): they read the claims PostgREST puts in
-- request.jwt.claims (and the older per-claim settings).
create or replace function forge2_auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

create or replace function forge2_auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function forge2_auth.role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

alter function forge2_auth.jwt() owner to forge2_migrator;
alter function forge2_auth.uid() owner to forge2_migrator;
alter function forge2_auth.role() owner to forge2_migrator;
grant execute on function forge2_auth.jwt(), forge2_auth.uid(), forge2_auth.role() to forge2_anon, forge2_authenticated, forge2_service;

-- 2.0 keeps its own migration ledger, separate from 1.0's Drizzle journal.
create table if not exists forge2.schema_migrations (
  version text primary key,
  name text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
);

alter table forge2.schema_migrations owner to forge2_migrator;

-- Extensions live in forge2_ext, so every 2.0 role resolves names there as well (Supabase does the
-- same with its extensions schema).
alter role forge2_migrator set search_path = forge2, forge2_ext;
alter role forge2_service set search_path = forge2, forge2_ext;
alter role forge2_authenticated set search_path = forge2, forge2_ext;
alter role forge2_anon set search_path = forge2, forge2_ext;
alter role forge2_authenticator set search_path = forge2, forge2_ext;
