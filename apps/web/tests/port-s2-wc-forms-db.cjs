/**
 * Workers' comp case forms: database contract checks (tenant guards, signing, immutability, voiding,
 * template replacement, append-only history, service-role-only access).
 * Run: node apps/web/tests/port-s2-wc-forms-db.cjs
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
let ORG = null
const ADMIN_USER = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString().slice(-7)
const SHA = 'a'.repeat(64)

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
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error((data && data.message) || String(response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, code) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    console.log('  ok - ' + message)
    return
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

const rpc = (name, body, options = {}) => request('/rest/v1/rpc/' + name, { method: 'POST', body, token: options.token })

async function main() {
  console.log('Workers\' comp case forms DB checks')
  const created = { orgs: [], cases: [] }

  // Everything lives in a throwaway company, so deleting it at the end also proves tenant deletion cascades cleanly.
  const [formsOrg] = await request('/rest/v1/organizations', {
    method: 'POST',
    body: { name: 'WC Forms ' + RUN, slug: 'wc-forms-' + RUN, status: 'active', created_by: ADMIN_USER }
  })
  ORG = formsOrg.id
  created.orgs.push(formsOrg.id)

  const [otherOrg] = await request('/rest/v1/organizations', {
    method: 'POST',
    body: { name: 'WC Forms Other ' + RUN, slug: 'wc-forms-other-' + RUN, status: 'active', created_by: ADMIN_USER }
  })
  created.orgs.push(otherOrg.id)

  const newCase = async (overrides = {}) => {
    const [row] = await request('/rest/v1/forge_wc_cases', {
      method: 'POST',
      body: {
        organization_id: ORG, case_number: `WCF-${RUN}-${created.cases.length + 1}`, employee_name: `Forms Test ${RUN}`,
        injury_date: '2026-10-01', reported_date: '2026-10-01', stage: 'intake', created_by: ADMIN_USER, updated_by: ADMIN_USER, ...overrides
      }
    })
    created.cases.push(row.id)
    return row
  }

  try {
    const wc = await newCase()

    // Templates: one active per form per company; replacing keeps old forms on their original template.
    const replace = (formKey, suffix) =>
      rpc('forge_replace_wc_form_template', {
        p_organization_id: ORG, p_form_key: formKey, p_title: 'HIPAA Authorization', p_storage_path: `${ORG}/templates/${formKey}-${RUN}-${suffix}.pdf`,
        p_file_name: 'form.pdf', p_size_bytes: 1000, p_sha256: SHA, p_page_count: 1, p_actor_user_id: ADMIN_USER
      })
    const hipaaV1 = await replace('hipaa_authorization', 'v1')
    await expectFailure(
      rpc('forge_replace_wc_form_template', {
        p_organization_id: ORG, p_form_key: 'hipaa_authorization', p_title: 'X', p_storage_path: `${otherOrg.id}/templates/x.pdf`,
        p_file_name: 'x.pdf', p_size_bytes: 10, p_sha256: SHA, p_page_count: 1, p_actor_user_id: ADMIN_USER
      }),
      'a template file must live under the company\'s own folder',
      '23514'
    )
    await expectFailure(
      request('/rest/v1/forge_wc_form_templates', { method: 'POST', body: { organization_id: ORG, form_key: 'hipaa_authorization', title: 'Dup', storage_path: 'x', file_name: 'x.pdf', size_bytes: 1, sha256: SHA, page_count: 1 } }),
      'only one active template per form',
      '23505'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_form_templates?id=eq.${hipaaV1.id}`, { method: 'PATCH', body: { storage_path: `${ORG}/templates/other.pdf` } }),
      'a template file cannot be swapped in place',
      '42501'
    )
    await expectFailure(
      request('/rest/v1/forge_wc_form_templates', { method: 'POST', body: { organization_id: ORG, form_key: 'injury_guidelines_ack', title: 'Big', storage_path: 'x', file_name: 'x.pdf', size_bytes: 6000000, sha256: SHA, page_count: 1 } }),
      'templates are capped at 5 MB',
      '23514'
    )
    const [otherTemplate] = await request('/rest/v1/forge_wc_form_templates', {
      method: 'POST',
      body: { organization_id: otherOrg.id, form_key: 'hipaa_authorization', title: 'Other', storage_path: `${otherOrg.id}/templates/o.pdf`, file_name: 'o.pdf', size_bytes: 10, sha256: SHA, page_count: 1 }
    })

    // Forms: drafts only on insert, same company and matching template.
    const insertForm = body => request('/rest/v1/forge_wc_case_forms', { method: 'POST', body: { organization_id: ORG, case_id: wc.id, created_by: ADMIN_USER, ...body } })
    await expectFailure(insertForm({ template_id: otherTemplate.id, form_key: 'hipaa_authorization' }), 'another company\'s template is refused', '23503')
    await expectFailure(insertForm({ template_id: hipaaV1.id, form_key: 'injury_guidelines_ack' }), 'the form must match its template', '23514')
    await expectFailure(
      insertForm({ template_id: hipaaV1.id, form_key: 'hipaa_authorization', status: 'signed', signed_at: new Date().toISOString(), signer_name: 'X', signature_path: 'x' }),
      'forms cannot be created already signed',
      '23514'
    )
    await expectFailure(
      request('/rest/v1/forge_wc_case_forms', { method: 'POST', body: { organization_id: otherOrg.id, case_id: wc.id, template_id: otherTemplate.id, form_key: 'hipaa_authorization' } }),
      'a form cannot be filed on another company\'s case'
    )

    const [draft] = await insertForm({ template_id: hipaaV1.id, form_key: 'hipaa_authorization', field_data: { patient_name: 'Forms Test' } })
    assert(draft.status === 'draft' && draft.row_version === 1, 'a draft form is created')

    const [edited] = await request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'PATCH', body: { field_data: { patient_name: 'Forms Test', provider_name: 'Clinic' } } })
    assert(edited.row_version === 2, 'editing a draft bumps its version')
    await expectFailure(request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'PATCH', body: { case_id: (await newCase()).id } }), 'a form cannot move to another case', '42501')
    await expectFailure(
      request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'PATCH', body: { status: 'signed', signed_at: new Date().toISOString() } }),
      'a form cannot be marked signed without a signature',
      '23514'
    )

    // Replacing the template does not move existing forms.
    const hipaaV2 = await replace('hipaa_authorization', 'v2')
    const [v1After] = await request(`/rest/v1/forge_wc_form_templates?id=eq.${hipaaV1.id}&select=is_active,archived_at`)
    const [draftAfter] = await request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}&select=template_id`)
    assert(hipaaV2.is_active && !v1After.is_active && v1After.archived_at && draftAfter.template_id === hipaaV1.id, 'replacing a template archives the old one and keeps forms on it')
    await expectFailure(request(`/rest/v1/forge_wc_form_templates?id=eq.${hipaaV1.id}`, { method: 'PATCH', body: { is_active: true, archived_at: null } }), 'an archived template cannot be reactivated', '42501')
    await expectFailure(insertForm({ template_id: hipaaV1.id, form_key: 'hipaa_authorization' }), 'new forms cannot use a replaced template', '23514')

    // Signing: locked, versioned, signature must belong to the form.
    const sign = (overrides = {}) =>
      rpc('forge_sign_wc_case_form', {
        p_organization_id: ORG, p_form_id: draft.id, p_expected_version: 2, p_field_data: { patient_name: 'Forms Test', provider_name: 'Clinic' },
        p_signer_name: 'Forms Test', p_signer_relationship: 'Self', p_signature_path: `${ORG}/${wc.id}/${draft.id}/signature-1.png`, p_actor_user_id: ADMIN_USER, ...overrides
      })
    await expectFailure(sign({ p_expected_version: 1 }), 'signing an out-of-date copy is refused', '40001')
    await expectFailure(sign({ p_signature_path: `${ORG}/${wc.id}/someone-else/signature.png` }), 'a signature from another form is refused', '23514')
    await expectFailure(sign({ p_organization_id: otherOrg.id }), 'another company cannot sign the form', 'P0002')
    const signed = await sign()
    assert(signed.status === 'signed' && signed.signed_at && signed.signer_relationship === 'Self' && signed.signed_by === ADMIN_USER, 'the form is signed')
    await expectFailure(sign({ p_expected_version: signed.row_version }), 'a signed form cannot be signed again', '42501')

    // Signed forms are immutable except for voiding.
    await expectFailure(request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'PATCH', body: { field_data: { patient_name: 'Changed' } } }), 'signed field data cannot change', '42501')
    await expectFailure(request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'PATCH', body: { signer_name: 'Someone Else' } }), 'the signer cannot change', '42501')
    await expectFailure(request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'DELETE' }), 'signed forms cannot be deleted', '42501')

    const voidForm = (reason, version) => rpc('forge_void_wc_case_form', { p_organization_id: ORG, p_form_id: draft.id, p_expected_version: version, p_reason: reason, p_actor_user_id: ADMIN_USER })
    await expectFailure(voidForm('no', signed.row_version), 'voiding needs a reason', '23514')
    const voided = await voidForm('Wrong provider name', signed.row_version)
    assert(voided.status === 'voided' && voided.void_reason === 'Wrong provider name' && voided.signature_path === signed.signature_path, 'a signed form is voided and keeps its signature')
    await expectFailure(voidForm('Again please', voided.row_version), 'a voided form cannot be voided again', '42501')
    await expectFailure(request(`/rest/v1/forge_wc_case_forms?id=eq.${draft.id}`, { method: 'PATCH', body: { field_data: {} } }), 'voided forms cannot change', '42501')

    // History is append-only and tied to its own case.
    const events = await request(`/rest/v1/forge_wc_case_form_events?case_form_id=eq.${draft.id}&select=id,event_type&order=id`)
    assert(events.map(item => item.event_type).join(',') === 'signed,voided', 'signing and voiding are recorded in the form history')
    await expectFailure(request(`/rest/v1/forge_wc_case_form_events?id=eq.${events[0].id}`, { method: 'PATCH', body: { detail: {} } }), 'history cannot be edited', '42501')
    await expectFailure(request(`/rest/v1/forge_wc_case_form_events?id=eq.${events[0].id}`, { method: 'DELETE' }), 'history cannot be deleted', '42501')
    const otherCase = await newCase()
    await expectFailure(
      request('/rest/v1/forge_wc_case_form_events', { method: 'POST', body: { organization_id: ORG, case_id: otherCase.id, case_form_id: draft.id, event_type: 'printed' } }),
      'history must match the form\'s case',
      '23514'
    )

    // Drafts can be discarded; archived cases take no new forms.
    const [scratch] = await insertForm({ template_id: hipaaV2.id, form_key: 'hipaa_authorization' })
    await request(`/rest/v1/forge_wc_case_forms?id=eq.${scratch.id}`, { method: 'DELETE' })
    assert((await request(`/rest/v1/forge_wc_case_forms?id=eq.${scratch.id}&select=id`)).length === 0, 'a draft can be deleted')
    const archived = await newCase({ status: 'archived' })
    await expectFailure(
      request('/rest/v1/forge_wc_case_forms', { method: 'POST', body: { organization_id: ORG, case_id: archived.id, template_id: hipaaV2.id, form_key: 'hipaa_authorization' } }),
      'archived cases take no new forms',
      '23514'
    )

    // Members never reach these tables or functions directly.
    const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
    })
    const { access_token: token } = await tokenResponse.json()
    for (const table of ['forge_wc_form_templates', 'forge_wc_case_forms', 'forge_wc_case_form_events']) {
      await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
    }
    await expectFailure(
      rpc('forge_sign_wc_case_form', { p_organization_id: ORG, p_form_id: draft.id, p_expected_version: 1, p_field_data: {}, p_signer_name: 'X', p_signer_relationship: null, p_signature_path: 'x', p_actor_user_id: ADMIN_USER }, { token }),
      'members cannot call the signing function'
    )
    await expectFailure(rpc('forge_void_wc_case_form', { p_organization_id: ORG, p_form_id: draft.id, p_expected_version: 1, p_reason: 'test', p_actor_user_id: ADMIN_USER }, { token }), 'members cannot call the void function')

    const [bucket] = await request(`/storage/v1/bucket/forge-wc-forms`).then(item => [item])
    assert(bucket.public === false && bucket.file_size_limit === 5242880, 'form files live in a private 5 MB bucket')

    // Deleting the company removes its signed and voided forms, history and templates with it.
    await request(`/rest/v1/organizations?id=eq.${ORG}`, { method: 'DELETE' })
    const leftovers = await request(`/rest/v1/forge_wc_case_forms?organization_id=eq.${ORG}&select=id`)
    const leftoverEvents = await request(`/rest/v1/forge_wc_case_form_events?organization_id=eq.${ORG}&select=id`)
    const leftoverTemplates = await request(`/rest/v1/forge_wc_form_templates?organization_id=eq.${ORG}&select=id`)
    assert(leftovers.length + leftoverEvents.length + leftoverTemplates.length === 0, 'deleting a company removes its forms, history and templates')

    console.log('All workers\' comp case forms DB checks passed.')
  } finally {
    for (const id of created.orgs) await request(`/rest/v1/organizations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
