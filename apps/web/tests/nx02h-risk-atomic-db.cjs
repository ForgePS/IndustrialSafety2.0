/**
 * NX-02H Risk Register atomic lifecycle checks.
 * Run: node apps/web/tests/nx02h-risk-atomic-db.cjs
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
const ORG_A = '20000000-0000-4000-8000-000000000100'
const USER_A = '20000000-0000-4000-8000-000000000002'
const LOC_A = '20000000-0000-4000-8000-000000000300'

if (!API_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase URL or service role key.')
  process.exit(1)
}

async function request(pathname, options = {}) {
  const response = await fetch(API_URL + pathname, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
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
  if (!response.ok) {
    const error = new Error(String((data && (data.message || data.error)) || response.status + ' ' + text))
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

async function rpc(fn, args) {
  return request('/rest/v1/rpc/' + fn, { method: 'POST', body: args })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createDraftRisk(titleSuffix) {
  const number = await rpc('next_forge_risk_number', { p_organization_id: ORG_A })
  const rows = await request('/rest/v1/forge_risks', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      risk_number: number,
      title: 'NX-02H Risk ' + titleSuffix,
      description: 'Atomic lifecycle fixture',
      status: 'draft',
      location_id: LOC_A,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(rows?.[0]?.id, 'Risk create failed')
  return rows[0]
}

async function transition(risk, transitionKey, toStatus, opts = {}) {
  return rpc('forge_perform_risk_lifecycle_transition', {
    p_organization_id: ORG_A,
    p_risk_id: risk.id,
    p_expected_status: risk.status,
    p_expected_row_version: risk.row_version,
    p_transition_key: transitionKey,
    p_to_status: toStatus,
    p_actor_user_id: USER_A,
    p_comment: opts.comment || null,
    p_metadata: {},
    p_idempotency_key: opts.idempotencyKey || null,
    p_fail_after_domain_update: Boolean(opts.failAfter),
    p_closure_summary: opts.closureSummary || null
  })
}

async function reload(id) {
  const rows = await request('/rest/v1/forge_risks?id=eq.' + id + '&select=*')
  return rows[0]
}

async function main() {
  console.log('NX-02H risk atomic lifecycle checks...')

  // Activation blocked without owner/assessment
  let risk = await createDraftRisk('blocked-activate')
  let result = await transition(risk, 'submit_assessment', 'assessment')
  assert(result.ok === true, 'submit_assessment should succeed')
  risk = await reload(risk.id)
  result = await transition(risk, 'submit_for_review', 'review')
  assert(result.ok === true, 'submit_for_review should succeed')
  risk = await reload(risk.id)
  result = await transition(risk, 'activate', 'active')
  assert(result.ok === false, 'activate without assessment must fail')
  assert(String(result.error || '').toLowerCase().includes('owner') ||
    String(result.error || '').toLowerCase().includes('inherent') ||
    String(result.error || '').toLowerCase().includes('matrix'),
    'activate error should mention missing requirements')

  // Fail-after rolls back
  risk = await createDraftRisk('fail-after')
  try {
    await transition(risk, 'submit_assessment', 'assessment', {
      failAfter: true,
      idempotencyKey: 'nx02h-risk-fail-' + risk.id
    })
    throw new Error('fail_after should raise')
  } catch (error) {
    assert(String(error.message || '').includes('NX02H_FORCED_FAILURE') ||
      String(error.message || '').includes('Forced') ||
      String(error.data?.message || '').includes('NX02H_FORCED_FAILURE'),
      'expected forced failure: ' + error.message)
  }
  risk = await reload(risk.id)
  assert(risk.status === 'draft', 'status must remain draft after forced failure')
  assert(Number(risk.row_version) === 1, 'row_version must not bump on rollback')

  // Idempotent transition
  risk = await createDraftRisk('idempotent')
  const key = 'nx02h-risk-idem-' + risk.id
  result = await transition(risk, 'submit_assessment', 'assessment', { idempotencyKey: key })
  assert(result.ok === true && !result.duplicate, 'first transition should apply')
  const firstEvent = result.event_id
  risk = await reload(risk.id)
  result = await transition(
    { ...risk, status: 'draft', row_version: 1 },
    'submit_assessment',
    'assessment',
    { idempotencyKey: key }
  )
  // After first success status is assessment; replaying with stale expected may conflict OR
  // if we use current state wrong. Reload and call with same key from current instance.
  risk = await reload(risk.id)
  result = await rpc('forge_perform_risk_lifecycle_transition', {
    p_organization_id: ORG_A,
    p_risk_id: risk.id,
    p_expected_status: 'draft',
    p_expected_row_version: 1,
    p_transition_key: 'submit_assessment',
    p_to_status: 'assessment',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_metadata: {},
    p_idempotency_key: key,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })
  assert(result.ok === true && result.duplicate === true, 'idempotent replay must return duplicate')
  assert(result.event_id === firstEvent, 'idempotent replay must return original event')

  // Matrix immutability on active matrix
  const matrices = await request(
    '/rest/v1/forge_risk_matrices?organization_id=is.null&is_active=eq.true&select=id&limit=1'
  )
  assert(matrices?.[0]?.id, 'core active matrix required')
  const cells = await request(
    '/rest/v1/forge_risk_matrix_cells?risk_matrix_id=eq.' + matrices[0].id + '&select=id,score&limit=1'
  )
  assert(cells?.[0]?.id, 'matrix cell required')
  try {
    await request('/rest/v1/forge_risk_matrix_cells?id=eq.' + cells[0].id, {
      method: 'PATCH',
      body: { score: Number(cells[0].score) + 1 }
    })
    throw new Error('active matrix cell update should be denied')
  } catch (error) {
    assert(
      String(error.message || '').toLowerCase().includes('immutable') ||
        String(error.message || '').toLowerCase().includes('active') ||
        String(error.message || '').toLowerCase().includes('cannot'),
      'expected immutability error: ' + error.message
    )
  }

  // Review snapshot atomic
  risk = await createDraftRisk('review')
  // Move to active-ish state with minimal fields via direct patch for review RPC only
  await request('/rest/v1/forge_risks?id=eq.' + risk.id, {
    method: 'PATCH',
    body: {
      inherent_likelihood_key: 'possible',
      inherent_severity_key: 'moderate',
      inherent_score: 9,
      inherent_band_key: 'moderate',
      residual_likelihood_key: 'unlikely',
      residual_severity_key: 'minor',
      residual_score: 4,
      residual_band_key: 'low',
      next_review_at: new Date(Date.now() + 30 * 86400000).toISOString()
    }
  })
  risk = await reload(risk.id)
  result = await rpc('forge_create_risk_review', {
    p_organization_id: ORG_A,
    p_risk_id: risk.id,
    p_expected_row_version: risk.row_version,
    p_actor_user_id: USER_A,
    p_review_notes: 'NX-02H review snapshot',
    p_next_review_at: new Date(Date.now() + 60 * 86400000).toISOString(),
    p_fail_after_review_insert: false
  })
  assert(result.ok === true && result.review_id, 'risk review must succeed')
  const reviews = await request(
    '/rest/v1/forge_risk_reviews?id=eq.' + result.review_id + '&select=*'
  )
  assert(reviews?.[0]?.inherent_score === 9, 'review must snapshot inherent score')
  risk = await reload(risk.id)
  assert(Number(risk.row_version) === Number(result.row_version), 'risk row_version must match review result')

  // Approval gate: high band without approval blocks activate
  const personnel = await request(
    '/rest/v1/forge_personnel?organization_id=eq.' + ORG_A + '&select=id&limit=1'
  )
  assert(personnel?.[0]?.id, 'personnel fixture required')
  const matrix = await request(
    '/rest/v1/forge_risk_matrices?or=(organization_id.eq.' +
      ORG_A +
      ',organization_id.is.null)&is_active=eq.true&select=id,version&limit=1'
  )
  risk = await createDraftRisk('approval-gate')
  await request('/rest/v1/forge_risks?id=eq.' + risk.id, {
    method: 'PATCH',
    body: {
      owner_personnel_id: personnel[0].id,
      risk_matrix_id: matrix[0].id,
      risk_matrix_version: matrix[0].version || 1,
      inherent_likelihood_key: 'likely',
      inherent_severity_key: 'major',
      inherent_score: 16,
      inherent_band_key: 'high',
      residual_likelihood_key: 'likely',
      residual_severity_key: 'major',
      residual_score: 16,
      residual_band_key: 'high',
      next_review_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      acceptance_required: false
    }
  })
  await request('/rest/v1/forge_risk_controls', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      risk_id: risk.id,
      title: 'Guard',
      control_type: 'engineering',
      is_active: true,
      created_by: USER_A
    }
  })
  risk = await reload(risk.id)
  result = await transition(risk, 'submit_assessment', 'assessment')
  risk = await reload(risk.id)
  result = await transition(risk, 'submit_for_review', 'review')
  risk = await reload(risk.id)
  result = await transition(risk, 'activate', 'active')
  assert(result.ok === false, 'high band without approval must block activate')
  assert(String(result.error || '').toLowerCase().includes('approval'), 'error must mention approval')

  // Completed approval allows (still may need acceptance for high - we set acceptance_required false and band high not critical)
  await request('/rest/v1/forge_approval_requests', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      resource_type: 'risk_register',
      resource_id: risk.id,
      approval_type: 'risk_activation',
      status: 'approved',
      requested_by: USER_A,
      completed_at: new Date().toISOString()
    }
  })
  risk = await reload(risk.id)
  result = await transition(risk, 'activate', 'active')
  assert(result.ok === true, 'high band with completed approval should activate: ' + (result.error || ''))
  risk = await reload(risk.id)
  assert(risk.status === 'active', 'risk must be active')

  console.log('NX-02H risk atomic lifecycle checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
