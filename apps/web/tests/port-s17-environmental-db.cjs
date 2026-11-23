/**
 * Port slice 17 (Industrial 1.0 -> 2.0): Environmental Safety database contract checks.
 * Numbering, permit, obligation, event and manifest checks, one company for every link, append-only
 * obligation completions done once per occurrence, reportable events closed only with the agency notice,
 * closed events frozen until reopened, one record per manifest, permissions and grants, and no direct access
 * for signed-in users.
 * Run: node apps/web/tests/port-s17-environmental-db.cjs
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
const LOCATION = '20000000-0000-4000-8000-000000000300'
const OTHER_LOCATION = '40000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
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

const insert = (table, body, label) => ok(rest(table, '', { method: 'POST', body }), label).then(rows => rows[0])

const patch = (table, id, body) => rest(table, 'id=eq.' + id, { method: 'PATCH', body })

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error('Set the Supabase URL and keys (see docs/LOCAL_DEVELOPMENT.md).')

  const user = await signIn('user@forge2.local')
  const cleanup = []

  try {
    // Numbering -------------------------------------------------------------------------------------
    const first = await ok(rest('rpc/next_forge_env_number', '', { method: 'POST', body: { p_organization_id: ORG } }), 'number')
    const second = await ok(rest('rpc/next_forge_env_number', '', { method: 'POST', body: { p_organization_id: ORG } }), 'number')

    assert.match(first, /^ENV-\d{4}-\d{4,}$/)
    assert.equal(Number(second.slice(-4)), Number(first.slice(-4)) + 1)
    await fails(rest('rpc/next_forge_env_number', '', { method: 'POST', body: { p_organization_id: ORG }, token: user.access_token }), /permission|denied/i, 'signed-in users cannot number')
    console.log('ok - numbering')

    // Permits and obligations -----------------------------------------------------------------------
    const permitBase = { organization_id: ORG, title: `S17 air permit ${RUN}`, permit_type: 'air', agency: 'LDEQ', location_id: LOCATION }

    await fails(rest('forge_env_permits', '', { method: 'POST', body: { ...permitBase, status: 'active' } }), /forge_env_permits_number/, 'a permit in force needs its number')
    await fails(rest('forge_env_permits', '', { method: 'POST', body: { ...permitBase, status: 'pending', effective_on: '2026-01-01', expires_on: '2025-12-31' } }), /dates/, 'expiry after effective')
    await fails(rest('forge_env_permits', '', { method: 'POST', body: { ...permitBase, status: 'pending', location_id: OTHER_LOCATION } }), /one company/, 'location in the company')

    const permit = await insert('forge_env_permits', { ...permitBase, status: 'active', permit_number: 'TV-0042' }, 'permit')

    cleanup.push(['forge_env_permits', permit.id])

    const otherPermit = await insert('forge_env_permits', { ...permitBase, organization_id: OTHER_ORG, location_id: OTHER_LOCATION, status: 'pending' }, 'other permit')

    cleanup.push(['forge_env_permits', otherPermit.id])
    await fails(patch('forge_env_permits', permit.id, { organization_id: OTHER_ORG }), /another company/, 'company is fixed')

    const obligationBase = { organization_id: ORG, location_id: LOCATION, title: 'Quarterly DMR', obligation_type: 'report', frequency: 'quarterly' }

    await fails(rest('forge_env_obligations', '', { method: 'POST', body: obligationBase }), /forge_env_obligations_due/, 'active needs a due date')
    await fails(rest('forge_env_obligations', '', { method: 'POST', body: { ...obligationBase, next_due_on: '2026-12-31', frequency: 'daily' } }), /check/, 'frequency from the list')
    await fails(rest('forge_env_obligations', '', { method: 'POST', body: { ...obligationBase, next_due_on: '2026-12-31', permit_id: otherPermit.id } }), /one company/, 'permit in the company')
    await fails(rest('forge_env_obligations', '', { method: 'POST', body: { ...obligationBase, next_due_on: '2026-12-31', owner_user_id: OUTSIDER } }), /active member/, 'owner is a member')

    const obligation = await insert('forge_env_obligations', { ...obligationBase, next_due_on: '2026-12-31', permit_id: permit.id, owner_user_id: ADMIN }, 'obligation')
    const completion = await insert('forge_env_obligation_completions', { organization_id: ORG, obligation_id: obligation.id, due_on: '2026-12-31', completed_on: '2026-11-20', result: 'done' }, 'completion')

    await fails(rest('forge_env_obligation_completions', '', { method: 'POST', body: { organization_id: ORG, obligation_id: obligation.id, due_on: '2026-12-31', completed_on: '2026-11-20', result: 'done' } }), /forge_env_completions_once/, 'each occurrence once')
    await fails(rest('forge_env_obligation_completions', '', { method: 'POST', body: { organization_id: ORG, obligation_id: obligation.id, due_on: '2027-03-31', completed_on: '2026-11-20', result: 'issue' } }), /issue/, 'a problem needs a note')
    await fails(patch('forge_env_obligation_completions', completion.id, { notes: 'Changed' }), /can.t be changed/, 'completions are append-only')
    console.log('ok - permits and obligations')

    // Events ----------------------------------------------------------------------------------------
    const eventBase = { organization_id: ORG, event_type: 'spill_release', occurred_at: '2026-11-20T09:30:00Z', location_id: LOCATION, substance: 'Diesel', media: ['soil'], description: 'Tank overfill', reported_by: ADMIN }

    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first, substance: null } }), /forge_env_events_spill/, 'a spill names the substance')
    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first, quantity: 15 } }), /forge_env_events_quantity/, 'quantity needs a unit')
    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first, media: ['moon'] } }), /check/, 'media from the list')
    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first, agency_notified_at: '2026-11-20T10:00:00Z' } }), /forge_env_events_notice/, 'notice names the agency')
    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first, agency_name: 'NRC', agency_notified_at: '2026-11-20T08:00:00Z' } }), /forge_env_events_notice/, 'notice after the event')
    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first, permit_id: otherPermit.id } }), /one company/, 'permit in the company')

    const event = await insert('forge_env_events', { ...eventBase, event_number: first, quantity: 15, unit: 'gal', reportable: true }, 'event')

    cleanup.unshift(['forge_env_events', event.id])
    await fails(rest('forge_env_events', '', { method: 'POST', body: { ...eventBase, event_number: first } }), /duplicate|unique/, 'one number per company')
    await fails(patch('forge_env_events', event.id, { event_number: second }), /number can.t change/, 'number is fixed')
    await fails(patch('forge_env_events', event.id, { status: 'closed', closed_at: new Date().toISOString() }), /forge_env_events_reported/, 'reportable needs the notice before closing')

    const action = await insert('forge_env_event_actions', { organization_id: ORG, event_id: event.id, title: 'Excavate soil' }, 'action')

    await fails(rest('forge_env_event_actions', '', { method: 'POST', body: { organization_id: OTHER_ORG, event_id: event.id, title: 'Wrong org' } }), /one company/, 'action in the company')
    await fails(patch('forge_env_event_actions', action.id, { removed_at: new Date().toISOString() }), /removed/, 'removal needs a reason')

    await ok(patch('forge_env_events', event.id, { agency_name: 'NRC', agency_notified_at: '2026-11-20T10:00:00Z' }), 'agency notice')
    await ok(patch('forge_env_events', event.id, { status: 'closed', closed_at: new Date().toISOString() }), 'close')
    await fails(patch('forge_env_events', event.id, { description: 'Changed later' }), /Reopen it first/, 'closed events are frozen')
    await ok(patch('forge_env_events', event.id, { reported_by: null }), 'a deleted reporter can still be cleared')
    await ok(patch('forge_env_events', event.id, { status: 'open', closed_at: null }), 'reopen')
    console.log('ok - events')

    // Waste shipments -------------------------------------------------------------------------------
    const manifest = String(RUN).padStart(9, '0').slice(-9) + 'JJK'
    const shipmentBase = { organization_id: ORG, manifest_number: manifest, location_id: LOCATION, shipped_on: '2026-10-01', generator_status: 'lqg', waste_description: 'Spent solvent', waste_codes: ['F005'], quantity: 4, unit: 'drums', transporter: 'Gulf Haulers', facility: 'Clean Earth' }

    await fails(rest('forge_env_waste_shipments', '', { method: 'POST', body: { ...shipmentBase, manifest_number: '12345JJK' } }), /check/, 'manifest number format')
    await fails(rest('forge_env_waste_shipments', '', { method: 'POST', body: { ...shipmentBase, return_received_on: '2026-09-30' } }), /forge_env_waste_dates/, 'copy after shipping')
    await fails(rest('forge_env_waste_shipments', '', { method: 'POST', body: { ...shipmentBase, quantity: 0 } }), /check/, 'quantity above zero')

    const shipment = await insert('forge_env_waste_shipments', shipmentBase, 'shipment')

    cleanup.push(['forge_env_waste_shipments', shipment.id])
    await fails(rest('forge_env_waste_shipments', '', { method: 'POST', body: shipmentBase }), /forge_env_waste_manifest_unique/, 'manifest used once')
    console.log('ok - waste shipments')

    // Access ----------------------------------------------------------------------------------------
    for (const table of ['forge_env_sequences', 'forge_env_permits', 'forge_env_obligations', 'forge_env_obligation_completions', 'forge_env_events', 'forge_env_event_actions', 'forge_env_waste_shipments']) {
      const result = await rest(table, 'select=*&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' is not readable by signed-in users')
    }

    console.log('ok - signed-in users have no direct table access')

    // Permissions -----------------------------------------------------------------------------------
    const permissions = await ok(rest('forge_permission_registry', 'feature_key=eq.environmental&select=id,permission_key'), 'permissions')

    for (const key of ['environmental.view', 'environmental.report', 'environmental.manage']) assert.ok(permissions.some(row => row.permission_key === key), key + ' registered')

    const roles = await ok(rest('forge_tenant_roles', `organization_id=eq.${ORG}&select=id,role_key`), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id,scope&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const grantsFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return Object.fromEntries((role ? grants.filter(row => row.role_id === role.id) : []).map(row => [permissions.find(p => p.id === row.permission_id).permission_key, row.scope]))
    }

    assert.equal(grantsFor('company-owner')['environmental.manage'], 'organization')
    assert.equal(grantsFor('location-administrator')['environmental.manage'], 'location')
    assert.equal(grantsFor('supervisor')['environmental.report'], 'location')
    assert.equal(grantsFor('supervisor')['environmental.manage'], undefined)
    assert.equal(grantsFor('read-only')['environmental.view'], 'organization')
    assert.equal(grantsFor('employee')['environmental.view'], undefined, 'employees have no environmental access')
    console.log('ok - permissions are registered and granted by role')
  } finally {
    for (const [table, id] of cleanup) await rest(table, 'id=eq.' + id, { method: 'DELETE' })
  }

  console.log('\nport-s17 environmental database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
