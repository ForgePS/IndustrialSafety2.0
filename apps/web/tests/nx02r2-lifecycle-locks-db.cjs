/**
 * NX-02R2 — lifecycle locks and execution binding (Codex review of PR #8, round 2).
 *  - closed observations are immutable (RPC + direct update denied; archive still allowed)
 *  - closed risks are immutable until reopen (fields, review, acceptance, controls, treatments)
 *  - crew cannot be added to active / completed / canceled executions (planned/briefing/stopped ok)
 *  - execution mutations and acknowledgements are bound to the authorized JSA (source asserts;
 *    end-to-end replay proof lives in nx02r-jsa-execution.spec.cjs)
 * Run: node apps/web/tests/nx02r2-lifecycle-locks-db.cjs
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:35421'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const ORG_A = '20000000-0000-4000-8000-000000000100'
const USER_A = '20000000-0000-4000-8000-000000000001'
const LOC_A = '20000000-0000-4000-8000-000000000300'
const PERSON_A = '20000000-0000-4000-8000-000000000600'

async function request(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

const rpc = (name, args) => request('POST', '/rest/v1/rpc/' + name, args)
const first = data => (Array.isArray(data) ? data[0] : data)
const stamp = () => Date.now() + '-' + Math.floor(Math.random() * 100000)

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function assertDenied(result, pattern, label) {
  const text = JSON.stringify(result.data || '')
  const denied = !result.ok || result.data?.ok === false
  assert(denied, label + ' must be DENIED, got ' + result.status + ' ' + text)
  assert(pattern.test(text), label + ' must cite the lock rule, got ' + text)
  console.log('  ' + label + ' DENY')
}

async function getRow(table, id) {
  const { data } = await request('GET', `/rest/v1/${table}?id=eq.${id}&select=*`)
  return first(data)
}

async function observationLocks() {
  const created = await request('POST', '/rest/v1/forge_observations', {
    organization_id: ORG_A,
    observation_number: 'OBS-NX02R2-' + stamp(),
    status: 'draft',
    title: 'NX-02R2 closed observation',
    description: 'Closed observations must be immutable.',
    location_id: LOC_A,
    created_by: USER_A
  })
  assert(created.ok, 'observation fixture insert failed ' + JSON.stringify(created.data))
  const obs = first(created.data)

  const closed = await request('PATCH', `/rest/v1/forge_observations?id=eq.${obs.id}`, {
    status: 'closed',
    closed_at: new Date().toISOString(),
    closure_summary: 'Closed for NX-02R2 lock test.'
  })
  assert(closed.ok, 'closing fixture (status change) must be allowed ' + JSON.stringify(closed.data))
  const closedRow = first(closed.data)

  assertDenied(
    await rpc('forge_update_observation_transactionally', {
      p_organization_id: ORG_A,
      p_observation_id: obs.id,
      p_expected_row_version: Number(closedRow.row_version),
      p_actor_user_id: USER_A,
      p_fields: { title: 'Rewritten after close' }
    }),
    /Closed observations are read-only/,
    'closed observation transactional update'
  )

  assertDenied(
    await request('PATCH', `/rest/v1/forge_observations?id=eq.${obs.id}`, {
      description: 'Direct rewrite'
    }),
    /Closed observations are read-only/,
    'closed observation direct description update'
  )

  const after = await getRow('forge_observations', obs.id)
  assert(after.title === 'NX-02R2 closed observation', 'closed observation title must be unchanged')

  const archived = await request('PATCH', `/rest/v1/forge_observations?id=eq.${obs.id}`, {
    archived_at: new Date().toISOString(),
    archived_by: USER_A
  })
  assert(archived.ok, 'archiving a closed observation must remain allowed ' + JSON.stringify(archived.data))
  console.log('  closed observation archive ALLOW')
}

async function riskLocks() {
  const created = await request('POST', '/rest/v1/forge_risks', {
    organization_id: ORG_A,
    risk_number: 'RSK-NX02R2-' + stamp(),
    status: 'draft',
    title: 'NX-02R2 closed risk',
    description: 'Closed risks must be immutable until reopened.',
    location_id: LOC_A,
    created_by: USER_A
  })
  assert(created.ok, 'risk fixture insert failed ' + JSON.stringify(created.data))
  const risk = first(created.data)

  const closed = await request('PATCH', `/rest/v1/forge_risks?id=eq.${risk.id}`, {
    status: 'closed',
    closed_at: new Date().toISOString(),
    closure_summary: 'Closed for NX-02R2 lock test.'
  })
  assert(closed.ok, 'closing fixture (status change) must be allowed ' + JSON.stringify(closed.data))
  const version = Number(first(closed.data).row_version)
  const lockPattern = /Closed risks are read-only/

  assertDenied(
    await request('PATCH', `/rest/v1/forge_risks?id=eq.${risk.id}`, { title: 'Rewritten after close' }),
    lockPattern,
    'closed risk field update'
  )
  assertDenied(
    await request('PATCH', `/rest/v1/forge_risks?id=eq.${risk.id}`, {
      inherent_likelihood_key: 'likely',
      inherent_score: 20
    }),
    lockPattern,
    'closed risk assessment update'
  )
  assertDenied(
    await rpc('forge_create_risk_review', {
      p_organization_id: ORG_A,
      p_risk_id: risk.id,
      p_expected_row_version: version,
      p_actor_user_id: USER_A,
      p_review_notes: 'Review on closed risk',
      p_next_review_at: new Date(Date.now() + 86400000).toISOString()
    }),
    lockPattern,
    'closed risk review snapshot'
  )
  assertDenied(
    await rpc('forge_accept_risk', {
      p_organization_id: ORG_A,
      p_risk_id: risk.id,
      p_expected_row_version: version,
      p_actor_user_id: USER_A,
      p_acceptance_comment: 'Accepting a closed risk should be blocked.'
    }),
    lockPattern,
    'closed risk acceptance'
  )
  assertDenied(
    await request('POST', '/rest/v1/forge_risk_controls', {
      organization_id: ORG_A,
      risk_id: risk.id,
      control_type: 'engineering',
      title: 'Control on closed risk',
      created_by: USER_A
    }),
    lockPattern,
    'closed risk control insert'
  )
  assertDenied(
    await request('POST', '/rest/v1/forge_risk_treatments', {
      organization_id: ORG_A,
      risk_id: risk.id,
      title: 'Treatment on closed risk',
      created_by: USER_A
    }),
    lockPattern,
    'closed risk treatment insert'
  )

  const { data: reviews } = await request(
    'GET',
    `/rest/v1/forge_risk_reviews?risk_id=eq.${risk.id}&select=id`
  )
  assert(Array.isArray(reviews) && reviews.length === 0, 'no review snapshot may exist on closed risk')
  const after = await getRow('forge_risks', risk.id)
  assert(after.title === 'NX-02R2 closed risk' && !after.accepted_at, 'closed risk must be unchanged')

  // Reopen (status leaves closed) unlocks the record again.
  const reopened = await request('PATCH', `/rest/v1/forge_risks?id=eq.${risk.id}`, {
    status: 'review',
    closed_at: null,
    closure_summary: null
  })
  assert(reopened.ok, 'reopen status change must be allowed ' + JSON.stringify(reopened.data))
  const edited = await request('PATCH', `/rest/v1/forge_risks?id=eq.${risk.id}`, {
    title: 'NX-02R2 reopened risk'
  })
  assert(edited.ok, 'reopened risk must be editable ' + JSON.stringify(edited.data))
  const control = await request('POST', '/rest/v1/forge_risk_controls', {
    organization_id: ORG_A,
    risk_id: risk.id,
    control_type: 'engineering',
    title: 'Control after reopen',
    created_by: USER_A
  })
  assert(control.ok, 'reopened risk must accept controls ' + JSON.stringify(control.data))
  console.log('  reopened risk edit + control ALLOW')
}

async function crewWindow() {
  const jsa = await request('POST', '/rest/v1/forge_jsas', {
    organization_id: ORG_A,
    jsa_number: 'JSA-NX02R2-' + stamp(),
    title: 'NX-02R2 crew window',
    status: 'draft',
    version: 1,
    location_id: LOC_A,
    created_by: USER_A,
    updated_by: USER_A
  })
  assert(jsa.ok, 'jsa fixture insert failed ' + JSON.stringify(jsa.data))
  const jsaRow = first(jsa.data)

  for (const status of ['active', 'completed', 'canceled', 'planned', 'briefing', 'stopped']) {
    const execution = await request('POST', '/rest/v1/forge_jsa_executions', {
      organization_id: ORG_A,
      jsa_id: jsaRow.id,
      execution_number: 'EXE-NX02R2-' + status + '-' + stamp(),
      status,
      location_id: LOC_A,
      created_by: USER_A
    })
    assert(execution.ok, 'execution fixture (' + status + ') failed ' + JSON.stringify(execution.data))
    const execRow = first(execution.data)
    const insert = await request('POST', '/rest/v1/forge_jsa_execution_participants', {
      organization_id: ORG_A,
      execution_id: execRow.id,
      personnel_id: PERSON_A,
      role: 'crew',
      requires_acknowledgement: true
    })
    if (['planned', 'briefing', 'stopped'].includes(status)) {
      assert(insert.ok, 'crew add on ' + status + ' must be allowed ' + JSON.stringify(insert.data))
      console.log('  crew add on ' + status + ' ALLOW')
    } else {
      assertDenied(insert, /Crew can only be added/, 'crew add on ' + status)
    }
  }
}

function sourceAsserts() {
  const actions = fs.readFileSync(path.join(__dirname, '../src/app/(back)/jsas/actions.ts'), 'utf8')
  const lib = fs.readFileSync(path.join(__dirname, '../src/lib/forgeJsa.ts'), 'utf8')

  for (const fn of [
    'addExecutionParticipantAction',
    'removeExecutionParticipantAction',
    'transitionExecutionAction',
    'completeExecutionAction'
  ]) {
    const body = actions.split('export const ' + fn)[1]?.split('\nexport const ')[0] || ''
    assert(/loadScopedExecution\(/.test(body), fn + ' must bind the execution via loadScopedExecution')
  }
  const ackBody =
    actions.split('export const acknowledgeParticipantAction')[1]?.split('\nexport const ')[0] || ''
  assert(
    /resourceId:\s*execution\.jsa_id/.test(ackBody) && /\.eq\('jsa_id', jsaId\)/.test(ackBody),
    'acknowledgement evidence must use the execution parent jsa_id'
  )
  for (const fn of [
    'addExecutionParticipant',
    'removeExecutionParticipant',
    'acknowledgeParticipant',
    'completeExecution'
  ]) {
    const body = lib.split('export const ' + fn + ' = ')[1]?.split('\nexport const ')[0] || ''
    assert(/\.eq\('jsa_id', jsaId\)/.test(body), fn + ' must scope the execution query by jsa_id')
  }
  assert(
    /JSA_EXECUTION_CREW_EDITABLE_STATUSES/.test(lib),
    'addExecutionParticipant must enforce the crew-editable status window'
  )
  console.log('  execution binding + crew window source asserts OK')
}

async function main() {
  console.log('NX-02R2 lifecycle locks DB checks...')
  sourceAsserts()
  await observationLocks()
  await riskLocks()
  await crewWindow()
  console.log('NX-02R2 lifecycle locks DB checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
