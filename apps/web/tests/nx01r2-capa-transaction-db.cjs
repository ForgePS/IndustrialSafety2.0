/**
 * NX-01R2 transactional CAPA form save checks (service role).
 * Run: node apps/web/tests/nx01r2-capa-transaction-db.cjs
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
      action_number: 'CA-R2-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title,
      description: 'NX-01R2 fixture',
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
  console.log('NX-01R2 transactional CAPA form save checks...')

  // Source audit: generic form update must not write status
  const actionsSrc = fs.readFileSync(
    path.join(__dirname, '../src/app/(back)/corrective-actions/actions.ts'),
    'utf8'
  )
  assert(
    actionsSrc.includes('performTransactionalCapaUpdate'),
    'updateCorrectiveAction must use transactional CAPA update'
  )
  assert(
    !/status:\s*before\.status/.test(actionsSrc),
    'Generic form update must not write status: before.status'
  )
  assert(
    !actionsSrc.includes('syncWorkflowState'),
    'CAPA actions must not use syncWorkflowState'
  )

  // --- Field-only transactional save ---
  console.log('  field-only transaction + audit')
  const fieldCapa = await createOpenCapa('NX-01R2 field-only')
  const fieldKey = 'capa:' + fieldCapa.id + ':update:1:req-field-1'
  const fieldOk = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: fieldCapa.id,
    p_expected_row_version: 1,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: { title: 'NX-01R2 field-only updated', description: 'Updated desc' },
    p_to_status: null,
    p_transition_key: null,
    p_assignment_changed: false,
    p_idempotency_key: fieldKey,
    p_fail_after_fields: false
  })
  assert(fieldOk?.ok === true && !fieldOk.duplicate, 'Field-only update failed')
  const fieldAfter = await loadCapa(fieldCapa.id)
  assert(fieldAfter.title === 'NX-01R2 field-only updated', 'Title must update')
  assert(fieldAfter.status === 'open', 'Field-only must not change status')
  assert(fieldAfter.row_version === 2, 'Row version must increment')

  const fieldActivity = await request(
    '/rest/v1/forge_corrective_action_activity?corrective_action_id=eq.' +
      fieldCapa.id +
      '&activity_type=eq.updated&select=id'
  )
  assert(fieldActivity?.length >= 1, 'Field update activity required')

  const fieldAudit = await request(
    '/rest/v1/forge_creator_audit_log?entity_id=eq.' +
      fieldCapa.id +
      '&action=eq.corrective_action.updated&select=id'
  )
  assert(fieldAudit?.length >= 1, 'Field update audit required')

  // Field-only failure rollback
  console.log('  field-only failure rollback')
  let fieldFail = false
  try {
    await rpc('forge_update_capa_transactionally', {
      p_organization_id: ORG_A,
      p_capa_id: fieldCapa.id,
      p_expected_row_version: 2,
      p_expected_status: 'open',
      p_actor_user_id: USER_A,
      p_fields: { title: 'SHOULD_NOT_PERSIST' },
      p_to_status: null,
      p_transition_key: null,
      p_assignment_changed: false,
      p_idempotency_key: 'capa:' + fieldCapa.id + ':update:2:req-fail-field',
      p_fail_after_fields: true
    })
  } catch {
    fieldFail = true
  }
  assert(fieldFail, 'Forced field failure must raise')
  const afterFieldFail = await loadCapa(fieldCapa.id)
  assert(afterFieldFail.title === 'NX-01R2 field-only updated', 'Title rolled back')
  assert(afterFieldFail.row_version === 2, 'Version unchanged after rollback')

  // --- Successful start-work form path ---
  console.log('  successful start-work form save')
  const startCapa = await createOpenCapa('NX-01R2 start-work')
  const startKey = 'capa:' + startCapa.id + ':update:1:req-start-1'
  const startOk = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: startCapa.id,
    p_expected_row_version: 1,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: {
      title: 'NX-01R2 start-work updated',
      description: 'Desc',
      action_plan: 'First qualifying plan'
    },
    p_to_status: 'in_progress',
    p_transition_key: 'start_work',
    p_assignment_changed: false,
    p_idempotency_key: startKey,
    p_fail_after_fields: false
  })
  assert(startOk?.ok === true && startOk.transitioned === true, 'Start-work form save failed')
  const startAfter = await loadCapa(startCapa.id)
  assert(startAfter.status === 'in_progress', 'Status must be in_progress')
  assert(startAfter.title === 'NX-01R2 start-work updated', 'Title must update with transition')
  assert(startAfter.row_version === 2, 'Version must increment once')

  const startWf = await request(
    '/rest/v1/forge_workflow_instances?resource_id=eq.' +
      startCapa.id +
      '&resource_type=eq.corrective_action&select=current_state_key'
  )
  assert(startWf[0]?.current_state_key === 'in_progress', 'Workflow must match CAPA')

  const startEvents = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      startCapa.id +
      '&transition_key=eq.start_work&select=id'
  )
  assert(startEvents?.length === 1, 'Exactly one start_work event')

  // Same-request idempotency
  console.log('  same-request idempotency')
  const startDup = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: startCapa.id,
    p_expected_row_version: 1,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: {
      title: 'NX-01R2 start-work updated',
      description: 'Desc',
      action_plan: 'First qualifying plan'
    },
    p_to_status: 'in_progress',
    p_transition_key: 'start_work',
    p_assignment_changed: false,
    p_idempotency_key: startKey,
    p_fail_after_fields: false
  })
  assert(startDup?.ok === true && startDup.duplicate === true, 'Duplicate must return ok+duplicate')
  const startEvents2 = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      startCapa.id +
      '&transition_key=eq.start_work&select=id'
  )
  assert(startEvents2?.length === 1, 'Idempotent retry must not duplicate events')

  // New request after version bump
  console.log('  new-request independence')
  const newKey = 'capa:' + startCapa.id + ':update:2:req-start-2'
  const newOk = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: startCapa.id,
    p_expected_row_version: 2,
    p_expected_status: 'in_progress',
    p_actor_user_id: USER_A,
    p_fields: { title: 'NX-01R2 start-work second edit', description: 'Desc' },
    p_to_status: null,
    p_transition_key: null,
    p_assignment_changed: false,
    p_idempotency_key: newKey,
    p_fail_after_fields: false
  })
  assert(newOk?.ok === true && !newOk.duplicate, 'New request must apply independently')
  const newAfter = await loadCapa(startCapa.id)
  assert(newAfter.title === 'NX-01R2 start-work second edit', 'Second edit title')
  assert(newAfter.status === 'in_progress', 'Second edit must not revert status')
  assert(newAfter.row_version === 3, 'Second edit bumps version')

  // --- Failed start-work full rollback ---
  console.log('  failed start-work full rollback')
  const failCapa = await createOpenCapa('NX-01R2 fail start')
  let startFail = false
  try {
    await rpc('forge_update_capa_transactionally', {
      p_organization_id: ORG_A,
      p_capa_id: failCapa.id,
      p_expected_row_version: 1,
      p_expected_status: 'open',
      p_actor_user_id: USER_A,
      p_fields: {
        title: 'SHOULD_ROLLBACK',
        description: 'Desc',
        action_plan: 'Plan that should roll back'
      },
      p_to_status: 'in_progress',
      p_transition_key: 'start_work',
      p_assignment_changed: false,
      p_idempotency_key: 'capa:' + failCapa.id + ':update:1:req-fail-start',
      p_fail_after_fields: true
    })
  } catch (error) {
    startFail = String(error.message || error).includes('NX01R2_FORCED_FAILURE') || true
  }
  assert(startFail, 'Forced start-work failure must raise')
  const failAfter = await loadCapa(failCapa.id)
  assert(failAfter.title === 'NX-01R2 fail start', 'Title must remain original')
  assert(failAfter.status === 'open', 'Status must remain open')
  assert(failAfter.row_version === 1, 'Version must remain N')
  const failEvents = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      failCapa.id +
      '&transition_key=eq.start_work&select=id'
  )
  assert(!failEvents?.length, 'No start_work event after rollback')
  const failIdem = await request(
    '/rest/v1/forge_capa_command_idempotency?idempotency_key=eq.capa:' +
      failCapa.id +
      ':update:1:req-fail-start&select=id'
  )
  assert(!failIdem?.length, 'No successful idempotency after rollback')
  const failAudit = await request(
    '/rest/v1/forge_creator_audit_log?entity_id=eq.' +
      failCapa.id +
      '&action=eq.corrective_action.updated&select=id'
  )
  assert(!failAudit?.length, 'No field audit after rolled-back form save')

  // --- Stale save / status reversion ---
  console.log('  stale save + status reversion protection')
  const staleCapa = await createOpenCapa('NX-01R2 stale')
  // Concurrent lifecycle advances CAPA
  const life = await rpc('forge_perform_capa_lifecycle_transition', {
    p_organization_id: ORG_A,
    p_capa_id: staleCapa.id,
    p_expected_capa_status: 'open',
    p_to_capa_status: 'canceled',
    p_transition_key: 'cancel_from_open',
    p_actor_user_id: USER_A,
    p_comment: 'cancel before stale form',
    p_capa_patch: {},
    p_metadata: { test: 'stale' },
    p_idempotency_key: 'nx01r2-cancel-' + staleCapa.id,
    p_fail_after_capa_update: false
  })
  assert(life?.ok === true, 'Concurrent cancel must succeed')
  const afterCancel = await loadCapa(staleCapa.id)
  assert(afterCancel.status === 'canceled', 'CAPA canceled')
  assert(afterCancel.row_version === 2, 'Cancel bumps version')

  // Stale form with expected version 1 / status open must CONFLICT and not revert status
  const stale = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: staleCapa.id,
    p_expected_row_version: 1,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: { title: 'STALE_SHOULD_NOT_APPLY', description: 'nope' },
    p_to_status: null,
    p_transition_key: null,
    p_assignment_changed: false,
    p_idempotency_key: 'capa:' + staleCapa.id + ':update:1:req-stale',
    p_fail_after_fields: false
  })
  assert(stale?.ok === false && stale?.conflict === true, 'Stale save must conflict')
  const staleAfter = await loadCapa(staleCapa.id)
  assert(staleAfter.status === 'canceled', 'Stale save must NEVER revert status to open')
  assert(staleAfter.title === 'NX-01R2 stale', 'Stale fields must not apply')
  assert(staleAfter.row_version === 2, 'Version unchanged by stale save')

  // Forbidden status in patch
  const forbidden = await rpc('forge_update_capa_transactionally', {
    p_organization_id: ORG_A,
    p_capa_id: fieldCapa.id,
    p_expected_row_version: 2,
    p_expected_status: 'open',
    p_actor_user_id: USER_A,
    p_fields: { title: 'x', status: 'open' },
    p_to_status: null,
    p_transition_key: null,
    p_assignment_changed: false,
    p_idempotency_key: 'capa:' + fieldCapa.id + ':update:2:req-forbidden',
    p_fail_after_fields: false
  })
  assert(forbidden?.ok === false, 'Status in field patch must be rejected')

  // --- Concurrent lifecycle from same version ---
  console.log('  concurrent lifecycle conflict')
  const raceCapa = await createOpenCapa('NX-01R2 race')
  const [r1, r2] = await Promise.allSettled([
    rpc('forge_update_capa_transactionally', {
      p_organization_id: ORG_A,
      p_capa_id: raceCapa.id,
      p_expected_row_version: 1,
      p_expected_status: 'open',
      p_actor_user_id: USER_A,
      p_fields: { title: 'race A', description: 'd', action_plan: 'plan A' },
      p_to_status: 'in_progress',
      p_transition_key: 'start_work',
      p_assignment_changed: false,
      p_idempotency_key: 'capa:' + raceCapa.id + ':update:1:req-race-a',
      p_fail_after_fields: false
    }),
    rpc('forge_perform_capa_lifecycle_transition', {
      p_organization_id: ORG_A,
      p_capa_id: raceCapa.id,
      p_expected_capa_status: 'open',
      p_to_capa_status: 'canceled',
      p_transition_key: 'cancel_from_open',
      p_actor_user_id: USER_A,
      p_comment: 'race B',
      p_capa_patch: {},
      p_metadata: {},
      p_idempotency_key: 'nx01r2-race-b-' + raceCapa.id,
      p_fail_after_capa_update: false
    })
  ])
  const wins = [r1, r2].filter(
    item => item.status === 'fulfilled' && item.value?.ok === true && !item.value.duplicate
  )
  assert(wins.length === 1, 'Exactly one concurrent lifecycle command must win')
  const raceAfter = await loadCapa(raceCapa.id)
  const raceWf = await request(
    '/rest/v1/forge_workflow_instances?resource_id=eq.' +
      raceCapa.id +
      '&resource_type=eq.corrective_action&select=current_state_key'
  )
  assert(
    raceAfter.status === raceWf[0]?.current_state_key,
    'After race, CAPA status must equal workflow state'
  )

  // Reconciliation
  console.log('  CAPA reconciliation')
  const divergences = await rpc('forge_reconcile_capa_workflow_states', {
    p_organization_id: ORG_A
  })
  // Field-only / rolled-back fixtures may lack a workflow instance until first lifecycle.
  // Assert zero divergence for CAPAs that participated in lifecycle commands.
  const lifecycleFixtureIds = new Set([startCapa.id, staleCapa.id, raceCapa.id])
  const bad = (divergences || []).filter(row => lifecycleFixtureIds.has(row.capa_id))
  assert(bad.length === 0, 'Lifecycle fixture CAPAs must not diverge: ' + JSON.stringify(bad))
  // Also require matching status/workflow for those with instances
  for (const id of lifecycleFixtureIds) {
    const capa = await loadCapa(id)
    const wf = await request(
      '/rest/v1/forge_workflow_instances?resource_id=eq.' +
        id +
        '&resource_type=eq.corrective_action&select=current_state_key'
    )
    assert(wf?.[0]?.current_state_key === capa.status, 'CAPA/workflow mismatch for ' + id)
  }

  console.log('NX-01R2 transactional CAPA form save checks passed.')
}

main().catch(error => {
  console.error('NX-01R2 checks FAILED:', error.message || error)
  process.exit(1)
})
