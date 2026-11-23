/**
 * Port slice 16 (Industrial 1.0 -> 2.0): Process Safety database contract checks.
 * Numbering, change checks (temporary needs a date, step timestamps match status, PSSR before implementing),
 * one company for every link, approvers are members and decided only in review, closed changes are frozen,
 * history can't be edited, PHA revalidation within five years, actions belong to exactly one parent,
 * permissions and grants, and no direct access for signed-in users.
 * Run: node apps/web/tests/port-s16-process-safety-db.cjs
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

const USER = '20000000-0000-4000-8000-000000000002'

const patch = (table, id, body) => rest(table, 'id=eq.' + id, { method: 'PATCH', body })

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error('Set the Supabase URL and keys (see docs/LOCAL_DEVELOPMENT.md).')

  const user = await signIn('user@forge2.local')
  const cleanup = []

  try {
    // Numbering -------------------------------------------------------------------------------------
    const first = await ok(rest('rpc/next_forge_psm_number', '', { method: 'POST', body: { p_organization_id: ORG, p_kind: 'moc' } }), 'number')
    const second = await ok(rest('rpc/next_forge_psm_number', '', { method: 'POST', body: { p_organization_id: ORG, p_kind: 'moc' } }), 'number')

    assert.match(first, /^MOC-\d{4}-\d{4,}$/)
    assert.equal(Number(second.slice(-4)), Number(first.slice(-4)) + 1, 'numbers go up by one')
    await fails(rest('rpc/next_forge_psm_number', '', { method: 'POST', body: { p_organization_id: ORG, p_kind: 'xyz' } }), /Unknown/, 'unknown kind')
    await fails(rest('rpc/next_forge_psm_number', '', { method: 'POST', body: { p_organization_id: ORG, p_kind: 'moc' }, token: user.access_token }), /permission|denied/i, 'signed-in users cannot number')
    console.log('ok - numbering')

    // Changes ---------------------------------------------------------------------------------------
    const base = { organization_id: ORG, title: `S16 raise setpoint ${RUN}`, change_type: 'process', location_id: LOCATION, description: 'Raise to 180 C', reason: 'Throughput', risk_level: 'high', owner_user_id: ADMIN, created_by: ADMIN }
    const moc = await insert('forge_moc_changes', { ...base, moc_number: first }, 'moc')

    cleanup.push(['forge_moc_changes', moc.id])
    assert.equal(moc.status, 'draft')
    await fails(rest('forge_moc_changes', '', { method: 'POST', body: { ...base, moc_number: first } }), /duplicate|unique/, 'one number per company')
    await fails(rest('forge_moc_changes', '', { method: 'POST', body: { ...base, moc_number: 'MOC-1' } }), /check/, 'number format')
    await fails(rest('forge_moc_changes', '', { method: 'POST', body: { ...base, moc_number: second, is_temporary: true } }), /temporary/, 'temporary needs a date')
    await fails(rest('forge_moc_changes', '', { method: 'POST', body: { ...base, moc_number: second, impacts: ['bogus'] } }), /impacts|check/, 'impacts from the list')
    await fails(rest('forge_moc_changes', '', { method: 'POST', body: { ...base, moc_number: second, location_id: OTHER_LOCATION } }), /one company/, 'location in the company')
    await fails(rest('forge_moc_changes', '', { method: 'POST', body: { ...base, moc_number: second, owner_user_id: OUTSIDER } }), /active member/, 'owner is a member')
    await fails(patch('forge_moc_changes', moc.id, { moc_number: second }), /can.t change/, 'number is fixed')
    await fails(patch('forge_moc_changes', moc.id, { status: 'implemented' }), /implemented/, 'implemented needs its timestamp')
    await fails(patch('forge_moc_changes', moc.id, { status: 'implemented', implemented_at: new Date().toISOString() }), /startup_review/, 'implementing needs the PSSR')
    await fails(patch('forge_moc_changes', moc.id, { status: 'canceled', canceled_at: new Date().toISOString() }), /canceled/, 'canceling needs a reason')
    console.log('ok - change checks')

    // Approvals -------------------------------------------------------------------------------------
    const approval = await insert('forge_moc_approvals', { organization_id: ORG, moc_id: moc.id, approver_user_id: USER, role_label: 'Operations' }, 'approval')

    await fails(rest('forge_moc_approvals', '', { method: 'POST', body: { organization_id: ORG, moc_id: moc.id, approver_user_id: OUTSIDER } }), /active members/, 'approvers are members')
    await fails(rest('forge_moc_approvals', '', { method: 'POST', body: { organization_id: OTHER_ORG, moc_id: moc.id, approver_user_id: OUTSIDER } }), /one company/, 'same company')
    await fails(patch('forge_moc_approvals', approval.id, { decision: 'approved', decided_at: new Date().toISOString() }), /in review/, 'no decision while draft')
    await ok(patch('forge_moc_changes', moc.id, { status: 'in_review', submitted_at: new Date().toISOString() }), 'submit')
    await fails(rest('forge_moc_approvals', '', { method: 'POST', body: { organization_id: ORG, moc_id: moc.id, approver_user_id: ADMIN } }), /before the change is submitted/, 'approvers fixed in review')
    await fails(patch('forge_moc_approvals', approval.id, { decision: 'rejected', decided_at: new Date().toISOString() }), /reject_reason/, 'a rejection needs a comment')
    await ok(patch('forge_moc_approvals', approval.id, { decision: 'approved', decided_at: new Date().toISOString() }), 'approve')
    await fails(patch('forge_moc_approvals', approval.id, { approver_user_id: ADMIN }), /one approver/, 'approver is fixed')
    await ok(patch('forge_moc_changes', moc.id, { status: 'approved', approved_at: new Date().toISOString() }), 'approved')
    console.log('ok - approvals')

    // Documents, actions and history ----------------------------------------------------------------
    const document = await insert('forge_documents', { organization_id: ORG, document_number: `S16-${RUN}`, name: 'Reactor P&ID' }, 'document')
    const otherDocument = await insert('forge_documents', { organization_id: OTHER_ORG, document_number: `S16-${RUN}`, name: 'Other P&ID' }, 'other document')

    cleanup.push(['forge_documents', document.id], ['forge_documents', otherDocument.id])
    await insert('forge_moc_documents', { organization_id: ORG, moc_id: moc.id, document_id: document.id }, 'link')
    await fails(rest('forge_moc_documents', '', { method: 'POST', body: { organization_id: ORG, moc_id: moc.id, document_id: document.id } }), /duplicate|unique/, 'linked once')
    await fails(rest('forge_moc_documents', '', { method: 'POST', body: { organization_id: ORG, moc_id: moc.id, document_id: otherDocument.id } }), /one company/, 'document in the company')

    await fails(rest('forge_psm_actions', '', { method: 'POST', body: { organization_id: ORG, moc_id: moc.id, title: 'No phase' } }), /phase/, 'MOC actions need a phase')
    await fails(rest('forge_psm_actions', '', { method: 'POST', body: { organization_id: ORG, title: 'No parent', phase: 'before_startup' } }), /parent|one company/, 'one parent')

    const action = await insert('forge_psm_actions', { organization_id: ORG, moc_id: moc.id, title: 'Update P&ID', phase: 'before_startup' }, 'action')

    await fails(rest('forge_psm_actions', '', { method: 'POST', body: { organization_id: OTHER_ORG, moc_id: moc.id, title: 'Wrong org', phase: 'after_startup' } }), /one company/, 'action in the company')
    await fails(patch('forge_psm_actions', action.id, { removed_at: new Date().toISOString() }), /removed/, 'removal needs a reason')

    const note = await insert('forge_psm_activity', { organization_id: ORG, moc_id: moc.id, activity_type: 'note', message: 'Test entry' }, 'activity')

    await fails(patch('forge_psm_activity', note.id, { message: 'Changed' }), /history can.t be changed/, 'history is append-only')
    console.log('ok - documents, actions and history')

    // Through to closed, then frozen ----------------------------------------------------------------
    const now = new Date().toISOString()

    await ok(patch('forge_moc_changes', moc.id, { pssr_answers: { built_per_design: { answer: 'yes', note: null } }, pssr_completed_at: now }), 'pssr')
    await ok(patch('forge_moc_changes', moc.id, { status: 'implemented', implemented_at: now }), 'implemented')
    await ok(patch('forge_moc_changes', moc.id, { status: 'closed', closed_at: now }), 'closed')
    await fails(patch('forge_moc_changes', moc.id, { title: 'Changed later' }), /closed or canceled/, 'closed changes are frozen')
    await ok(patch('forge_moc_changes', moc.id, { owner_user_id: null }), 'a deleted owner can still be cleared on a closed change')

    const organizational = await insert('forge_moc_changes', { ...base, moc_number: second, change_type: 'organizational', requires_pssr: false }, 'organizational moc')

    cleanup.push(['forge_moc_changes', organizational.id])
    await fails(patch('forge_moc_changes', organizational.id, { pssr_answers: {}, pssr_completed_at: now }), /pssr_needed/, 'no PSSR when not needed')
    console.log('ok - closing and freezing')

    // Hazard analyses -------------------------------------------------------------------------------
    const phaNumber = await ok(rest('rpc/next_forge_psm_number', '', { method: 'POST', body: { p_organization_id: ORG, p_kind: 'pha' } }), 'pha number')
    const phaBase = { organization_id: ORG, pha_number: phaNumber, title: 'Unit 2 HAZOP', process_unit: 'Unit 2 reactor', location_id: LOCATION, method: 'hazop', moc_id: moc.id }

    assert.match(phaNumber, /^PHA-\d{4}-\d{4,}$/)
    await fails(rest('forge_pha_studies', '', { method: 'POST', body: { ...phaBase, status: 'completed' } }), /completed/, 'completed needs a date')
    await fails(rest('forge_pha_studies', '', { method: 'POST', body: { ...phaBase, status: 'completed', completed_on: '2026-06-01', revalidate_by: '2031-06-02' } }), /revalidation/, 'within five years')
    await fails(rest('forge_pha_studies', '', { method: 'POST', body: { ...phaBase, status: 'planned', revalidate_by: '2030-01-01' } }), /revalidation/, 'no revalidation date before completion')

    const pha = await insert('forge_pha_studies', { ...phaBase, status: 'completed', completed_on: '2026-06-01', revalidate_by: '2031-06-01' }, 'pha')

    cleanup.unshift(['forge_pha_studies', pha.id])
    await fails(patch('forge_pha_studies', pha.id, { pha_number: 'PHA-2026-9999' }), /can.t change/, 'PHA number is fixed')
    await fails(rest('forge_psm_actions', '', { method: 'POST', body: { organization_id: ORG, pha_id: pha.id, title: 'With phase', phase: 'before_startup' } }), /phase/, 'PHA recommendations have no phase')
    await insert('forge_psm_actions', { organization_id: ORG, pha_id: pha.id, title: 'Add high-temp alarm' }, 'recommendation')
    console.log('ok - hazard analyses')

    // Access ----------------------------------------------------------------------------------------
    for (const table of ['forge_psm_sequences', 'forge_moc_changes', 'forge_moc_approvals', 'forge_moc_documents', 'forge_pha_studies', 'forge_psm_actions', 'forge_psm_activity']) {
      const result = await rest(table, 'select=*&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' is not readable by signed-in users')
    }

    console.log('ok - signed-in users have no direct table access')

    // Permissions -----------------------------------------------------------------------------------
    const permissions = await ok(rest('forge_permission_registry', 'feature_key=eq.process_safety&select=id,permission_key,danger_level'), 'permissions')
    const byKey = Object.fromEntries(permissions.map(row => [row.permission_key, row]))

    for (const key of ['process_safety.view', 'process_safety.manage', 'process_safety.approve', 'process_safety.pssr']) assert.ok(byKey[key], key + ' registered')
    assert.equal(byKey['process_safety.approve'].danger_level, 'sensitive')

    const roles = await ok(rest('forge_tenant_roles', `organization_id=eq.${ORG}&select=id,role_key`), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id,scope&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const grantsFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return Object.fromEntries((role ? grants.filter(row => row.role_id === role.id) : []).map(row => [permissions.find(p => p.id === row.permission_id).permission_key, row.scope]))
    }

    assert.equal(grantsFor('company-administrator')['process_safety.approve'], 'organization')
    assert.equal(grantsFor('company-owner')['process_safety.pssr'], 'organization')
    assert.equal(grantsFor('location-administrator')['process_safety.manage'], 'location')
    assert.equal(grantsFor('supervisor')['process_safety.view'], 'location')
    assert.equal(grantsFor('supervisor')['process_safety.manage'], undefined)
    assert.equal(grantsFor('read-only')['process_safety.view'], 'organization')
    assert.equal(grantsFor('employee')['process_safety.view'], undefined, 'employees have no process safety access')
    console.log('ok - permissions are registered and granted by role')

  } finally {
    for (const [table, id] of cleanup) await rest(table, 'id=eq.' + id, { method: 'DELETE' })
  }

  console.log('\nport-s16 process safety database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
