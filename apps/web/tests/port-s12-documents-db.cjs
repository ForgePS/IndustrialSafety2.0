/**
 * Port slice 12 (Industrial 1.0 -> 2.0): Document Control database contract checks.
 * Workflow functions, version immutability, self-approval block, one version in review, acknowledgment of the
 * current version only, distribution matching, review dates, and no direct access for signed-in users.
 * Run: node apps/web/tests/port-s12-documents-db.cjs
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
const rpc = (name, body) => request('/rest/v1/rpc/' + name, { method: 'POST', body })

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

async function main() {
  const admin = await signIn('admin@forge2.local')
  const user = await signIn('user@forge2.local')
  const adminId = admin.user.id
  const userId = user.user.id
  const created = []

  const addVersion = async (documentId, number) =>
    (
      await ok(
        rest('forge_document_versions', '', {
          method: 'POST',
          body: {
            organization_id: ORG,
            document_id: documentId,
            version_number: number,
            file_name: `v${number}.pdf`,
            content_type: 'application/pdf',
            size_bytes: 100,
            storage_path: `${ORG}/${documentId}/v${number}`,
            created_by: adminId
          }
        }),
        'insert version ' + number
      )
    )[0]

  try {
    const number = await ok(rpc('next_forge_document_number', { p_organization_id: ORG }), 'next number')

    assert.match(number, /^DOC-\d{6}$/)

    const doc = (
      await ok(
        rest('forge_documents', '', {
          method: 'POST',
          body: { organization_id: ORG, document_number: `s12db-${RUN}`, name: `  S12 DB policy ${RUN} `, category: ' EHS   Policies ', review_interval_months: 12, created_by: adminId }
        }),
        'insert document'
      )
    )[0]

    created.push(doc.id)
    assert.equal(doc.name, `S12 DB policy ${RUN}`)
    assert.equal(doc.document_number, `S12DB-${RUN}`)
    assert.equal(doc.category, 'EHS Policies')
    assert.equal(doc.status, 'draft')
    console.log('ok - new document is a trimmed draft with an upper-case number')

    await fails(
      rest('forge_documents', '', { method: 'POST', body: { organization_id: ORG, document_number: `s12db-${RUN}`, name: 'Duplicate' } }),
      /duplicate|unique/i,
      'duplicate number'
    )
    await fails(rest('forge_documents', 'id=eq.' + doc.id, { method: 'PATCH', body: { status: 'published' } }), /workflow/, 'direct status change')
    console.log('ok - numbers are unique and status only changes through the workflow')

    const v1 = await addVersion(doc.id, 1)

    await fails(rest('forge_document_versions', 'id=eq.' + v1.id, { method: 'PATCH', body: { status: 'approved' } }), /workflow/, 'direct version status')
    await ok(rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: adminId }), 'submit v1')
    await fails(rest('forge_document_versions', 'id=eq.' + v1.id, { method: 'PATCH', body: { file_name: 'other.pdf' } }), /can't be changed/, 'edit submitted file')
    await fails(rest('forge_document_versions', 'id=eq.' + v1.id, { method: 'DELETE' }), /Only draft/, 'delete submitted version')
    console.log('ok - a submitted version is locked')

    const v1b = await addVersion(doc.id, 2)

    await fails(rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v1b.id, p_actor_user_id: adminId }), /already in review/, 'second in review')
    await ok(rest('forge_document_versions', 'id=eq.' + v1b.id, { method: 'DELETE' }), 'delete draft version')
    console.log('ok - only one version can be in review, and drafts can be deleted')

    await fails(
      rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: adminId, p_effective_on: null, p_note: null }),
      /Someone other than/,
      'self approval'
    )
    await fails(rpc('forge_document_reject_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: userId, p_reason: '  ' }), /reason/, 'reject without reason')
    await ok(rpc('forge_document_reject_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: userId, p_reason: 'Fix section 2' }), 'reject')

    let [state] = await ok(rest('forge_document_versions', 'id=eq.' + v1.id + '&select=status,rejection_reason,submitted_by'), 'read v1')

    assert.equal(state.status, 'draft')
    assert.equal(state.rejection_reason, 'Fix section 2')
    console.log('ok - the submitter cannot approve, and sending back needs a reason')

    await ok(rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: adminId }), 'resubmit v1')
    await ok(
      rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: userId, p_effective_on: '2026-01-31', p_note: 'Looks good' }),
      'approve v1'
    )

    let [current] = await ok(rest('forge_documents', 'id=eq.' + doc.id + '&select=status,current_version_id,review_due_on,last_reviewed_on'), 'read doc')

    assert.equal(current.status, 'published')
    assert.equal(current.current_version_id, v1.id)
    assert.equal(current.review_due_on, '2027-01-31')
    assert.equal(current.last_reviewed_on, '2026-01-31')
    console.log('ok - approval publishes the version and sets the next review date')

    assert.equal(await ok(rpc('forge_document_reaches_user', { p_document_id: doc.id, p_user_id: userId }), 'reaches'), true)
    await ok(rest('forge_document_acknowledgments', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, version_id: v1.id, user_id: userId } }), 'ack v1')
    await fails(
      rest('forge_document_acknowledgments', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, version_id: v1.id, user_id: userId } }),
      /duplicate|unique/i,
      'double ack'
    )

    const v2 = await addVersion(doc.id, 3)

    await ok(rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: adminId }), 'submit v2')

    ;[current] = await ok(rest('forge_documents', 'id=eq.' + doc.id + '&select=status'), 'read doc')
    assert.equal(current.status, 'in_review')
    await ok(rpc('forge_document_withdraw_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: adminId }), 'withdraw v2')
    ;[current] = await ok(rest('forge_documents', 'id=eq.' + doc.id + '&select=status'), 'read doc')
    assert.equal(current.status, 'published')
    console.log('ok - withdrawing returns a published document to published')

    await ok(rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: adminId }), 'resubmit v2')
    await ok(rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: userId, p_effective_on: null, p_note: null }), 'approve v2')

    const versions = await ok(rest('forge_document_versions', 'document_id=eq.' + doc.id + '&select=version_number,status&order=version_number'), 'versions')

    assert.deepEqual(
      versions.map(row => row.status),
      ['superseded', 'approved']
    )
    await fails(
      rest('forge_document_acknowledgments', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, version_id: v1.id, user_id: adminId } }),
      /current published version/,
      'ack superseded'
    )
    await fails(rest('forge_document_acknowledgments', 'version_id=eq.' + v1.id, { method: 'PATCH', body: { acknowledged_at: '2020-01-01' } }), /can't be changed/, 'edit ack')
    console.log('ok - a new approval supersedes the old version, and only the current one can be acknowledged')

    // Distribution: a location the user isn't at hides it from them; "organization" brings it back.
    const [location] = await ok(rest('locations', 'organization_id=eq.' + ORG + '&select=id&limit=1'), 'location')
    const [personnel] = await ok(rest('forge_personnel', 'organization_id=eq.' + ORG + '&auth_user_id=eq.' + userId + '&select=location_id'), 'personnel')
    const [access] = await ok(rest('forge_tenant_user_location_access', 'organization_id=eq.' + ORG + '&user_id=eq.' + userId + '&location_id=eq.' + location.id + '&select=location_id'), 'access')
    const userAtLocation = (personnel && personnel.location_id === location.id) || Boolean(access)

    await ok(rest('forge_document_distributions', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, scope_type: 'location', scope_id: location.id } }), 'distribute')
    assert.equal(await ok(rpc('forge_document_reaches_user', { p_document_id: doc.id, p_user_id: userId }), 'reaches location'), userAtLocation)
    await fails(
      rest('forge_document_distributions', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, scope_type: 'location', scope_id: '00000000-0000-4000-8000-00000000dead' } }),
      /not in this organization/,
      'foreign location'
    )
    await fails(rest('forge_document_distributions', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, scope_type: 'organization', scope_id: location.id } }), /check|violat/i, 'org with id')
    await ok(rest('forge_document_distributions', '', { method: 'POST', body: { organization_id: ORG, document_id: doc.id, scope_type: 'organization', scope_id: null } }), 'distribute all')
    assert.equal(await ok(rpc('forge_document_reaches_user', { p_document_id: doc.id, p_user_id: userId }), 'reaches all'), true)
    console.log('ok - distribution rules decide who a document reaches')

    const next = await ok(rpc('forge_document_confirm_review', { p_organization_id: ORG, p_document_id: doc.id, p_actor_user_id: adminId, p_note: 'No changes' }), 'confirm review')

    assert.match(next, /^\d{4}-\d{2}-\d{2}$/)
    ;[current] = await ok(rest('forge_documents', 'id=eq.' + doc.id + '&select=review_due_on,last_reviewed_by'), 'read doc')
    assert.equal(current.review_due_on, next)
    assert.equal(current.last_reviewed_by, adminId)
    console.log('ok - confirming a review moves the review date')

    await fails(rpc('forge_document_mark_obsolete', { p_organization_id: ORG, p_document_id: doc.id, p_actor_user_id: userId, p_reason: '' }), /reason/, 'obsolete without reason')
    await ok(rpc('forge_document_mark_obsolete', { p_organization_id: ORG, p_document_id: doc.id, p_actor_user_id: userId, p_reason: 'Replaced' }), 'obsolete')
    await fails(rest('forge_documents', 'id=eq.' + doc.id, { method: 'PATCH', body: { name: 'Renamed' } }), /obsolete/, 'edit obsolete')
    await fails(
      rest('forge_document_versions', '', {
        method: 'POST',
        body: { organization_id: ORG, document_id: doc.id, version_number: 4, file_name: 'v4.pdf', content_type: 'application/pdf', size_bytes: 100, storage_path: 'x' }
      }),
      /active document/,
      'version on obsolete'
    )
    await fails(rpc('forge_document_confirm_review', { p_organization_id: ORG, p_document_id: doc.id, p_actor_user_id: adminId, p_note: null }), /published/, 'review obsolete')
    await ok(rpc('forge_document_archive', { p_organization_id: ORG, p_document_id: doc.id, p_actor_user_id: adminId, p_archive: true }), 'archive')
    await ok(rpc('forge_document_archive', { p_organization_id: ORG, p_document_id: doc.id, p_actor_user_id: adminId, p_archive: false }), 'restore')
    console.log('ok - obsolete documents are locked; archive and restore work')

    const activity = await ok(rest('forge_document_activity', 'document_id=eq.' + doc.id + '&select=activity_type&order=created_at'), 'activity')

    assert.deepEqual(
      activity.map(row => row.activity_type),
      ['submitted', 'rejected', 'submitted', 'approved', 'submitted', 'withdrawn', 'submitted', 'approved', 'reviewed', 'obsoleted', 'archived', 'restored']
    )
    console.log('ok - every workflow step is in the history')

    for (const table of ['forge_documents', 'forge_document_versions', 'forge_document_acknowledgments', 'forge_document_distributions']) {
      const result = await rest(table, 'select=id&limit=1', { token: user.access_token })

      assert.ok(result.status >= 400 || (Array.isArray(result.data) && result.data.length === 0), table + ' readable by a signed-in user')
    }

    await fails(request('/rest/v1/rpc/forge_document_submit_version', { method: 'POST', token: admin.access_token, body: { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: adminId } }), /permission|not found|denied/i, 'rpc as user')
    console.log('ok - signed-in users have no direct table or function access')

    const [bucket] = await ok(request('/storage/v1/bucket/forge-documents'), 'bucket').then(data => [data])

    assert.equal(bucket.public, false)
    console.log('ok - the forge-documents bucket is private')
  } finally {
    for (const id of created) await rest('forge_documents', 'id=eq.' + id, { method: 'DELETE' })
  }

  console.log('\nport-s12 document database checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
