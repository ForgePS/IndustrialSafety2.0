// Unit tests for the Supabase -> Aurora migration translator. Run: node --test scripts/portability/sql.test.cjs
const test = require('node:test')
const assert = require('node:assert/strict')
const { translateMigration, statements } = require('./sql.cjs')

const t = sql => translateMigration(sql).sql

test('schema-qualified names move to the forge2 schemas', () => {
  assert.equal(t('create table public.forge_x (id uuid references auth.users(id));'), 'create table forge2.forge_x (id uuid references forge2_auth.users(id));')
  assert.equal(t('grant select on table "public"."users" to service_role;'), 'grant select on table "forge2"."users" to forge2_service;')
  assert.equal(t('select embedding extensions.vector(1536);'), 'select embedding forge2_ext.vector(1536);')
})

test('the PUBLIC pseudo-role and data values named public are left alone', () => {
  assert.equal(t('revoke all on function public.f() from public, anon, authenticated;'), 'revoke all on function forge2.f() from public, forge2_anon, forge2_authenticated;')
  assert.equal(t("check (visibility in ('public','internal'));"), "check (visibility in ('public','internal'));")
})

test('search_path settings are rewritten in both spellings', () => {
  assert.equal(t('alter function f() set search_path = public, auth;'), 'alter function f() set search_path = forge2, forge2_auth;')
  assert.equal(t("create function f() returns int language sql SET search_path TO 'public' AS $f$ select 1 $f$;"), "create function f() returns int language sql SET search_path TO 'forge2' AS $f$ select 1 $f$;")
})

test('function bodies are translated, string literals inside them only when qualified', () => {
  const out = t("create function public.f() returns uuid language plpgsql as $$ begin perform 'public'; perform 'public.forge_x'::regclass; return auth.uid(); end $$;")

  assert.match(out, /create function forge2\.f\(\)/)
  assert.match(out, /perform 'public';/)
  assert.match(out, /perform 'forge2\.forge_x'::regclass/)
  assert.match(out, /return forge2_auth\.uid\(\)/)
})

test('Supabase-only statements are dropped, with the reason recorded', () => {
  const { sql, dropped } = translateMigration("insert into storage.buckets (id, name) values ('forge-x', 'forge-x');\ncreate table public.a (id int);\ngrant select on public.a to supabase_auth_admin;")

  assert.equal(dropped.length, 2)
  assert.deepEqual(
    dropped.map(item => item.reason),
    ['Supabase Storage (files move to S3)', 'Supabase internal role']
  )
  assert.match(sql, /create table forge2\.a \(id int\);/)
})

test('statement splitting ignores semicolons in strings, comments and dollar bodies', () => {
  const parts = statements("select ';'; -- a; b\ncreate function f() returns int as $$ select 1; select 2; $$ language sql; /* x; */ select 3;")

  assert.equal(parts.length, 3)
})

test('column names that contain role words are not renamed', () => {
  assert.equal(t('select is_authenticated, anon_count from public.t;'), 'select is_authenticated, anon_count from forge2.t;')
})

test('schema and extension creation the shim already provides is dropped', () => {
  const { sql, dropped } = translateMigration('create schema if not exists extensions;\ncreate extension if not exists vector with schema extensions;\ncreate extension if not exists pg_cron;\ncreate table public.a (id int);')

  assert.equal(dropped.length, 2)
  assert.ok(dropped.every(item => item.reason === 'provided by the platform shim'))
  assert.match(sql, /create extension if not exists pg_cron;/)
  assert.match(sql, /create table forge2\.a/)
})

test('format() templates with qualified names are translated', () => {
  const { sql } = translateMigration("do $$ begin execute format('alter table public.%I enable row level security', 'x'); execute 'select * from public.\"y\"'; end $$;")

  assert.match(sql, /'alter table forge2\.%I enable row level security'/)
  assert.match(sql, /'select \* from forge2\."y"'/)
})
