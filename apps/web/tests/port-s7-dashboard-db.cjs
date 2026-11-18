/**
 * Port slice 7: database checks for forge_dashboard_layouts
 * (migration 20261116160000_forge_dashboard_layouts.sql). Restores the admin's own layout afterwards.
 * Run: node apps/web/tests/port-s7-dashboard-db.cjs
 */
const fs = require('fs')
const path = require('path')

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
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const TABLE = 'forge_dashboard_layouts'

async function request(pathname, options = {}) {
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + (options.token || SERVICE_ROLE_KEY),
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!response.ok) {
    const error = new Error(String((data && data.message) || response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, { code } = {}) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    console.log('  ok - ' + message)
    return error
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

const mine = `organization_id=eq.${ORG}&user_id=eq.${ADMIN}`
let saved = null

const upsert = layout =>
  request(`/rest/v1/${TABLE}?on_conflict=organization_id,user_id`, {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: { organization_id: ORG, user_id: ADMIN, layout, updated_at: new Date().toISOString() }
  })

async function main() {
  saved = (await request(`/rest/v1/${TABLE}?${mine}&select=layout`))[0] || null

  console.log('layout rows')
  const layout = { items: [{ id: 'workspace', visible: true, size: 'full' }], pinnedModules: null }
  await upsert(layout)
  await upsert({ ...layout, pinnedModules: ['nav.incidents'] })
  const rows = await request(`/rest/v1/${TABLE}?${mine}&select=layout`)
  assert(rows.length === 1, 'one layout per user and company (upsert replaces it)')
  assert(rows[0].layout.pinnedModules[0] === 'nav.incidents', 'the newer layout is kept')

  await expectFailure(upsert(['not', 'an', 'object']), 'a layout must be a JSON object', { code: '23514' })
  await expectFailure(upsert({ junk: 'x'.repeat(17000) }), 'a layout is at most 16 KB', { code: '23514' })
  await expectFailure(
    request(`/rest/v1/${TABLE}`, { method: 'POST', body: { organization_id: ORG, user_id: '00000000-0000-4000-8000-00000000dead', layout: {} } }),
    'the user must exist',
    { code: '23503' }
  )

  console.log('access')
  const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
  })
  const { access_token: token } = await tokenResponse.json()
  assert(Boolean(token), 'member signs in')
  await expectFailure(request(`/rest/v1/${TABLE}?select=*`, { token }), 'members cannot read layouts directly')
  await expectFailure(request(`/rest/v1/${TABLE}`, { method: 'POST', token, body: { organization_id: ORG, user_id: ADMIN, layout: {} } }), 'members cannot write layouts directly')
  await expectFailure(request(`/rest/v1/${TABLE}?select=*`, { token: ANON_KEY }), 'anonymous callers cannot read layouts')
}

async function cleanup() {
  if (saved) await upsert(saved.layout).catch(() => {})
  else await request(`/rest/v1/${TABLE}?${mine}`, { method: 'DELETE' }).catch(() => {})
}

main()
  .then(cleanup)
  .then(() => console.log('\nport-s7 dashboard database checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
