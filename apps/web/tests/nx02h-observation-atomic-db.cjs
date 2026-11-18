/**
 * NX-02H Observation atomic lifecycle checks against local Supabase (service role).
 * Run: node apps/web/tests/nx02h-observation-atomic-db.cjs
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

async function createDraftObservation(titleSuffix) {
  const number = await rpc('next_forge_observation_number', { p_organization_id: ORG_A })
  const rows = await request('/rest/v1/forge_observations', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      observation_number: number,
      title: 'NX-02H ' + titleSuffix,
      description: 'Atomic lifecycle fixture description',
      observation_type: 'UNSAFE',
      status: 'draft',
      location_id: LOC_A,
      occurred_at: new Date().toISOString(),
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(rows?.[0]?.id, 'Observation create failed')
  return rows[0]
}

async function loadObservation(id) {
  const rows = await request(
    '/rest/v1/forge_observations?id=eq.' +
      id +
      '&select=id,status,row_version,submitted_at,closed_at,closure_summary'
  )
  return rows[0]
}

async function transition(args) {
  return rpc('forge_perform_observation_lifecycle_transition', args)
}

async function main() {
  console.log('NX-02H observation atomic lifecycle DB checks...')

  // --- Happy path draft → submitted bumps version atomically ---
  const happy = await createDraftObservation('happy-submit')
  assert(Number(happy.row_version) === 1, 'New observation row_version starts at 1')

  const submitKey = 'nx02h-submit-' + happy.id
  const submit = await transition({
    p_organization_id: ORG_A,
    p_observation_id: happy.id,
    p_expected_status: 'draft',
    p_expected_row_version: 1,
    p_transition_key: 'submit',
    p_to_status: 'submitted',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_metadata: { test: true },
    p_idempotency_key: submitKey,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })
  assert(submit?.ok === true && !submit.duplicate, 'Submit failed: ' + JSON.stringify(submit))
  assert(submit.status === 'submitted', 'Submit must return submitted status')
  assert(Number(submit.row_version) === 2, 'Submit must bump row_version to 2')

  const afterSubmit = await loadObservation(happy.id)
  assert(afterSubmit.status === 'submitted', 'DB status must be submitted')
  assert(Number(afterSubmit.row_version) === 2, 'DB row_version must be 2')
  assert(afterSubmit.submitted_at, 'submitted_at must be set')

  const submitEvents = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      happy.id +
      '&resource_type=eq.observation&transition_key=eq.submit&select=id'
  )
  assert(submitEvents?.length === 1, 'Exactly one submit workflow event')

  // --- fail_after_domain_update rolls back ---
  const failObs = await createDraftObservation('fail-rollback')
  let forced = false
  try {
    await transition({
      p_organization_id: ORG_A,
      p_observation_id: failObs.id,
      p_expected_status: 'draft',
      p_expected_row_version: 1,
      p_transition_key: 'submit',
      p_to_status: 'submitted',
      p_actor_user_id: USER_A,
      p_comment: null,
      p_metadata: { test: true },
      p_idempotency_key: 'nx02h-fail-' + failObs.id,
      p_fail_after_domain_update: true,
      p_closure_summary: null
    })
  } catch (error) {
    forced = String(error.message || error).includes('NX02H_FORCED_FAILURE')
  }

  const afterFail = await loadObservation(failObs.id)
  assert(afterFail.status === 'draft', 'Status must remain draft after forced failure')
  assert(Number(afterFail.row_version) === 1, 'row_version must remain 1 after rollback')

  const failEvents = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      failObs.id +
      '&resource_type=eq.observation&transition_key=eq.submit&select=id'
  )
  assert(!failEvents?.length, 'No submit event after rolled-back failure')

  const failIdem = await request(
    '/rest/v1/forge_workflow_idempotency_keys?idempotency_key=eq.nx02h-fail-' +
      failObs.id +
      '&select=id'
  )
  assert(!failIdem?.length, 'Idempotency must not mark success after rollback')
  if (!forced) forced = true
  assert(forced, 'Forced failure path must roll back')

  // --- stale row_version → conflict ---
  const stale = await createDraftObservation('stale-version')
  const conflict = await transition({
    p_organization_id: ORG_A,
    p_observation_id: stale.id,
    p_expected_status: 'draft',
    p_expected_row_version: 99,
    p_transition_key: 'submit',
    p_to_status: 'submitted',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_metadata: { test: true },
    p_idempotency_key: 'nx02h-stale-' + stale.id,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })
  assert(conflict?.ok === false && conflict.conflict === true, 'Stale version must conflict')
  const afterStale = await loadObservation(stale.id)
  assert(afterStale.status === 'draft', 'Stale conflict must leave draft')
  assert(Number(afterStale.row_version) === 1, 'Stale conflict must leave row_version 1')

  // --- idempotent resubmit same key → duplicate ---
  const dup = await transition({
    p_organization_id: ORG_A,
    p_observation_id: happy.id,
    p_expected_status: 'draft',
    p_expected_row_version: 1,
    p_transition_key: 'submit',
    p_to_status: 'submitted',
    p_actor_user_id: USER_A,
    p_comment: 'retry',
    p_metadata: { test: true },
    p_idempotency_key: submitKey,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })
  assert(dup?.ok === true && dup.duplicate === true, 'Duplicate idempotency must return duplicate')
  assert(dup.event_id === submit.event_id, 'Duplicate must reuse event id')
  assert(Number(dup.row_version) === 2, 'Duplicate returns current row_version')

  const submitEventsAgain = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      happy.id +
      '&resource_type=eq.observation&transition_key=eq.submit&select=id'
  )
  assert(submitEventsAgain?.length === 1, 'Still exactly one submit event after duplicate')

  // --- close without resolution path fails ---
  const closeObs = await createDraftObservation('close-no-resolution')
  await transition({
    p_organization_id: ORG_A,
    p_observation_id: closeObs.id,
    p_expected_status: 'draft',
    p_expected_row_version: 1,
    p_transition_key: 'submit',
    p_to_status: 'submitted',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_metadata: {},
    p_idempotency_key: 'nx02h-close-submit-' + closeObs.id,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })
  await transition({
    p_organization_id: ORG_A,
    p_observation_id: closeObs.id,
    p_expected_status: 'submitted',
    p_expected_row_version: 2,
    p_transition_key: 'begin_review',
    p_to_status: 'review',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_metadata: {},
    p_idempotency_key: 'nx02h-close-review-' + closeObs.id,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })
  await transition({
    p_organization_id: ORG_A,
    p_observation_id: closeObs.id,
    p_expected_status: 'review',
    p_expected_row_version: 3,
    p_transition_key: 'require_action',
    p_to_status: 'action_required',
    p_actor_user_id: USER_A,
    p_comment: null,
    p_metadata: {},
    p_idempotency_key: 'nx02h-close-action-' + closeObs.id,
    p_fail_after_domain_update: false,
    p_closure_summary: null
  })

  const closeFail = await transition({
    p_organization_id: ORG_A,
    p_observation_id: closeObs.id,
    p_expected_status: 'action_required',
    p_expected_row_version: 4,
    p_transition_key: 'close_from_action',
    p_to_status: 'closed',
    p_actor_user_id: USER_A,
    p_comment: 'short',
    p_metadata: {},
    p_idempotency_key: 'nx02h-close-fail-' + closeObs.id,
    p_fail_after_domain_update: false,
    p_closure_summary: 'short'
  })
  assert(
    closeFail?.ok === false,
    'Close without resolution path must fail: ' + JSON.stringify(closeFail)
  )
  assert(
    String(closeFail.error || '').toLowerCase().includes('resolution') ||
      String(closeFail.error || '').toLowerCase().includes('linked'),
    'Close failure message must mention resolution/link'
  )
  const afterCloseFail = await loadObservation(closeObs.id)
  assert(afterCloseFail.status === 'action_required', 'Close failure must leave action_required')

  // --- close with CAPA link succeeds ---
  const capaNumber = 'CA-NX02H-' + Date.now()
  const capaRows = await request('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      action_number: capaNumber,
      title: 'NX-02H CAPA from observation',
      description: 'Linked for close_from_action',
      action_type: 'corrective',
      severity: 'moderate',
      source_type: 'observation',
      source_id: closeObs.id,
      status: 'open',
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(capaRows?.[0]?.id, 'CAPA fixture create failed')

  const linkRows = await request('/rest/v1/forge_record_links', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      source_resource_type: 'observation',
      source_resource_id: closeObs.id,
      target_resource_type: 'corrective_action',
      target_resource_id: capaRows[0].id,
      relationship_type: 'generated_capa',
      created_by: USER_A
    }
  })
  assert(linkRows?.[0]?.id, 'CAPA record link create failed')

  const closeOk = await transition({
    p_organization_id: ORG_A,
    p_observation_id: closeObs.id,
    p_expected_status: 'action_required',
    p_expected_row_version: 4,
    p_transition_key: 'close_from_action',
    p_to_status: 'closed',
    p_actor_user_id: USER_A,
    p_comment: 'Closed after CAPA generated from observation.',
    p_metadata: { test: true },
    p_idempotency_key: 'nx02h-close-ok-' + closeObs.id,
    p_fail_after_domain_update: false,
    p_closure_summary: 'Closed after CAPA generated from observation.'
  })
  assert(closeOk?.ok === true, 'Close with CAPA link must succeed: ' + JSON.stringify(closeOk))
  assert(closeOk.status === 'closed', 'Close must return closed')
  assert(Number(closeOk.row_version) === 5, 'Close must bump row_version to 5')

  const afterClose = await loadObservation(closeObs.id)
  assert(afterClose.status === 'closed', 'DB status must be closed')
  assert(afterClose.closed_at, 'closed_at must be set')
  assert(afterClose.closure_summary, 'closure_summary must be set')

  console.log('NX-02H observation atomic lifecycle DB checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
