/**
 * RPC EXECUTE hardening regression (migration 20261113120000_forge_rpc_execute_hardening).
 *  - the anon key cannot execute any public function through PostgREST (OpenAPI lists no /rpc/ paths)
 *  - a signed-in user can execute only the RLS helper functions that `to authenticated` policies use
 *  - representative server-only RPCs (read and write) return 42501 for anon and for a signed-in user
 *  - RLS-protected reads still work for a signed-in member (is_org_member is still executable)
 *  - the custom access token hook still runs at sign-in (roles/permissions claims present)
 *  - service_role still executes server-only RPCs
 * Every write RPC is called with random ids, so nothing is written even if a grant regresses.
 * Run: node apps/web/tests/rpc-execute-hardening-db.cjs
 */
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const BASE = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:35421'
const SERVICE = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SERVICE || !ANON) throw new Error('Supabase anon and service role keys are required.')

const DEMO_ORG = '20000000-0000-4000-8000-000000000100'
const DEMO_USER_EMAIL = 'user@forge2.local'
const DEMO_PASSWORD = 'ForgeDev2!'

// Functions referenced by `to authenticated` RLS policies; they must stay executable by authenticated.
const POLICY_HELPERS = [
  'admin_only',
  'can_manage_role',
  'can_perform_user_action',
  'can_update_permission',
  'can_update_user',
  'can_view_user',
  'get_user_hierarchy',
  'get_user_id_from_auth',
  'has_org_role',
  'has_permission',
  'is_org_member'
]

// AI knowledge search RPCs are hardened by the AI agents migrations (feat/forge-ai-agents), not here.
const HARDENED_ELSEWHERE = ['match_forge_ai_knowledge', 'search_forge_ai_knowledge_text']

const uuid = () => crypto.randomUUID()
const now = new Date().toISOString()
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

// Representative server-only RPCs. Args match the real signatures so PostgREST resolves the
// function and the database privilege check is what answers.
const SERVER_ONLY = [
  ['forge_support_analytics (read, platform-wide)', 'forge_support_analytics', () => ({ p_from: thirtyDaysAgo, p_to: now, p_organization_id: null, p_product_id: null })],
  ['forge_support_staff_has_permission (read)', 'forge_support_staff_has_permission', () => ({ p_user_id: uuid(), p_permission_key: 'tickets.view' })],
  ['check_role_hierarchy (starter kit)', 'check_role_hierarchy', () => ({ auth_uid: uuid(), target_user_id: 1 })],
  ['can_manage_user (starter kit)', 'can_manage_user', () => ({ auth_uid: uuid(), target_user_id: uuid() })],
  ['custom_access_token_hook (auth hook)', 'custom_access_token_hook', () => ({ event: { user_id: uuid(), claims: {} } })],
  ['next_forge_asset_number (write)', 'next_forge_asset_number', () => ({ p_organization_id: uuid() })],
  ['forge_support_create_ticket (write)', 'forge_support_create_ticket', () => ({ p_organization_id: uuid(), p_requester_user_id: uuid(), p_payload: { subject: 'x' }, p_idempotency_key: uuid(), p_meta: {} })],
  ['forge_support_add_message (write)', 'forge_support_add_message', () => ({ p_ticket_id: uuid(), p_actor_user_id: uuid(), p_actor_type: 'staff', p_message_type: 'public_reply', p_body: 'x', p_organization_id: uuid() })],
  ['forge_accept_risk (write)', 'forge_accept_risk', () => ({ p_organization_id: uuid(), p_risk_id: uuid(), p_expected_row_version: 1, p_actor_user_id: uuid(), p_acceptance_comment: 'x' })],
  ['forge_perform_capa_lifecycle_transition (write)', 'forge_perform_capa_lifecycle_transition', () => ({ p_organization_id: uuid(), p_capa_id: uuid(), p_expected_capa_status: 'open', p_to_capa_status: 'closed', p_transition_key: 'close', p_actor_user_id: uuid(), p_comment: null, p_capa_patch: {}, p_metadata: {}, p_idempotency_key: uuid() })],
  ['forge_perform_workflow_transition (write)', 'forge_perform_workflow_transition', () => ({ p_organization_id: uuid(), p_instance_id: uuid(), p_expected_state: 'a', p_transition_key: 'b', p_to_state: 'c', p_actor_user_id: uuid(), p_comment: null, p_metadata: {}, p_idempotency_key: uuid(), p_complete: false, p_cancel: false })],
  ['resolve_and_record_forge_qr_scan (write)', 'resolve_and_record_forge_qr_scan', () => ({ p_token: 'not-a-token', p_auth_user_id: null, p_user_agent: 'rpc-hardening-test', p_referrer: null })]
]

