/**
 * NX-01R3 — returned concurrency token contract + client source audit.
 * Run: node apps/web/tests/nx01r3-capa-client-concurrency-db.cjs
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

async function createOpenCapa(title) {
  const rows = await request('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      action_number: 'CA-R3-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title,
      description: 'NX-01R3 fixture',
      action_type: 'corrective',
      severity: 'moderate',
      source_type: 'manual',
      status: 'open',
      location_id: LOC_A,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(rows?.[0]?.id, 'CAPA create failed')
  return rows[0]
}

async function loadCapa(id) {
  const rows = await request(
    '/rest/v1/forge_corrective_actions?id=eq.' +
      id +
      '&select=id,title,status,row_version,action_plan,updated_at'
  )
  return rows[0]
}

async function main() {
  console.log('NX-01R3 client concurrency contract checks...')

  const formSrc = fs.readFileSync(
    path.join(__dirname, '../src/app/(back)/corrective-actions/CorrectiveActionRecordForm.tsx'),
    'utf8'
  )
  const actionsSrc = fs.readFileSync(
    path.join(__dirname, '../src/app/(back)/corrective-actions/actions.ts'),
    'utf8'
  )

  console.log('  client source: local concurrency state')
  assert(formSrc.includes('currentRowVersion'), 'Form must keep currentRowVersion state')
  assert(formSrc.includes('currentStatus'), 'Form must keep currentStatus state')
  assert(formSrc.includes('currentRowVersionRef'), 'Form must keep rowVersion ref for sync saves')
  assert(formSrc.includes('currentStatusRef'), 'Form must keep status ref for sync saves')
  assert(formSrc.includes('setCurrentRowVersion(result.rowVersion)'), 'Must adopt result.rowVersion')
  assert(formSrc.includes('setCurrentStatus(result.status)'), 'Must adopt result.status')
  assert(
    formSrc.includes('expectedRowVersion: currentRowVersionRef.current'),
    'Saves must send currentRowVersionRef'
  )
  assert(
    formSrc.includes('expectedStatus: currentStatusRef.current'),
    'Saves must send currentStatusRef'
  )
  assert(
    !formSrc.includes('expectedRowVersion: Number(initialValues'),
    'Must not bind expectedRowVersion to initialValues after mount'
  )
  assert(
    !/setCurrentRowVersion\(\s*currentRowVersion\s*\+\s*1\s*\)/.test(formSrc),
    'Must never guess rowVersion locally'
  )
  assert(
    !formSrc.includes("setCurrentStatus('in_progress')"),
    'Must never guess status locally'
  )

  console.log('  client source: request-id lifecycle')
  // After success: adopt tokens (refs + state), then clear request id (order matters).
  const adoptIdx = formSrc.indexOf('currentRowVersionRef.current = result.rowVersion')
  const clearIdx = formSrc.indexOf('submissionRequestIdRef.current = null', adoptIdx)
  assert(adoptIdx > 0, 'Must adopt rowVersion on success')
  assert(clearIdx > adoptIdx, 'Must clear request id AFTER adopting tokens')
  // Conflict path clears request id (new logical attempt).
  assert(
    /conflict[\s\S]{0,400}submissionRequestIdRef\.current = null/.test(formSrc),
    'Conflict must rotate request id'
  )

  console.log('  server source: typed success contract')
  assert(actionsSrc.includes('CorrectiveActionUpdateResult'), 'Typed update result required')
  assert(actionsSrc.includes('ok: true as const'), 'Success must return ok: true')
  assert(actionsSrc.includes('rowVersion: nextRowVersion'), 'Success must return rowVersion')
  assert(actionsSrc.includes('status: nextStatus'), 'Success must return status')
  assert(
    actionsSrc.includes('Update succeeded but concurrency tokens were missing'),
    'Must reject missing post-transaction tokens'
  )

  // --- Field-only: returned version matches DB ---
  console.log('  returned rowVersion contract (field-only)')
  const fieldCapa = await createOpenCapa('NX-01R3 field token')
  const n = Number(fieldCapa.row_version || 1)
  const fieldResult = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: fieldCapa.id,
    p_expected_row_version: n,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: { title: 'NX-01R3 field token updated', description: 'Updated' },
    p_to_status: null,
    p_transition_key: null,
    p_assignment_changed: false,
    p_idempotency_key: 'capa:' + fieldCapa.id + ':update:' + n + ':r3-field',
    p_fail_after_fields: false
  })
  assert(fieldResult?.ok === true, 'Field update must succeed')
  assert(Number(fieldResult.row_version) === n + 1, 'RPC must return N+1')
  const fieldAfter = await loadCapa(fieldCapa.id)
  assert(Number(fieldAfter.row_version) === n + 1, 'DB row_version must be N+1')
  assert(Number(fieldResult.row_version) === Number(fieldAfter.row_version), 'Returned == DB version')
  assert(fieldAfter.status === 'open', 'Field-only keeps open')
  assert(String(fieldResult.capa_status) === fieldAfter.status, 'Returned status == DB status')

  // --- Lifecycle: returned status + version ---
  console.log('  returned status contract (lifecycle)')
  const lifeCapa = await createOpenCapa('NX-01R3 lifecycle token')
  const ln = Number(lifeCapa.row_version || 1)
  const lifeResult = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: lifeCapa.id,
    p_expected_row_version: ln,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: {
      title: lifeCapa.title,
      description: 'NX-01R3 fixture',
      action_plan: 'Start work for R3 token contract'
    },
    p_to_status: 'in_progress',
    p_transition_key: 'start_work',
    p_assignment_changed: false,
    p_idempotency_key: 'capa:' + lifeCapa.id + ':update:' + ln + ':r3-life',
    p_fail_after_fields: false
  })
  assert(lifeResult?.ok === true, 'Lifecycle update must succeed')
  assert(Number(lifeResult.row_version) === ln + 1, 'Lifecycle RPC must return N+1')
  assert(String(lifeResult.capa_status) === 'in_progress', 'Lifecycle RPC must return in_progress')
  const lifeAfter = await loadCapa(lifeCapa.id)
  assert(Number(lifeAfter.row_version) === ln + 1, 'DB version N+1 after lifecycle')
  assert(lifeAfter.status === 'in_progress', 'DB status in_progress')
  assert(String(lifeResult.capa_status) === lifeAfter.status, 'Returned status == DB')
  assert(Number(lifeResult.row_version) === Number(lifeAfter.row_version), 'Returned version == DB')

  console.log('NX-01R3 client concurrency contract checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
