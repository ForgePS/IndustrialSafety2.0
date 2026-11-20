/**
 * Port slice 14 (Industrial 1.0 -> 2.0): Emergency Management database contract checks.
 * Plan / drill checks, one company, team members, alert guards (only message, severity and status change; a
 * cleared alert is frozen), immutable history and recipients, recipients must be members, responses only from
 * recipients of an active alert, permissions and grants, and no direct access for signed-in users.
 * Run: node apps/web/tests/port-s14-emergency-db.cjs
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const assert = require('node:assert/strict')

for (const name of ['.env.local', '.env']) {
  const envPath = path.join(__dirname, '..', name)

  if (!fs.existsSync(envPath)) continue
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ORG = '20000000-0000-4000-8000-000000000100'
const OTHER_ORG = '40000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const OUTSIDER = '40000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: { apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { status: response.status, data }
}

const rest = (table, query = '', options = {}) => request('/rest/v1/' + table + (query ? '?' + query : ''), options)

async function ok(promise, label) {
  const result = await promise

  if (result.status >= 300) throw new Error(label + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))

  return result.data
}

async function fails(promise, pattern, label) {
  const result = await promise

  assert.ok(result.status >= 400, label + ' should fail but returned ' + result.status)
  assert.match(String(result.data?.message || JSON.stringify(result.data)), pattern, label)
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!data.access_token) throw new Error('Sign-in failed for ' + email)

  return data
}

const plan = (patch = {}) => ({ organization_id: ORG, kind: 'plan', title: `S14 DB plan ${RUN}`, status: 'active', created_by: ADMIN, ...patch })
const alertRow = (patch = {}) => ({
  organization_id: ORG,
  alert_number: 'EA-20261119-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
  alert_type: 'evacuation',
  severity: 'extreme',
  headline: `S14 DB alert ${RUN}`,
  message: 'Leave now.',
  audience: { scope: 'company', locationIds: [], departmentIds: [], personnelIds: [] },
  recipient_count: 2,
  sent_by: ADMIN,
  ...patch
})

async function main() {
  assert.ok(API_URL && SERVICE_ROLE_KEY && ANON_KEY, 'Supabase URL and keys are needed (apps/web/.env.local).')

  const user = await signIn('user@forge2.local')
  const plans = []
  const alerts = []

  try {
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ kind: 'drill', status: 'scheduled' }) }), /drill_date/, 'drill without a date')
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ status: 'scheduled' }) }), /status_check/, 'plan with a drill status')
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ kind: 'drill', status: 'completed', event_date: '2026-11-01' }) }), /completed_review/, 'completed drill without a review')
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ participants: 3 }) }), /drill_fields/, 'drill fields on a plan')
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ kind: 'scenario' }) }), /scenario_type/, 'scenario without a type')

    const [eap] = await ok(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ location_id: LOCATION }) }), 'insert plan')

    plans.push(eap.id)

    const [otherPlan] = await ok(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ organization_id: OTHER_ORG, title: `S14 DB other ${RUN}`, created_by: OUTSIDER }) }), 'insert other company plan')

    plans.push(otherPlan.id)
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ kind: 'drill', status: 'scheduled', event_date: '2026-12-01', plan_id: otherPlan.id }) }), /one company/, 'drill linked to another company plan')
    await fails(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ organization_id: OTHER_ORG, location_id: LOCATION, created_by: OUTSIDER }) }), /one company/, 'location from another company')

    const [drill] = await ok(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ kind: 'drill', status: 'scheduled', event_date: '2026-12-01', plan_id: eap.id, title: `S14 DB drill ${RUN}` }) }), 'insert drill')

    plans.push(drill.id)
    console.log('ok - plans and drills check their fields and stay in one company')

    const [person] = await ok(rest('forge_personnel', `organization_id=eq.${ORG}&archived_at=is.null&select=id&limit=1`), 'a person')

    await fails(rest('forge_emergency_team_members', '', { method: 'POST', body: { team_id: eap.id, organization_id: ORG, personnel_id: person.id } }), /response team/, 'member on a plan')

    const [team] = await ok(rest('forge_emergency_plans', '', { method: 'POST', body: plan({ kind: 'team', title: `S14 DB team ${RUN}` }) }), 'insert team')

    plans.push(team.id)
    await ok(rest('forge_emergency_team_members', '', { method: 'POST', body: { team_id: team.id, organization_id: ORG, personnel_id: person.id, team_role: 'Lead' } }), 'add member')
    console.log('ok - team members only go on response teams')

    const [alert] = await ok(rest('forge_emergency_alerts', '', { method: 'POST', body: alertRow() }), 'insert alert')

    alerts.push(alert.id)
    await fails(rest('forge_emergency_alerts', '', { method: 'POST', body: alertRow({ alert_number: 'EA-1' }) }), /check/i, 'bad alert number')
    await fails(rest('forge_emergency_alerts', '', { method: 'POST', body: alertRow({ alert_number: alert.alert_number }) }), /duplicate|unique/i, 'duplicate alert number')

    await ok(rest('forge_emergency_alert_recipients', '', { method: 'POST', body: [ADMIN, USER].map(id => ({ alert_id: alert.id, organization_id: ORG, user_id: id, name: id === ADMIN ? 'Admin' : 'User' })) }), 'add recipients')
    await fails(rest('forge_emergency_alert_recipients', '', { method: 'POST', body: { alert_id: alert.id, organization_id: ORG, user_id: OUTSIDER, name: 'Outsider' } }), /active members/, 'outsider recipient')
    await fails(rest('forge_emergency_alert_recipients', '', { method: 'POST', body: { alert_id: alert.id, organization_id: OTHER_ORG, user_id: OUTSIDER, name: 'Outsider' } }), /one company/, 'recipient in other company')
    await fails(rest('forge_emergency_alert_recipients', 'alert_id=eq.' + alert.id + '&user_id=eq.' + USER, { method: 'PATCH', body: { name: 'Changed' } }), /can't be changed/, 'edit recipient')
    console.log('ok - recipients are members of the same company and are a record')

    const [issued] = await ok(rest('forge_emergency_alert_updates', '', { method: 'POST', body: { alert_id: alert.id, organization_id: ORG, kind: 'issued', headline: alert.headline, message: alert.message } }), 'add update')

    await fails(rest('forge_emergency_alert_updates', 'id=eq.' + issued.id, { method: 'PATCH', body: { message: 'Rewritten' } }), /can't be changed/, 'edit history')

    await fails(rest('forge_emergency_alerts', 'id=eq.' + alert.id, { method: 'PATCH', body: { is_drill: true } }), /Only the message/, 'turn into a drill')
    await fails(rest('forge_emergency_alerts', 'id=eq.' + alert.id, { method: 'PATCH', body: { audience: { scope: 'targeted' } } }), /Only the message/, 'change audience')
    await ok(rest('forge_emergency_alerts', 'id=eq.' + alert.id, { method: 'PATCH', body: { headline: 'Updated', severity: 'severe' } }), 'update message')
    await fails(rest('forge_emergency_alerts', 'id=eq.' + alert.id, { method: 'PATCH', body: { status: 'cleared' } }), /cleared/, 'clear without a time')
    console.log('ok - only the message, severity and status of an alert change; history is a record')

    await fails(rest('forge_emergency_alert_responses', '', { method: 'POST', body: { alert_id: alert.id, organization_id: ORG, user_id: OUTSIDER, status: 'safe' } }), /foreign key|violates/i, 'response from a non-recipient')
    await fails(rest('forge_emergency_alert_responses', '', { method: 'POST', body: { alert_id: alert.id, organization_id: ORG, user_id: USER, status: 'fine' } }), /check/i, 'bad response status')
    await ok(rest('forge_emergency_alert_responses', '', { method: 'POST', body: { alert_id: alert.id, organization_id: ORG, user_id: USER, status: 'need_help', note: 'Dock 3' } }), 'respond')
    await ok(rest('forge_emergency_alert_responses', 'alert_id=eq.' + alert.id + '&user_id=eq.' + USER, { method: 'PATCH', body: { status: 'safe' } }), 'change response')

    const [quiet] = await ok(rest('forge_emergency_alerts', '', { method: 'POST', body: alertRow({ requires_response: false }) }), 'alert without responses')

    alerts.push(quiet.id)
    await ok(rest('forge_emergency_alert_recipients', '', { method: 'POST', body: { alert_id: quiet.id, organization_id: ORG, user_id: USER, name: 'User' } }), 'recipient')
    await fails(rest('forge_emergency_alert_responses', '', { method: 'POST', body: { alert_id: quiet.id, organization_id: ORG, user_id: USER, status: 'safe' } }), /isn't taking responses/, 'response not asked for')
    console.log('ok - only recipients respond, and only when the alert asks')

    await ok(rest('forge_emergency_alerts', 'id=eq.' + alert.id, { method: 'PATCH', body: { status: 'cleared', cleared_at: new Date().toISOString(), cleared_by: ADMIN } }), 'clear')
    await fails(rest('forge_emergency_alerts', 'id=eq.' + alert.id, { method: 'PATCH', body: { headline: 'After' } }), /cleared alert/, 'edit cleared alert')
    await fails(rest('forge_emergency_alert_responses', 'alert_id=eq.' + alert.id + '&user_id=eq.' + USER, { method: 'PATCH', body: { status: 'need_help' } }), /isn't taking responses/, 'respond after all-clear')
    console.log('ok - a cleared alert is frozen and closes responses')

    for (const table of ['forge_emergency_plans', 'forge_emergency_team_members', 'forge_emergency_alert_templates', 'forge_emergency_alerts', 'forge_emergency_alert_updates', 'forge_emergency_alert_recipients', 'forge_emergency_alert_responses']) {
      const result = await rest(table, 'select=*&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' readable by a signed-in user')
    }

    console.log('ok - signed-in users have no direct table access')

    const permissions = await ok(rest('forge_permission_registry', 'or=(feature_key.eq.emergency_alerts,feature_key.eq.emergency_management)&select=id,permission_key,danger_level,tenant_assignable'), 'permissions')
    const byKey = Object.fromEntries(permissions.map(row => [row.permission_key, row]))

    for (const key of ['emergency_alerts.view', 'emergency_alerts.run_drills', 'emergency_alerts.send', 'emergency_alerts.manage_templates']) assert.ok(byKey[key], key + ' registered')
    assert.equal(byKey['emergency_alerts.send'].danger_level, 'critical')
    assert.equal(byKey['emergency_management.send_alerts'].tenant_assignable, false)

    const roles = await ok(rest('forge_tenant_roles', `organization_id=eq.${ORG}&select=id,role_key`), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id,scope&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const grantsFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return Object.fromEntries((role ? grants.filter(row => row.role_id === role.id) : []).map(row => [permissions.find(p => p.id === row.permission_id).permission_key, row.scope]))
    }

    assert.equal(grantsFor('company-administrator')['emergency_alerts.send'], 'organization')
    assert.equal(grantsFor('location-administrator')['emergency_alerts.send'], 'location')
    assert.equal(grantsFor('supervisor')['emergency_alerts.run_drills'], 'location')
    assert.equal(grantsFor('supervisor')['emergency_alerts.send'], undefined, 'supervisors send drills only')
    assert.equal(grantsFor('employee')['emergency_alerts.view'], undefined, 'employees only see the alerts sent to them')
    assert.equal(grantsFor('employee')['emergency_management.view'], 'own')
    assert.ok(!grants.some(row => row.permission_id === byKey['emergency_management.send_alerts'].id), 'old send permission granted to nobody')
    console.log('ok - permissions are registered and granted by role')
  } finally {
    for (const id of alerts) await rest('forge_emergency_alerts', 'id=eq.' + id, { method: 'DELETE' })
    for (const id of plans.reverse()) await rest('forge_emergency_plans', 'id=eq.' + id, { method: 'DELETE' })
  }

  console.log('\nport-s14 emergency database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