let passed = 0
function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg)
}
function ok(label) {
  passed += 1
  console.log('  PASS ' + label)
}

async function call(method, urlPath, { token, body, accept } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      apikey: token === SERVICE ? SERVICE : ANON,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(accept ? { Accept: accept } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: res.status, data }
}

const rpc = (name, args, token) => call('POST', '/rest/v1/rpc/' + name, { token, body: args })

async function rpcPaths(token) {
  const res = await call('GET', '/rest/v1/', { token, accept: 'application/openapi+json' })
  assert(res.status === 200, 'OpenAPI document returned ' + res.status)
  return Object.keys(res.data.paths || {})
    .filter(p => p.startsWith('/rpc/'))
    .map(p => p.slice(5))
    .filter(p => !HARDENED_ELSEWHERE.includes(p))
    .sort()
}

function expectDenied(res, label) {
  assert(
    (res.status === 401 || res.status === 403) && res.data?.code === '42501',
    label + ' expected 42501 permission denied, got ' + res.status + ' ' + JSON.stringify(res.data).slice(0, 300)
  )
}

function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
}

async function signIn(email) {
  const res = await fetch(BASE + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD })
  })
  const data = await res.json()
  assert(res.ok && data.access_token, 'sign-in as ' + email + ' failed: ' + res.status + ' ' + JSON.stringify(data).slice(0, 300))
  return data.access_token
}

async function main() {
  console.log('RPC EXECUTE hardening regression against ' + BASE)

  // Sign-in runs custom_access_token_hook as supabase_auth_admin.
  const userJwt = await signIn(DEMO_USER_EMAIL)
  const claims = decodeJwt(userJwt)
  assert(claims.role === 'authenticated', 'signed-in JWT role is ' + claims.role)
  assert(Array.isArray(claims.roles) && Array.isArray(claims.permissions), 'custom access token hook claims missing: ' + JSON.stringify(Object.keys(claims)))
  ok('sign-in still runs the custom access token hook (roles/permissions claims present)')

  const anonPaths = await rpcPaths(ANON)
  assert(anonPaths.length === 0, 'anon can still execute: ' + anonPaths.join(', '))
  ok('anon key can execute no public function (OpenAPI lists no /rpc/ paths)')

  const userPaths = await rpcPaths(userJwt)
  const unexpected = userPaths.filter(p => !POLICY_HELPERS.includes(p))
  assert(unexpected.length === 0, 'signed-in user can execute server-only functions: ' + unexpected.join(', '))
  const missing = POLICY_HELPERS.filter(p => !userPaths.includes(p))
  assert(missing.length === 0, 'signed-in user lost RLS helper functions: ' + missing.join(', '))
  ok('signed-in user can execute exactly the ' + POLICY_HELPERS.length + ' RLS helper functions')

  for (const [label, name, args] of SERVER_ONLY) {
    expectDenied(await rpc(name, args(), ANON), 'anon ' + label)
    expectDenied(await rpc(name, args(), userJwt), 'authenticated ' + label)
    ok(label + ' denied to anon and signed-in user')
  }

  expectDenied(await rpc('is_org_member', { target_organization_id: DEMO_ORG }, ANON), 'anon is_org_member')
  const member = await rpc('is_org_member', { target_organization_id: DEMO_ORG }, userJwt)
  assert(member.status === 200 && member.data === true, 'is_org_member for demo user: ' + member.status + ' ' + JSON.stringify(member.data))
  ok('is_org_member denied to anon, still executable by a signed-in member')

  const assets = await call('GET', '/rest/v1/forge_assets?select=id,organization_id&limit=5', { token: userJwt })
  assert(assets.status === 200 && Array.isArray(assets.data), 'RLS read of forge_assets: ' + assets.status + ' ' + JSON.stringify(assets.data).slice(0, 300))
  assert(assets.data.length > 0 && assets.data.every(r => r.organization_id === DEMO_ORG), 'RLS read returned no demo-org assets')
  ok('RLS-protected read (is_org_member policy) still returns the member org rows')

  const analytics = await rpc('forge_support_analytics', SERVER_ONLY[0][2](), SERVICE)
  assert(analytics.status === 200, 'service_role forge_support_analytics: ' + analytics.status + ' ' + JSON.stringify(analytics.data).slice(0, 300))
  const staffPerm = await rpc('forge_support_staff_has_permission', { p_user_id: uuid(), p_permission_key: 'tickets.view' }, SERVICE)
  assert(staffPerm.status === 200 && staffPerm.data === false, 'service_role forge_support_staff_has_permission: ' + staffPerm.status)
  ok('service_role still executes server-only RPCs')

  console.log('\nRPC EXECUTE hardening: ' + passed + ' checks passed')
}

main().catch(error => {
  console.error(error.message || error)
  process.exit(1)
})
