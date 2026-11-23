/**
 * Port slice 15 (Industrial 1.0 -> 2.0): Contractor Safety database contract checks.
 * Company checks (status, email, one name per company, sponsor must be a member, locations must be the
 * company's), documents (insurance needs an expiry, file columns together), workers stay with their company and
 * organization, one open visit per worker, a visit can only be signed out once, an override needs its problems,
 * permissions and grants, the private bucket, and no direct access for signed-in users.
 * Run: node apps/web/tests/port-s15-contractors-db.cjs
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

async function main() {
  if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) throw new Error('Set the Supabase URL and keys (see docs/LOCAL_DEVELOPMENT.md).')

  const user = await signIn('user@forge2.local')
  const companies = []
  const otherCompanies = []

  try {
    // Companies -------------------------------------------------------------------------------------
    const company = await insert('forge_contractor_companies', { organization_id: ORG, name: `S15 Delta Electric ${RUN}`, sponsor_user_id: ADMIN, location_ids: [LOCATION], created_by: ADMIN }, 'company')

    companies.push(company.id)
    assert.equal(company.status, 'pending', 'new companies start pending')

    await fails(rest('forge_contractor_companies', '', { method: 'POST', body: { organization_id: ORG, name: `s15 delta electric ${RUN}` } }), /duplicate|unique/, 'same name, any case')
    await fails(rest('forge_contractor_companies', '', { method: 'POST', body: { organization_id: ORG, name: `S15 bad ${RUN}`, status: 'banned' } }), /check/, 'unknown status')
    await fails(rest('forge_contractor_companies', '', { method: 'POST', body: { organization_id: ORG, name: `S15 bad ${RUN}`, contact_email: 'nope' } }), /check/, 'bad email')
    await fails(rest('forge_contractor_companies', '', { method: 'POST', body: { organization_id: ORG, name: `S15 bad ${RUN}`, sponsor_user_id: OUTSIDER } }), /sponsor/, 'sponsor from another company')
    await fails(rest('forge_contractor_companies', '', { method: 'POST', body: { organization_id: ORG, name: `S15 bad ${RUN}`, location_ids: [OTHER_LOCATION] } }), /one company/, "another company's location")
    await fails(rest('forge_contractor_companies', '', { method: 'POST', body: { organization_id: ORG, name: `S15 bad ${RUN}`, emr: 11 } }), /check/, 'EMR over 10')

    const archivedTwin = await insert('forge_contractor_companies', { organization_id: ORG, name: `S15 Twin ${RUN}`, archived_at: new Date().toISOString() }, 'archived twin')

    companies.push(archivedTwin.id)
    companies.push((await insert('forge_contractor_companies', { organization_id: ORG, name: `S15 Twin ${RUN}` }, 'name reuse after archive')).id)
    console.log('ok - company checks (status, email, unique name, sponsor, locations, EMR)')

    // Documents -------------------------------------------------------------------------------------
    await fails(rest('forge_contractor_documents', '', { method: 'POST', body: { organization_id: ORG, company_id: company.id, doc_type: 'general_liability' } }), /check|expir/i, 'insurance without expiry')
    await fails(rest('forge_contractor_documents', '', { method: 'POST', body: { organization_id: ORG, company_id: company.id, doc_type: 'other' } }), /check|title/i, 'other without a title')
    await fails(
      rest('forge_contractor_documents', '', { method: 'POST', body: { organization_id: ORG, company_id: company.id, doc_type: 'w9', file_name: 'w9.pdf' } }),
      /check|file/i,
      'file columns all or none'
    )
    await fails(
      rest('forge_contractor_documents', '', { method: 'POST', body: { organization_id: ORG, company_id: company.id, doc_type: 'w9', effective_on: '2026-05-01', expires_on: '2026-04-01' } }),
      /check|date/i,
      'expires before effective'
    )
    await fails(rest('forge_contractor_documents', '', { method: 'POST', body: { organization_id: OTHER_ORG, company_id: company.id, doc_type: 'w9' } }), /organization|company/i, 'document in another org')

    const document = await insert(
      'forge_contractor_documents',
      { organization_id: ORG, company_id: company.id, doc_type: 'general_liability', expires_on: '2030-01-01', file_name: 'coi.pdf', content_type: 'application/pdf', size_bytes: 1000, storage_path: `${ORG}/${company.id}/x` },
      'document'
    )

    assert.ok(document.id)
    console.log('ok - document checks (insurance expiry, titles, file columns, dates, one org)')

    // Workers and qualifications -------------------------------------------------------------------
    const worker = await insert('forge_contractor_workers', { organization_id: ORG, company_id: company.id, first_name: 'Sam', last_name: `Ortiz ${RUN}`, badge_number: `S15-${RUN}` }, 'worker')

    await fails(
      rest('forge_contractor_workers', '', { method: 'POST', body: { organization_id: ORG, company_id: company.id, first_name: 'Dup', last_name: 'Badge', badge_number: `S15-${RUN}` } }),
      /duplicate|unique/,
      'badge numbers are unique'
    )
    await fails(rest('forge_contractor_workers', '', { method: 'POST', body: { organization_id: OTHER_ORG, company_id: company.id, first_name: 'X', last_name: 'Y' } }), /organization|company/i, 'worker in another org')

    const second = await insert('forge_contractor_companies', { organization_id: ORG, name: `S15 Second ${RUN}` }, 'second company')

    companies.push(second.id)
    await fails(rest('forge_contractor_workers', 'id=eq.' + worker.id, { method: 'PATCH', body: { company_id: second.id } }), /company/i, 'a worker cannot change company')
    await insert('forge_contractor_qualifications', { organization_id: ORG, worker_id: worker.id, name: 'OSHA 10', expires_on: '2030-01-01', required: true }, 'qualification')
    await fails(rest('forge_contractor_qualifications', '', { method: 'POST', body: { organization_id: OTHER_ORG, worker_id: worker.id, name: 'X' } }), /one company/, 'qualification in another org')
    console.log('ok - worker checks (unique badge, one org, fixed company, qualifications)')

    // Visits ----------------------------------------------------------------------------------------
    const otherCompany = await insert('forge_contractor_companies', { organization_id: OTHER_ORG, name: `S15 Other ${RUN}` }, 'other-org company')

    otherCompanies.push(otherCompany.id)

    await fails(
      rest('forge_contractor_visits', '', { method: 'POST', body: { organization_id: ORG, worker_id: worker.id, company_id: second.id, location_id: LOCATION } }),
      /company/i,
      "visit company must be the worker's"
    )
    await fails(
      rest('forge_contractor_visits', '', { method: 'POST', body: { organization_id: ORG, worker_id: worker.id, company_id: company.id, location_id: OTHER_LOCATION } }),
      /one company/,
      "visit at another org's location"
    )
    await fails(
      rest('forge_contractor_visits', '', { method: 'POST', body: { organization_id: ORG, worker_id: worker.id, company_id: company.id, location_id: LOCATION, override_reason: 'x' } }),
      /check|override/i,
      'override reason needs its problems'
    )

    const visit = await insert(
      'forge_contractor_visits',
      { organization_id: ORG, worker_id: worker.id, company_id: company.id, location_id: LOCATION, signed_in_by: ADMIN, override_reason: 'Emergency repair', override_problems: [{ code: 'status_pending', message: 'Company is pending approval' }] },
      'visit'
    )

    await fails(rest('forge_contractor_visits', '', { method: 'POST', body: { organization_id: ORG, worker_id: worker.id, company_id: company.id, location_id: LOCATION } }), /duplicate|unique/, 'one open visit per worker')
    await fails(rest('forge_contractor_visits', 'id=eq.' + visit.id, { method: 'PATCH', body: { location_id: LOCATION, host_name: 'changed' } }), /sign/i, 'visit details are fixed')
    await ok(rest('forge_contractor_visits', 'id=eq.' + visit.id, { method: 'PATCH', body: { signed_out_at: new Date().toISOString(), signed_out_by: ADMIN } }), 'sign out')
    await fails(rest('forge_contractor_visits', 'id=eq.' + visit.id, { method: 'PATCH', body: { signed_out_at: new Date().toISOString() } }), /sign/i, 'sign out only once')
    await insert('forge_contractor_visits', { organization_id: ORG, worker_id: worker.id, company_id: company.id, location_id: LOCATION }, 'a new visit after sign-out')
    console.log('ok - visit checks (company, location, override, one open visit, sign out once)')

    // Settings --------------------------------------------------------------------------------------
    await fails(rest('forge_contractor_settings', '', { method: 'POST', body: { organization_id: OTHER_ORG, required_documents: ['bogus'] } }), /check|document/i, 'unknown required document')
    await fails(rest('forge_contractor_settings', '', { method: 'POST', body: { organization_id: OTHER_ORG, orientation_valid_months: 0 } }), /check/, 'orientation months')
    console.log('ok - settings checks')

    // No direct access ------------------------------------------------------------------------------
    for (const table of ['forge_contractor_settings', 'forge_contractor_companies', 'forge_contractor_documents', 'forge_contractor_workers', 'forge_contractor_qualifications', 'forge_contractor_visits']) {
      const result = await rest(table, 'select=*&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' is not readable by signed-in users')
    }

    const bucket = await ok(request('/storage/v1/bucket/forge-contractors'), 'bucket')

    assert.equal(bucket.public, false, 'the contractor bucket is private')
    console.log('ok - signed-in users have no direct table access; bucket is private')

    // Permissions -----------------------------------------------------------------------------------
    const permissions = await ok(rest('forge_permission_registry', 'feature_key=eq.contractor_safety&select=id,permission_key,danger_level,requires_confirmation'), 'permissions')
    const byKey = Object.fromEntries(permissions.map(row => [row.permission_key, row]))

    for (const key of ['contractor_safety.view', 'contractor_safety.sign_in', 'contractor_safety.manage', 'contractor_safety.approve', 'contractor_safety.settings']) assert.ok(byKey[key], key + ' registered')
    assert.equal(byKey['contractor_safety.approve'].danger_level, 'sensitive')

    const roles = await ok(rest('forge_tenant_roles', `organization_id=eq.${ORG}&select=id,role_key`), 'roles')
    const grants = await ok(rest('forge_tenant_role_permissions', `select=role_id,permission_id,scope&permission_id=in.(${permissions.map(row => row.id).join(',')})`), 'grants')
    const grantsFor = roleKey => {
      const role = roles.find(row => row.role_key === roleKey)

      return Object.fromEntries((role ? grants.filter(row => row.role_id === role.id) : []).map(row => [permissions.find(p => p.id === row.permission_id).permission_key, row.scope]))
    }

    assert.equal(grantsFor('company-administrator')['contractor_safety.approve'], 'organization')
    assert.equal(grantsFor('company-owner')['contractor_safety.settings'], 'organization')
    assert.equal(grantsFor('location-administrator')['contractor_safety.manage'], 'location')
    assert.equal(grantsFor('location-administrator')['contractor_safety.approve'], undefined, 'location admins do not approve')
    assert.equal(grantsFor('supervisor')['contractor_safety.sign_in'], 'location')
    assert.equal(grantsFor('supervisor')['contractor_safety.manage'], undefined)
    assert.equal(grantsFor('read-only')['contractor_safety.view'], 'organization')
    assert.equal(grantsFor('employee')['contractor_safety.view'], undefined, 'employees have no contractor access')
    console.log('ok - permissions are registered and granted by role')
  } finally {
    for (const id of companies) await rest('forge_contractor_companies', 'id=eq.' + id, { method: 'DELETE' })
    for (const id of otherCompanies) await rest('forge_contractor_companies', 'id=eq.' + id, { method: 'DELETE' })
  }

  console.log('\nport-s15 contractor database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
