#!/usr/bin/env node
// Aurora rehearsal: applies the platform shim and every translated migration to a scratch database
// on the local Postgres (or SUPABASE_DB_URL's server in CI), then checks the result looks the way
// 1.0's Aurora needs it to. The scratch database is a plain Postgres database with no Supabase
// schemas, which is the closest local stand-in for Aurora.
//
//   node scripts/portability/rehearse-aurora.cjs [--keep]
//
// --keep leaves the scratch database (forge2_rehearsal) in place for inspection.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { query, runScript } = require('./db.cjs')
const { translateMigration } = require('./sql.cjs')

const root = path.resolve(__dirname, '..', '..')
const migrationsDir = path.join(root, 'apps', 'web', 'supabase', 'migrations')
const shim = fs.readFileSync(path.join(root, 'integration', 'aurora', '00_platform_shim.sql'), 'utf8')
const keep = process.argv.includes('--keep')
const DB = 'forge2_rehearsal'

const fail = message => {
  console.error('Aurora rehearsal failed: ' + message)
  process.exit(1)
}

query(`drop database if exists ${DB} with (force)`)
query(`create database ${DB}`)

try {
  // The shim makes the admin a member of forge2_migrator. In production the migrate task signs in
  // as forge2_migrator; here the admin switches to it with set role.
  runScript(shim, { database: DB })
} catch (error) {
  fail('platform shim: ' + String(error.stderr || error.message).trim())
}

const files = fs.readdirSync(migrationsDir).filter(file => /^\d{14}_.+\.sql$/.test(file)).sort()
let dropped = 0

for (const file of files) {
  const source = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  const translated = translateMigration(source)
  const [, version, name] = /^(\d{14})_(.+)\.sql$/.exec(file)
  const checksum = crypto.createHash('sha256').update(translated.sql).digest('hex')

  dropped += translated.dropped.length

  // Same as a production migrate task: as the migrator role, one transaction per migration,
  // recorded in 2.0's own ledger.
  const script = [
    'set role forge2_migrator;',
    'set search_path = forge2, forge2_ext;',
    'begin;',
    translated.sql,
    ';',
    `insert into forge2.schema_migrations (version, name, checksum) values ('${version}', '${name}', '${checksum}');`,
    'commit;'
  ].join('\n')

  try {
    runScript(script, { database: DB })
  } catch (error) {
    fail(`${file}: ${String(error.stderr || error.message).trim().split('\n').slice(0, 6).join('\n')}`)
  }
}

