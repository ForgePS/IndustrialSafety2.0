/**
 * Port slice 13 (Industrial 1.0 -> 2.0): Reporting database contract checks.
 * Saved report checks, one schedule per saved report, schedules and recipients kept in one company, recipients
 * must be active members, run history can't be changed, cascades, the permission rows and grants, and no
 * direct access for signed-in users.
 * Run: node apps/web/tests/port-s13-reporting-db.cjs
 */
const fs = require('fs')
const path = require('path')
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
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const OUTSIDER = '40000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
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

const savedReport = (patch = {}) => ({
  organization_id: ORG,
  owner_user_id: ADMIN,
  report_key: 'incidents.log',
  name: `S13 DB ${RUN}`,
  params: { preset: 'all' },
  visibility: 'organization',
  ...patch
})

const schedule = (savedReportId, patch = {}) => ({
  organization_id: ORG,
  saved_report_id: savedReportId,
  created_by: ADMIN,
  frequency: 'weekly',
  hour: 7,
  weekday: 1,
  monthday: 1,
  timezone: 'America/Chicago',
  next_run_at: new Date(Date.now() + 86_400_000).toISOString(),
  ...patch
})

async function main() {
  assert.ok(API_URL && SERVICE_ROLE_KEY && ANON_KEY, 'Supabase URL and keys are needed (apps/web/.env.local).')

  const user = await signIn('user@forge2.local')
  const created = []

  try {
    await fails(rest('forge_saved_reports', '', { method: 'POST', body: savedReport({ name: '   ' }) }), /check/i, 'blank name')
    await fails(rest('forge_saved_reports', '', { method: 'POST', body: savedReport({ report_key: 'Not A Key' }) }), /check/i, 'bad report key')
    await fails(rest('forge_saved_reports', '', { method: 'POST', body: savedReport({ visibility: 'public' }) }), /check/i, 'bad visibility')
    await fails(rest('forge_saved_reports', '', { method: 'POST', body: savedReport({ params: [] }) }), /check/i, 'params not an object')

    const [saved] = await ok(rest('forge_saved_reports', '', { method: 'POST', body: savedReport() }), 'insert saved report')

    created.push(saved.id)
    console.log('ok - saved reports check name, report key, visibility and params')

    await fails(rest('forge_report_schedules', '', { method: 'POST', body: schedule(saved.id, { organization_id: OTHER_ORG }) }), /one company/, 'schedule in other company')
    await fails(rest('forge_report_schedules', '', { method: 'POST', body: schedule(saved.id, { hour: 24 }) }), /check/i, 'hour 24')
    await fails(rest('forge_report_schedules', '', { method: 'POST', body: schedule(saved.id, { monthday: 29 }) }), /check/i, 'monthday 29')
    await fails(rest('forge_report_schedules', '', { method: 'POST', body: schedule(saved.id, { frequency: 'hourly' }) }), /check/i, 'hourly')

    const [sched] = await ok(rest('forge_report_schedules', '', { method: 'POST', body: schedule(saved.id) }), 'insert schedule')

    await fails(rest('forge_report_schedules', '', { method: 'POST', body: schedule(saved.id) }), /duplicate|unique/i, 'second schedule')
    console.log('ok - one schedule per saved report, in the same company, with valid timing')

    await ok(rest('forge_report_schedule_recipients', '', { method: 'POST', body: [ADMIN, USER].map(id => ({ schedule_id: sched.id, organization_id: ORG, user_id: id })) }), 'add recipients')
    await fails(
      rest('forge_report_schedule_recipients', '', { method: 'POST', body: { schedule_id: sched.id, organization_id: ORG, user_id: OUTSIDER } }),
      /active members/,
      'outsider recipient'
    )
    await fails(
      rest('forge_report_schedule_recipients', '', { method: 'POST', body: { schedule_id: sched.id, organization_id: OTHER_ORG, user_id: OUTSIDER } }),
      /one company/,
      'recipient in other company'
    )
    console.log('ok - recipients must be active members of the same company')

    const [run] = await ok(
      rest('forge_report_runs', '', {
        method: 'POST',
        body: { organization_id: ORG, user_id: ADMIN, report_key: 'incidents.log', saved_report_id: saved.id, schedule_id: sched.id, kind: 'view', status: 'succeeded', row_count: 3 }
      }),
      'insert run'
    )

    await fails(rest('forge_report_runs', 'id=eq.' + run.id, { method: 'PATCH', body: { row_count: 99 } }), /can't be changed/, 'edit run')
    await fails(rest('forge_report_runs', 'id=eq.' + run.id, { method: 'PATCH', body: { schedule_id: null, status: 'failed' } }), /can't be changed/, 'unlink and edit run')

    const [other] = await ok(rest('forge_saved_reports', '', { method: 'POST', body: savedReport({ name: `S13 DB other ${RUN}` }) }), 'insert other saved report')

    created.push(other.id)
    await fails(rest('forge_report_runs', 'id=eq.' + run.id, { method: 'PATCH', body: { saved_report_id: other.id } }), /can't be changed/, 'relink run')
    await fails(
      rest('forge_report_runs', '', { method: 'POST', body: { organization_id: ORG, user_id: ADMIN, report_key: 'incidents.log', kind: 'email', status: 'succeeded' } }),
      /check/i,
      'bad run kind'
    )
    console.log("ok - run history can't be changed")

    for (const table of ['forge_saved_reports', 'forge_report_schedules', 'forge_report_schedule_recipients', 'forge_report_runs']) {
      const result = await rest(table, 'select=*&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' readable by a signed-in user')
    }

    console.log('ok - signed-in users have no direct table access')

    const permissions = await ok(rest('forge_permission_registry', 'permission_key=like.reporting.*&select=id,permission_key,is_sensitive'), 'permissions')
    const byKey = Object.fromEntries(permissions.map(row => [row.permission_key, row]))

    for (const key of ['reporting.view', 'reporting.export', 'reporting.share', 'reporting.schedule', 'reporting.view_sensitive']) assert.ok(byKey[key], key + ' registered')
    assert.equal(byKey['reporting.view_sensitive'].is_sensitive, true)

    const roles = await ok(rest('forge_tenant_roles', `organization_id=eq.${ORG}&select=id,role_key`), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const keysFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return role ? grants.filter(row => row.role_id === role.id).map(row => permissions.find(p => p.id === row.permission_id).permission_key) : []
    }

    assert.ok(keysFor('company-administrator').includes('reporting.view_sensitive'), 'company admin gets sensitive columns')
    assert.ok(keysFor('supervisor').includes('reporting.schedule'), 'supervisor can schedule')
    assert.ok(!keysFor('supervisor').includes('reporting.share'), 'supervisor cannot share')
    assert.ok(!keysFor('employee').includes('reporting.view_sensitive'), 'employee has no sensitive columns')
    console.log('ok - reporting permissions are registered and granted by role')

    await ok(rest('forge_saved_reports', 'id=eq.' + saved.id, { method: 'DELETE' }), 'delete saved report')
    created.splice(created.indexOf(saved.id), 1)

    assert.equal((await ok(rest('forge_report_schedules', 'id=eq.' + sched.id), 'schedule after delete')).length, 0)
    assert.equal((await ok(rest('forge_report_schedule_recipients', 'schedule_id=eq.' + sched.id), 'recipients after delete')).length, 0)

    const [kept] = await ok(rest('forge_report_runs', 'id=eq.' + run.id + '&select=saved_report_id,schedule_id'), 'run after delete')

    assert.equal(kept.saved_report_id, null)
    assert.equal(kept.schedule_id, null)
    console.log('ok - deleting a saved report removes its schedule and recipients and keeps the run history')
  } finally {
    for (const id of created) await rest('forge_saved_reports', 'id=eq.' + id, { method: 'DELETE' })
  }

  console.log('\nport-s13 reporting database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
