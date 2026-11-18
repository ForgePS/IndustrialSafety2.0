/**
 * Forge AI Command Center stage 3 database regression (local Supabase, after `supabase db reset`):
 *  - risk models, assessments, indicators, alert routes and Watch cursors are closed to clients;
 *  - the platform risk model, the new Watch rules (enabled for the demo tenant), the risk
 *    permission and the risk tool capability are registered;
 *  - submitting an incident publishes a domain event; drafts and edits do not;
 *  - alert routes reject a route with no recipient.
 * Run: node apps/web/tests/forge-ai-risk-monitoring-db.cjs
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
const MAIN_PLANT = '20000000-0000-4000-8000-000000000300'
const RUN = Date.now().toString(36).toUpperCase()

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

const NEW_RULES = [
  'incident.serious_reported',
  'incident.recurring_type',
  'incident.emerging_trend',
  'inspection.failed',
  'observation.high_risk_open',
  'risk.review_overdue',
  'training.location_gap',
  'risk.indicator_elevated'
]

async function main() {
  console.log('Forge AI Command Center risk and monitoring (database)...')

  const token = await signIn('admin@forge2.local')

  for (const table of ['forge_ai_risk_models', 'forge_ai_risk_assessments', 'forge_ai_risk_indicators', 'forge_ai_alert_routes', 'forge_ai_watch_cursors']) {
    for (const [label, options] of [['anonymous', { key: ANON_KEY }], ['signed-in', { key: ANON_KEY, bearer: token }]]) {
      const read = await call(`/rest/v1/${table}?select=*&limit=1`, options)

      assert(!read.ok || (Array.isArray(read.data) && read.data.length === 0), `${label} clients cannot read ${table}`)
    }
  }

  const writeRoute = await call('/rest/v1/forge_ai_alert_routes', {
    key: ANON_KEY,
    bearer: token,
    method: 'POST',
    body: { organization_id: CYPRESS, recipient_type: 'user', user_id: '20000000-0000-4000-8000-000000000001', channel: 'email' }
  })
  assert(!writeRoute.ok, 'signed-in clients cannot add alert routes directly')

  const trigger = await call('/rest/v1/rpc/forge_incident_submitted_outbox', { key: ANON_KEY, bearer: token, method: 'POST', body: {} })
  assert(!trigger.ok, 'the outbox trigger function cannot be called by clients')

  const [riskModel] = await must('/rest/v1/forge_ai_risk_models?organization_id=is.null&model_key=eq.facility_risk&version=eq.1&select=factors,bands,status')
  const weights = riskModel.factors.reduce((sum, factor) => sum + factor.weight, 0)
  assert(riskModel.status === 'active' && Math.abs(weights - 1) < 1e-9, 'the platform risk model is active and its weights sum to 1')
  assert(riskModel.bands.map(band => band.key).join() === 'low,moderate,elevated,high', 'the risk model has four ordered bands')

  const templates = await must(`/rest/v1/forge_ai_watch_rule_templates?rule_key=in.(${NEW_RULES.join(',')})&select=rule_key,id`)
  assert(templates.length === NEW_RULES.length, 'all eight new Watch rule templates are registered')

  const rules = await must(`/rest/v1/forge_ai_watch_rules?organization_id=eq.${CYPRESS}&enabled=eq.true&template_id=in.(${templates.map(t => t.id).join(',')})&select=id`)
  assert(rules.length === NEW_RULES.length, 'the new rules are enabled for the demo tenant')

  const [permission] = await must('/rest/v1/forge_permission_registry?permission_key=eq.forge_ai.view_risk&select=id,default_scope')
  assert(permission && permission.default_scope === 'location', 'forge_ai.view_risk is registered and location-scoped by default')

  const [capability] = await must('/rest/v1/forge_ai_capabilities?capability_key=eq.get_risk_indicators&select=required_permission_key')
  assert(capability && capability.required_permission_key === 'forge_ai.view_risk', 'the risk tool requires forge_ai.view_risk')

  const badRoute = await call('/rest/v1/forge_ai_alert_routes', {
    method: 'POST',
    body: { organization_id: CYPRESS, recipient_type: 'tenant_role', channel: 'in_app' }
  })
  assert(!badRoute.ok, 'an alert route must name its recipient')

  // Incident submission publishes a domain event; drafts do not.
  const created = []

  try {
    const [draft] = await must('/rest/v1/forge_incidents', {
      method: 'POST',
      body: { organization_id: CYPRESS, incident_number: 'INC-DBT-' + RUN + '-1', status: 'draft', severity: 'minor', incident_type: 'near_miss', occurred_at: new Date().toISOString(), summary: 'Outbox draft probe', location_id: MAIN_PLANT }
    })
    created.push(draft.id)

    let events = await must(`/rest/v1/forge_domain_event_outbox?resource_id=eq.${draft.id}&select=event_type`)
    assert(events.length === 0, 'a draft incident publishes no event')

    await must(`/rest/v1/forge_incidents?id=eq.${draft.id}`, { method: 'PATCH', body: { status: 'submitted', submitted_at: new Date().toISOString() }, prefer: 'return=minimal' })
    events = await must(`/rest/v1/forge_domain_event_outbox?resource_id=eq.${draft.id}&select=event_type,payload`)
    assert(events.length === 1 && events[0].event_type === 'incident.submitted' && events[0].payload.location_id === MAIN_PLANT, 'submitting it publishes incident.submitted')

    await must(`/rest/v1/forge_incidents?id=eq.${draft.id}`, { method: 'PATCH', body: { summary: 'Edited after submit' }, prefer: 'return=minimal' })
    events = await must(`/rest/v1/forge_domain_event_outbox?resource_id=eq.${draft.id}&select=id`)
    assert(events.length === 1, 'editing a submitted incident does not publish again')

    const [direct] = await must('/rest/v1/forge_incidents', {
      method: 'POST',
      body: { organization_id: CYPRESS, incident_number: 'INC-DBT-' + RUN + '-2', status: 'submitted', severity: 'serious', incident_type: 'injury', occurred_at: new Date().toISOString(), summary: 'Outbox insert probe', location_id: MAIN_PLANT }
    })
    created.push(direct.id)
    events = await must(`/rest/v1/forge_domain_event_outbox?resource_id=eq.${direct.id}&select=id`)
    assert(events.length === 1, 'an incident created as submitted publishes once')
  } finally {
    for (const id of created) {
      await call(`/rest/v1/forge_domain_event_outbox?resource_id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
      await call(`/rest/v1/forge_incidents?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    }
  }

  console.log('Forge AI Command Center risk and monitoring database checks passed.')
}

main().catch(error => {
  console.error('FAILED:', error.message)
  process.exit(1)
})