// What 1.0's Aurora needs to be true after a 2.0 deploy.
const [[outsideSchemas]] = query(
  `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname not in ('forge2','forge2_auth','forge2_ext','pg_catalog','information_schema','pg_toast')
     and c.relkind in ('r','v','m','S','f','p')`,
  { database: DB }
)
const [[tables]] = query(`select count(*) from pg_tables where schemaname = 'forge2'`, { database: DB })
const [[functions]] = query(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'forge2'`, { database: DB })
const [[ledger]] = query(`select count(*) from forge2.schema_migrations`, { database: DB })
const [[notOwned]] = query(
  `select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'forge2' and c.relkind in ('r','v','m','S','p') and pg_get_userbyid(c.relowner) <> 'forge2_migrator'`,
  { database: DB }
)
const [[rlsOff]] = query(
  `select count(*) from pg_tables t join pg_class c on c.relname = t.tablename and c.relnamespace = 'forge2'::regnamespace
   where t.schemaname = 'forge2' and not c.relrowsecurity and t.tablename <> 'schema_migrations'`,
  { database: DB }
)
const anonGrants = query(
  `select table_name, privilege_type from information_schema.role_table_grants
   where grantee = 'forge2_anon' and table_schema = 'forge2' order by 1, 2`,
  { database: DB }
)

// Supabase's own roles exist on this server cluster-wide, so a grant to them applies here but fails
// on Aurora. Every grant, default privilege and policy in the forge2 schemas must name a forge2_*
// role (or PUBLIC, the owner, or the administrator that ran the shim).
const allowedGrantee = `(r.rolname like 'forge2\\_%' or r.rolname = current_user)`
const foreignRoles = query(
  `with acl as (
     select 'relation ' || c.oid::regclass as what, (aclexplode(c.relacl)).grantee from pg_class c
       where c.relnamespace in ('forge2'::regnamespace, 'forge2_auth'::regnamespace)
     union all
     select 'function ' || p.oid::regprocedure, (aclexplode(p.proacl)).grantee from pg_proc p
       where p.pronamespace in ('forge2'::regnamespace, 'forge2_auth'::regnamespace)
     union all
     select 'schema ' || n.nspname, (aclexplode(n.nspacl)).grantee from pg_namespace n where n.nspname like 'forge2%'
     union all
     select 'default privileges in ' || coalesce(d.defaclnamespace::regnamespace::text, 'database'), (aclexplode(d.defaclacl)).grantee
       from pg_default_acl d where d.defaclnamespace in ('forge2'::regnamespace, 'forge2_auth'::regnamespace, 0)
     union all
     select 'policy ' || pol.polname || ' on ' || pol.polrelid::regclass, unnest(pol.polroles) from pg_policy pol
       where (select relnamespace from pg_class where oid = pol.polrelid) in ('forge2'::regnamespace, 'forge2_auth'::regnamespace)
   )
   select distinct r.rolname, a.what from acl a join pg_roles r on r.oid = a.grantee
   where a.grantee <> 0 and not ${allowedGrantee}
   order by 1, 2`,
  { database: DB }
)
const [[sequencesWithoutService]] = query(
  `select count(*) from pg_class c where c.relnamespace = 'forge2'::regnamespace
     and case when c.relkind = 'S' then not has_sequence_privilege('forge2_service', c.oid, 'usage') else false end`,
  { database: DB }
)

const [[tablesWithoutService]] = query(
  `select count(*) from pg_class c where c.relnamespace = 'forge2'::regnamespace
     and case when c.relkind in ('r', 'p') and c.relname <> 'schema_migrations'
       then not has_table_privilege('forge2_service', c.oid, 'select, insert, update, delete') else false end`,
  { database: DB }
)

const problems = []

if (Number(tablesWithoutService) > 0) problems.push(`${tablesWithoutService} forge2 tables are not readable and writable by forge2_service`)

if (foreignRoles.length) {
  const roles = [...new Set(foreignRoles.map(([role]) => role))]

  problems.push(`${foreignRoles.length} grants or policies name roles Aurora will not have (${roles.join(', ')}), e.g. ${foreignRoles.slice(0, 3).map(([role, what]) => `${role} on ${what}`).join('; ')}`)
}

if (Number(sequencesWithoutService) > 0) problems.push(`${sequencesWithoutService} forge2 sequences are not usable by forge2_service`)

if (Number(outsideSchemas) > 0) problems.push(`${outsideSchemas} objects were created outside the forge2 schemas`)
if (Number(ledger) !== files.length) problems.push(`ledger has ${ledger} entries for ${files.length} migrations`)
if (Number(notOwned) > 0) problems.push(`${notOwned} forge2 objects are not owned by forge2_migrator`)

console.log(
  [
    `Aurora rehearsal: ${files.length} migrations applied to ${DB} as forge2_migrator (${dropped} statements dropped: Supabase-only or provided by the shim).`,
    `  forge2: ${tables} tables, ${functions} functions; ledger ${ledger} entries.`,
    `  Tables without row level security: ${rlsOff}.`,
    `  Grants to forge2_anon: ${anonGrants.length ? `${anonGrants.length} privileges on ${new Set(anonGrants.map(([table]) => table)).size} tables (${[...new Set(anonGrants.map(([table]) => table))].join(', ')})` : 'none'}; row level security still applies.`
  ].join('\n')
)

if (!keep) query(`drop database if exists ${DB} with (force)`)

if (problems.length) fail(problems.join('; '))

console.log('Aurora rehearsal passed.')
