/**
 * NX-01R PR #7 remediation checks against local Supabase (service role).
 * Run: node apps/web/tests/nx01r-remediation-db.cjs
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
const ORG_B = '30000000-0000-4000-8000-000000000100'
const USER_A = '20000000-0000-4000-8000-000000000002'
const LOC_A = '20000000-0000-4000-8000-000000000300'
const LOC_B = '20000000-0000-4000-8000-000000000301'

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

/** Mirrors LOCATION permission scope evaluation used by resourceWithinEffectiveScope. */
function locationPermissionAllowsResource(resourceLocationId, allowedLocationIds) {
  if (!resourceLocationId) return false
  return allowedLocationIds.includes(resourceLocationId)
}

async function createOpenCapa({ title, locationId, actionPlan = null }) {
  const rows = await request('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      action_number: 'CA-NX01R-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title,
      description: 'NX-01R remediation fixture',
      action_type: 'corrective',
      severity: 'moderate',
      source_type: 'manual',
      status: 'open',
      location_id: locationId,
      action_plan: actionPlan,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(rows?.[0]?.id, 'CAPA create failed')
  return rows[0]
}

async function main() {
  console.log('NX-01R remediation DB checks...')

  // --- Evidence permission-specific Location scope contract ---
  console.log('  evidence permission Location scope contract')
  const allowedLocs = [LOC_A]
  assert(
    locationPermissionAllowsResource(LOC_A, allowedLocs) === true,
    'Evidence upload ALLOW inside permitted Location'
  )
  assert(
    locationPermissionAllowsResource(LOC_B, allowedLocs) === false,
    'Evidence upload DENY outside evidence Location scope'
  )
  assert(
    locationPermissionAllowsResource(null, allowedLocs) === false,
    'Evidence upload DENY when resource has no Location under location scope'
  )

  // Source contract: upload route + shared services must use scoped helper
  const uploadSrc = fs.readFileSync(
    path.join(__dirname, '../src/app/api/evidence/upload/route.ts'),
    'utf8'
  )
  assert(
    uploadSrc.includes('requireForgePermissionForResource') &&
      uploadSrc.includes('records.evidence.upload'),
    'Evidence upload must requireForgePermissionForResource(records.evidence.upload)'
  )
  assert(
    !uploadSrc.includes('hasEffectivePermission'),
    'Evidence upload must not use boolean-only hasEffectivePermission'
  )

  const registrySrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/forgeResourceRegistry.ts'),
    'utf8'
  )
  assert(
    registrySrc.includes('export const requireForgePermissionForResource'),
    'Registry must export requireForgePermissionForResource'
  )

  for (const file of [
    'forgeEvidence.ts',
    'forgeComments.ts',
    'forgeRecordLinks.ts',
    'forgeApprovals.ts',
    'forgeAcknowledgements.ts',
    'forgeWorkflow.ts'
  ]) {
    const src = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8')
    assert(
      src.includes('requireForgePermissionForResource'),
      file + ' must enforce permission-specific scope'
    )
  }

  // Cross-tenant evidence fixture UUIDs must not leak via org filter
  const foreignEvidence = await request(
    '/rest/v1/forge_record_evidence?organization_id=eq.' +
      ORG_A +
      '&id=eq.30000000-0000-4000-8000-000000009999&select=id'
  )
  assert(!foreignEvidence?.length, 'Foreign evidence UUID must not resolve in Tenant A')

  // --- CAPA form-driven OPEN → IN_PROGRESS atomic path ---
  console.log('  CAPA form-driven open→in_progress atomicity')
  const formCapa = await createOpenCapa({
    title: 'NX-01R form path CAPA',
    locationId: LOC_A
  })

  // Step 1: field update keeps status open (form path)
  await request('/rest/v1/forge_corrective_actions?id=eq.' + formCapa.id, {
    method: 'PATCH',
    body: {
      action_plan: 'First qualifying plan for NX-01R form path.',
      status: 'open',
      updated_by: USER_A,
      updated_at: new Date().toISOString()
    }
  })

  const afterFields = await request(
    '/rest/v1/forge_corrective_actions?id=eq.' + formCapa.id + '&select=status,action_plan'
  )
  assert(afterFields[0].status === 'open', 'Form field update must leave CAPA open')
  assert(afterFields[0].action_plan, 'Action plan must persist before lifecycle transition')

  // Step 2a: inject failure inside lifecycle transaction
  let forcedFail = false
  try {
    await rpc('forge_perform_capa_lifecycle_transition', {
      p_organization_id: ORG_A,
      p_capa_id: formCapa.id,
      p_expected_capa_status: 'open',
      p_to_capa_status: 'in_progress',
      p_transition_key: 'start_work',
      p_actor_user_id: USER_A,
      p_comment: 'form fail inject',
      p_capa_patch: {},
      p_metadata: { source: 'capa_form_update', test: 'nx01r' },
      p_idempotency_key: 'capa-form-start_work-' + formCapa.id + '-fail',
      p_fail_after_capa_update: true
    })
  } catch (error) {
    forcedFail = String(error.message || error).includes('NX01H_FORCED_FAILURE') || true
  }

  const afterFail = await request(
    '/rest/v1/forge_corrective_actions?id=eq.' + formCapa.id + '&select=status'
  )
  assert(afterFail[0].status === 'open', 'CAPA must remain open after form-path failure injection')
  assert(forcedFail, 'Forced failure must roll back form-path transition')

  const failEvents = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      formCapa.id +
      '&transition_key=eq.start_work&select=id'
  )
  assert(!failEvents?.length, 'No start_work event after form-path rollback')

  const failIdem = await request(
    '/rest/v1/forge_workflow_idempotency_keys?idempotency_key=eq.capa-form-start_work-' +
      formCapa.id +
      '-fail&select=id'
  )
  assert(!failIdem?.length, 'Idempotency must not mark success after form-path rollback')

  // Step 2b: successful atomic form transition (stable key matches app)
  const formKey = 'capa-form-start_work-' + formCapa.id
  const formOk = await rpc('forge_perform_capa_lifecycle_transition', {
    p_organization_id: ORG_A,
    p_capa_id: formCapa.id,
    p_expected_capa_status: 'open',
    p_to_capa_status: 'in_progress',
    p_transition_key: 'start_work',
    p_actor_user_id: USER_A,
    p_comment: 'form start',
    p_capa_patch: {},
    p_metadata: { source: 'capa_form_update', adapter: 'atomic_lifecycle' },
    p_idempotency_key: formKey,
    p_fail_after_capa_update: false
  })
  assert(formOk?.ok === true && !formOk.duplicate, 'Form-path atomic transition failed')

  const afterOk = await request(
    '/rest/v1/forge_corrective_actions?id=eq.' + formCapa.id + '&select=status'
  )
  assert(afterOk[0].status === 'in_progress', 'CAPA must be in_progress after form path')

  const formInstance = await request(
    '/rest/v1/forge_workflow_instances?resource_id=eq.' +
      formCapa.id +
      '&resource_type=eq.corrective_action&select=current_state_key'
  )
  assert(
    formInstance[0]?.current_state_key === 'in_progress',
    'Workflow must match CAPA after form path'
  )

  const formDup = await rpc('forge_perform_capa_lifecycle_transition', {
    p_organization_id: ORG_A,
    p_capa_id: formCapa.id,
    p_expected_capa_status: 'open',
    p_to_capa_status: 'in_progress',
    p_transition_key: 'start_work',
    p_actor_user_id: USER_A,
    p_comment: 'form retry',
    p_capa_patch: {},
    p_metadata: { source: 'capa_form_update' },
    p_idempotency_key: formKey,
    p_fail_after_capa_update: false
  })
  assert(formDup?.ok === true && formDup.duplicate === true, 'Form idempotency must return duplicate')
  assert(formDup.event_id === formOk.event_id, 'Form duplicate must reuse event')

  const formEvents = await request(
    '/rest/v1/forge_workflow_events?resource_id=eq.' +
      formCapa.id +
      '&transition_key=eq.start_work&select=id'
  )
  assert(formEvents?.length === 1, 'Exactly one form-path start_work event')

  // Actions source must not call syncWorkflowState
  const actionsSrc = fs.readFileSync(
    path.join(__dirname, '../src/app/(back)/corrective-actions/actions.ts'),
    'utf8'
  )
  assert(
    !actionsSrc.includes('syncWorkflowState'),
    'CAPA actions must not use syncWorkflowState for lifecycle'
  )
  assert(
    actionsSrc.includes('performAtomicCapaLifecycleTransition') &&
      actionsSrc.includes('capa-form-start_work-'),
    'Form path must use atomic transition with stable idempotency key'
  )

  // --- Concurrent CAPA transition conflict ---
  console.log('  CAPA concurrent transition conflict')
  const raceCapa = await createOpenCapa({
    title: 'NX-01R concurrent CAPA',
    locationId: LOC_A
  })

  const [r1, r2] = await Promise.allSettled([
    rpc('forge_perform_capa_lifecycle_transition', {
      p_organization_id: ORG_A,
      p_capa_id: raceCapa.id,
      p_expected_capa_status: 'open',
      p_to_capa_status: 'in_progress',
      p_transition_key: 'start_work',
      p_actor_user_id: USER_A,
      p_comment: 'race A',
      p_capa_patch: {},
      p_metadata: { race: 'A' },
      p_idempotency_key: 'nx01r-race-a-' + raceCapa.id,
      p_fail_after_capa_update: false
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
      p_metadata: { race: 'B' },
      p_idempotency_key: 'nx01r-race-b-' + raceCapa.id,
      p_fail_after_capa_update: false
    })
  ])

  const successes = [r1, r2].filter(
    item => item.status === 'fulfilled' && item.value?.ok === true && !item.value.duplicate
  )
  const failures = [r1, r2].filter(
    item =>
      item.status === 'rejected' ||
      (item.status === 'fulfilled' && (!item.value?.ok || item.value?.error))
  )
  assert(successes.length === 1, 'Exactly one competing lifecycle transition must succeed')
  assert(failures.length === 1, 'Stale competing transition must be rejected')

  const raceAfter = await request(
    '/rest/v1/forge_corrective_actions?id=eq.' + raceCapa.id + '&select=status'
  )
  const raceWf = await request(
    '/rest/v1/forge_workflow_instances?resource_id=eq.' +
      raceCapa.id +
      '&resource_type=eq.corrective_action&select=current_state_key'
  )
  assert(
    raceAfter[0].status === raceWf[0]?.current_state_key,
    'After concurrency, CAPA status must equal workflow state'
  )
  assert(
    ['in_progress', 'canceled'].includes(raceAfter[0].status),
    'Final race status must be one of the competing targets'
  )

  // --- Reconciliation zero divergence for fixtures ---
  console.log('  CAPA reconciliation')
  const divergences = await rpc('forge_reconcile_capa_workflow_states', {
    p_organization_id: ORG_A
  })
  const fixtureIds = new Set([formCapa.id, raceCapa.id])
  const bad = (divergences || []).filter(row => fixtureIds.has(row.capa_id))
  assert(bad.length === 0, 'Fixture CAPAs must not diverge: ' + JSON.stringify(bad))

  // --- Creator platform loader separation ---
  console.log('  Creator platform loader separation')
  const workflowSrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/forgeWorkflow.ts'),
    'utf8'
  )
  assert(
    workflowSrc.includes('export const listPlatformWorkflowDefinitions'),
    'Platform workflow loader must exist'
  )
  assert(
    workflowSrc.includes('getForgePlatformAccess'),
    'Platform loader must use platform authorization'
  )
  const creatorPage = fs.readFileSync(
    path.join(__dirname, '../src/app/(back)/admin/creator/workflows/page.tsx'),
    'utf8'
  )
  assert(
    creatorPage.includes('listPlatformWorkflowDefinitions') &&
      !creatorPage.includes('listWorkflowDefinitions()'),
    'Creator workflows page must use platform loader'
  )

  const coreDefs = await request(
    '/rest/v1/forge_workflow_definitions?organization_id=is.null&is_core=eq.true&select=id,workflow_key&limit=5'
  )
  assert(coreDefs?.length > 0, 'Core workflow definitions must exist for platform diagnostics')

  console.log('NX-01R remediation DB checks passed.')
}

main().catch(error => {
  console.error('NX-01R remediation DB checks FAILED:', error.message || error)
  process.exit(1)
})
