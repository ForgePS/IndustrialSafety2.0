/**
 * Forge AI Command Center stage 1 database regression (local Supabase, after `supabase db reset`):
 *  - rollout flag and model registry are seeded;
 *  - agent runs, audit events and the model registry are closed to anon/authenticated clients;
 *  - the AI audit trail is append-only;
 *  - retention removes only the target tenant's expired, unpinned conversations (and their
 *    messages), keeps pinned and recent ones, and is not callable by signed-in clients.
 * Run: node apps/web/tests/forge-ai-foundation-db.cjs
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

if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase URL, anon key or service role key.')
  process.exit(1)
}

const CYPRESS = '20000000-0000-4000-8000-000000000100'
const NORTHSTAR = '40000000-0000-4000-8000-000000000100'
const CYPRESS_USER = '20000000-0000-4000-8000-000000000001'
const NORTHSTAR_USER = '40000000-0000-4000-8000-000000000001'

async function call(pathname, { key = SERVICE_ROLE_KEY, bearer = key, method = 'GET', body, prefer = 'return=representation' } = {}) {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json', Prefer: prefer },
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

async function must(pathname, options) {
  const result = await call(pathname, options)

  if (!result.ok) throw new Error(pathname + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))

  return result.data
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!data.access_token) throw new Error('Sign-in failed for ' + email)

  return data.access_token
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('  ok - ' + message)
}

const daysAgo = days => new Date(Date.now() - days * 86400000).toISOString()

async function conversation(org, user, title, lastMessageDaysAgo, pinned = false) {
  const [row] = await must('/rest/v1/forge_ai_conversations', {
    method: 'POST',
    body: { organization_id: org, user_id: user, title, status: 'active', pinned, last_message_at: daysAgo(lastMessageDaysAgo), created_at: daysAgo(lastMessageDaysAgo) }
  })

  await must('/rest/v1/forge_ai_messages', {
    method: 'POST',
    body: { organization_id: org, conversation_id: row.id, user_id: user, role: 'user', content: 'retention probe' }
  })

  return row.id
}

async function exists(table, id) {
  const rows = await must(`/rest/v1/${table}?id=eq.${id}&select=id`)

  return rows.length === 1
}

async function main() {
  console.log('Forge AI Command Center foundation (database)...')

  const [feature] = await must('/rest/v1/forge_feature_registry?feature_key=eq.forge_ai_command_center&select=feature_key,requires_entitlement,platform_state')
  assert(feature && feature.requires_entitlement === true, 'rollout flag forge_ai_command_center is registered and entitlement-gated')

  const models = await must('/rest/v1/forge_ai_model_registry?select=provider,model_key,enabled,input_cost_per_million_cents')
  assert(models.some(m => m.provider === 'openai' && m.model_key === 'gpt-6-sol' && m.enabled), 'default chat model is registered and enabled')
  assert(models.some(m => m.provider === 'test' && !m.enabled), 'test provider model is registered but disabled for tenant selection')
  assert(models.every(m => m.input_cost_per_million_cents === null), 'no unconfirmed model prices are seeded')

  // Signed-in tenant users cannot read or write the new tables directly; access goes through the server.
  const token = await signIn('admin@forge2.local')

  for (const table of ['forge_ai_agent_runs', 'forge_ai_audit_events', 'forge_ai_model_registry']) {
    const read = await call(`/rest/v1/${table}?select=*&limit=1`, { key: ANON_KEY, bearer: token })
    assert(!read.ok || (Array.isArray(read.data) && read.data.length === 0), `${table} is not readable by a signed-in client`)
  }

  const forged = await call('/rest/v1/forge_ai_audit_events', {
    key: ANON_KEY,
    bearer: token,
    method: 'POST',
    body: { organization_id: CYPRESS, event_type: 'forged' }
  })
  assert(!forged.ok, 'a signed-in client cannot write AI audit events')

  const retentionByClient = await call('/rest/v1/rpc/forge_ai_apply_retention', { key: ANON_KEY, bearer: token, method: 'POST', body: { p_organization_id: CYPRESS } })
  assert(!retentionByClient.ok, 'a signed-in client cannot run AI retention')

  // Agent runs and append-only audit.
  const [run] = await must('/rest/v1/forge_ai_agent_runs', {
    method: 'POST',
    body: { organization_id: CYPRESS, user_id: CYPRESS_USER, prompt_key: 'assistant.general', prompt_version: 1, prompt_hash: 'test', provider: 'test', model: 'forge-test-stub' }
  })
  const badRun = await call('/rest/v1/forge_ai_agent_runs', {
    method: 'POST',
    body: { organization_id: CYPRESS, prompt_key: 'x', prompt_version: 0, prompt_hash: 'x', provider: 'test', model: 'x' }
  })
  assert(!badRun.ok, 'agent runs reject an invalid prompt version')

  const [event] = await must('/rest/v1/forge_ai_audit_events', {
    method: 'POST',
    body: { organization_id: CYPRESS, actor_user_id: CYPRESS_USER, event_type: 'test.event', agent_run_id: run.id, detail: { probe: true } }
  })
  const edit = await call(`/rest/v1/forge_ai_audit_events?id=eq.${event.id}`, { method: 'PATCH', body: { event_type: 'tampered' } })
  assert(!edit.ok && /append-only/.test(JSON.stringify(edit.data)), 'AI audit events cannot be edited')
  const removal = await call(`/rest/v1/forge_ai_audit_events?id=eq.${event.id}`, { method: 'DELETE' })
  assert(!removal.ok && /append-only/.test(JSON.stringify(removal.data)), 'AI audit events cannot be deleted')

  await must(`/rest/v1/forge_ai_agent_runs?id=eq.${run.id}`, { method: 'DELETE', prefer: 'return=minimal' })
  const [orphaned] = await must(`/rest/v1/forge_ai_audit_events?id=eq.${event.id}&select=agent_run_id,event_type`)
  assert(orphaned.agent_run_id === null && orphaned.event_type === 'test.event', 'deleting a run keeps its audit event (link set to null)')

  // Retention is tenant-scoped and honours pinning and the retention window.
  await must(`/rest/v1/forge_ai_tenant_settings?organization_id=eq.${CYPRESS}`, { method: 'PATCH', body: { data_retention_days: 90 }, prefer: 'return=minimal' })
  const expired = await conversation(CYPRESS, CYPRESS_USER, 'expired', 200)
  const pinned = await conversation(CYPRESS, CYPRESS_USER, 'pinned', 200, true)
  const recent = await conversation(CYPRESS, CYPRESS_USER, 'recent', 10)
  const otherTenant = await conversation(NORTHSTAR, NORTHSTAR_USER, 'other tenant expired', 400)

  const result = await must('/rest/v1/rpc/forge_ai_apply_retention', { method: 'POST', body: { p_organization_id: CYPRESS } })
  assert(result.conversations_deleted >= 1, 'retention reports deleted conversations')
  assert(!(await exists('forge_ai_conversations', expired)), 'expired unpinned conversation is removed')
  const leftover = await must(`/rest/v1/forge_ai_messages?conversation_id=eq.${expired}&select=id`)
  assert(leftover.length === 0, 'its messages are removed with it')
  assert(await exists('forge_ai_conversations', pinned), 'pinned conversation is kept')
  assert(await exists('forge_ai_conversations', recent), 'recent conversation is kept')
  assert(await exists('forge_ai_conversations', otherTenant), 'another tenant\'s conversation is untouched')

  const audit = await must(`/rest/v1/forge_ai_audit_events?organization_id=eq.${CYPRESS}&event_type=eq.retention.applied&select=detail&order=id.desc&limit=1`)
  assert(audit.length === 1 && audit[0].detail.retention_days === 90, 'retention run is written to the AI audit trail')

  const unknown = await call('/rest/v1/rpc/forge_ai_apply_retention', { method: 'POST', body: { p_organization_id: '99999999-0000-4000-8000-000000000000' } })
  assert(!unknown.ok, 'retention refuses an unknown organization')

  // Clean up rows this test created (audit rows are append-only by design and stay).
  for (const id of [pinned, recent, otherTenant]) {
    await must(`/rest/v1/forge_ai_conversations?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
  }

  await must(`/rest/v1/forge_ai_tenant_settings?organization_id=eq.${CYPRESS}`, { method: 'PATCH', body: { data_retention_days: 365 }, prefer: 'return=minimal' })

  console.log('Forge AI Command Center foundation database checks passed.')
}

main().catch(error => {
  console.error('FAILED:', error.message)
  process.exit(1)
})
