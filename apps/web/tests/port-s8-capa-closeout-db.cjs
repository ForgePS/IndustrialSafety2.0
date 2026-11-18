/**
 * Port slice 8, piece B: database checks for public CAPA closeout links
 * (migration 20261117110000_s8_capa_closeout_tokens.sql): token table constraints, no direct access for
 * members or anonymous callers, and a lifecycle transition with no actor (the public submission).
 * Creates its own CAPA and removes everything afterwards.
 * Run: node apps/web/tests/port-s8-capa-closeout-db.cjs
 */
const crypto = require('crypto')
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
const TABLE = 'forge_corrective_action_closeout_tokens'
const RUN = Date.now().toString().slice(-6)

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

const hash = token => crypto.createHash('sha256').update(token).digest('hex')
const newToken = () => crypto.randomBytes(24).toString('base64url')
const fixture = { capaId: null }

const insertToken = (overrides = {}) =>
  request(`/rest/v1/${TABLE}`, {
    method: 'POST',
    body: {
      organization_id: ORG,
      corrective_action_id: fixture.capaId,
      token_hash: hash(newToken()),
      expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
      created_by: ADMIN,
      ...overrides
    }
  })

async function main() {
  const [capa] = await request('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: {
      organization_id: ORG,
      action_number: `CA-S8C-${RUN}`,
      title: `S8 closeout db ${RUN}`,
      description: 'Closeout link database check',
      status: 'open',
      root_cause_required: false,
      action_plan: 'Fix it',
      due_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      created_by: ADMIN
    }
  })
  fixture.capaId = capa.id

  console.log('token rows')
  const raw = newToken()
  assert(/^[A-Za-z0-9_-]{32}$/.test(raw), 'randomBytes(24) base64url tokens are 32 URL-safe characters')
  const [row] = await insertToken({ token_hash: hash(raw) })
  assert(row.token_hash === hash(raw) && row.token_hash.length === 64, 'only the sha256 hex hash is stored')
  assert(Array.isArray(row.submitted_photos) && row.submitted_photos.length === 0, 'submitted photos default to an empty list')
  await expectFailure(insertToken({ token_hash: hash(raw) }), 'token hashes are unique', { code: '23505' })
  await expectFailure(insertToken({ token_hash: raw }), 'a raw token cannot be stored in place of the hash', { code: '23514' })
  await expectFailure(insertToken({ submitted_notes: 'x'.repeat(5001) }), 'notes are at most 5000 characters', { code: '23514' })
  await expectFailure(insertToken({ submitted_name: 'x'.repeat(201) }), 'names are at most 200 characters', { code: '23514' })
  await expectFailure(insertToken({ submitted_photos: { a: 1 } }), 'submitted photos must be a list', { code: '23514' })
  await expectFailure(insertToken({ expires_at: null }), 'every link expires', { code: '23502' })
  await expectFailure(
    insertToken({ corrective_action_id: '00000000-0000-4000-8000-00000000dead' }),
    'the corrective action must exist',
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
  await expectFailure(request(`/rest/v1/${TABLE}?select=*`, { token }), 'members cannot read closeout tokens directly')
  await expectFailure(
    request(`/rest/v1/${TABLE}`, { method: 'POST', token, body: { organization_id: ORG, corrective_action_id: fixture.capaId, token_hash: hash(newToken()), expires_at: new Date().toISOString() } }),
    'members cannot create closeout tokens directly'
  )
  await expectFailure(request(`/rest/v1/${TABLE}?select=*`, { token: ANON_KEY }), 'anonymous callers cannot read closeout tokens')
  await expectFailure(
    request(`/rest/v1/${TABLE}?id=eq.${row.id}`, { method: 'PATCH', token: ANON_KEY, body: { used_at: new Date().toISOString() } }),
    'anonymous callers cannot mark a token used'
  )

  console.log('system lifecycle transition (public submission has no actor)')
  const result = await request('/rest/v1/rpc/forge_perform_capa_lifecycle_transition', {
    method: 'POST',
    body: {
      p_organization_id: ORG,
      p_capa_id: fixture.capaId,
      p_expected_capa_status: 'open',
      p_to_capa_status: 'pending_verification',
      p_transition_key: 'submit_for_verification',
      p_actor_user_id: null,
      p_comment: 'Closeout submitted through the public link by S8 test.',
      p_capa_patch: { completed_at: new Date().toISOString() },
      p_metadata: { source: 'capa_public_closeout' },
      p_idempotency_key: 'capa-public-closeout-' + row.id,
      p_fail_after_capa_update: false
    }
  })
  assert(result && result.ok === true, 'open -> pending_verification works with a null actor')
  const [after] = await request(`/rest/v1/forge_corrective_actions?id=eq.${fixture.capaId}&select=status,completed_at,completed_by`)
  assert(after.status === 'pending_verification' && after.completed_at && !after.completed_by, 'the CAPA is pending verification with no completing user')
}

async function cleanup() {
  if (!fixture.capaId) return
  await request(`/rest/v1/forge_workflow_instances?resource_type=eq.corrective_action&resource_id=eq.${fixture.capaId}`, { method: 'DELETE' }).catch(() => {})
  await request(`/rest/v1/forge_corrective_actions?id=eq.${fixture.capaId}`, { method: 'DELETE' }).catch(() => {})
}

main()
  .then(cleanup)
  .then(() => console.log('\nport-s8 capa closeout database checks passed'))
  .catch(async error => {
    console.error(error.message)
    await cleanup()
    process.exit(1)
  })
