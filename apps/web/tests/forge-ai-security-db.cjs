/**
 * Forge AI Command Center stage 5 security regression (local Supabase, after `supabase db reset`).
 * Every Forge AI table and function is found from the database itself, so new ones are covered
 * without editing this file:
 *  - every forge_ai_* table has row level security on and no client policies, so the anon key and
 *    a signed-in user read no rows and cannot insert, update or delete;
 *  - no forge_ai function is callable through the API by anon or a signed-in user;
 *  - the service role still reads the tables (the app reads through it after its own checks).
 * Run: node apps/web/tests/forge-ai-security-db.cjs
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const envPath = path.join(__dirname, '../.env.local')

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DB_CONTAINER = process.env.FORGE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const DATABASE_URL = process.env.SUPABASE_DB_URL || ''

if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase URL, anon key or service role key.')
  process.exit(1)
}

// Catalog queries run through psql: in CI against DATABASE_URL, locally in the Supabase container.
const sql = query => {
  const args = ['-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', query]
  const output = DATABASE_URL
    ? execFileSync('psql', [DATABASE_URL, ...args], { encoding: 'utf8' })
    : execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', ...args], { encoding: 'utf8' })

  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.split('|'))
}

async function call(pathname, { key = SERVICE_ROLE_KEY, bearer = key, method = 'GET', body } = {}) {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { ok: response.ok, status: response.status, data }
}

let failures = 0
let passes = 0

const check = (label, condition, detail = '') => {
  if (condition) {
    passes += 1
  } else {
    failures += 1
    console.error('FAIL ' + label + (detail ? ' - ' + detail : ''))
  }
}

// A client read is safe when it errors (no grant) or returns no rows (RLS with no policy).
const readBlocked = result => !result.ok || (Array.isArray(result.data) && result.data.length === 0)

const signInAs = async email => {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!response.ok || !data.access_token) throw new Error('Sign in failed for ' + email + ': ' + JSON.stringify(data))

  return data.access_token
}

async function main() {
  const tables = sql(
    `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m') and c.relname like 'forge_ai%' order by 1`
  )
  const policies = sql(
    `select tablename, policyname, roles::text from pg_policies where schemaname = 'public' and tablename like 'forge_ai%'`
  )
  const functions = sql(
    `select p.proname, has_function_privilege('anon', p.oid, 'execute'), has_function_privilege('authenticated', p.oid, 'execute'),
            pg_get_function_result(p.oid)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '%forge_ai%' order by 1`
  )

  check('Forge AI tables were found', tables.length >= 30, String(tables.length))

  for (const [name, rls] of tables) check(name + ' has row level security on', rls === 't')

  // The Command Center is read only through the service role; a client policy would open a table.
  check('no client policies on Forge AI tables', policies.length === 0, JSON.stringify(policies))

  const adminToken = await signInAs('admin@forge2.local')
  const clients = [
    { label: 'anon', key: ANON_KEY, bearer: ANON_KEY },
    { label: 'signed-in admin', key: ANON_KEY, bearer: adminToken }
  ]

  for (const [table] of tables) {
    for (const client of clients) {
      const read = await call(`/rest/v1/${table}?select=*&limit=5`, client)

      check(`${client.label} cannot read ${table}`, readBlocked(read), read.status + ' ' + JSON.stringify(read.data).slice(0, 120))

      const insert = await call(`/rest/v1/${table}`, { ...client, method: 'POST', body: {} })

      check(`${client.label} cannot insert into ${table}`, !insert.ok, String(insert.status))

      const update = await call(`/rest/v1/${table}?organization_id=not.is.null`, { ...client, method: 'PATCH', body: { organization_id: null } })

      check(`${client.label} cannot update ${table}`, !update.ok || (Array.isArray(update.data) && !update.data.length), String(update.status))

      const remove = await call(`/rest/v1/${table}?organization_id=not.is.null`, { ...client, method: 'DELETE' })

      check(`${client.label} cannot delete from ${table}`, !remove.ok || (Array.isArray(remove.data) && !remove.data.length), String(remove.status))
    }
  }

  // Trigger functions cannot be called through the API at all; every other forge_ai function must
  // be closed to clients at the grant level and refuse the call.
  for (const [name, anon, authenticated, result] of functions) {
    if (result === 'trigger') continue

    check(`anon has no execute on ${name}`, anon === 'f')
    check(`authenticated has no execute on ${name}`, authenticated === 'f')

    for (const client of clients) {
      const rpc = await call(`/rest/v1/rpc/${name}`, { ...client, method: 'POST', body: {} })

      check(`${client.label} cannot call ${name}`, !rpc.ok, String(rpc.status))
    }
  }

  // Sanity check that the closed reads above are not just empty tables.
  for (const table of ['forge_ai_capabilities', 'forge_ai_action_registry', 'forge_ai_watch_rule_templates', 'forge_ai_risk_models']) {
    const read = await call(`/rest/v1/${table}?select=*&limit=1`)

    check(`service role reads ${table}`, read.ok && Array.isArray(read.data) && read.data.length === 1, String(read.status))
  }

  console.log(`forge-ai-security-db: ${passes} passed, ${failures} failed (${tables.length} tables, ${functions.length} functions)`)

  if (failures) process.exit(1)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
