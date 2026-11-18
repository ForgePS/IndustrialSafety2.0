/**
 * Forge AI Command Center stage 4 database regression (local Supabase, after `supabase db reset`):
 *  - recommendations and their events are closed to clients;
 *  - the permissions, the recommendations tool and the corrective action AI action are registered,
 *    and the action is enabled for the demo tenant;
 *  - a recommendation follows its linked approval (pending, executing, executed, failed,
 *    rejected, expired) and every change is logged;
 *  - the event log is append-only, and only one live recommendation exists per condition.
 * Run: node apps/web/tests/forge-ai-recommendations-db.cjs
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

if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase URL, anon key or service role key.')
  process.exit(1)
}

const CYPRESS = '20000000-0000-4000-8000-000000000100'
const MAIN_PLANT = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString(36)

async function call(pathname, { key = SERVICE_ROLE_KEY, bearer = key, method = 'GET', body, prefer = 'return=representation' } = {}) {
  const response = await fetch(API_URL + pathname, {
    method,
    headers: { apikey: key, Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json', Prefer: prefer },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  let data = null

  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }

  return { ok: response.ok, status: response.status, data }
}

async function must(pathname, options) {
  const result = await call(pathname, options)

  if (!result.ok) throw new Error(pathname + ' failed: ' + result.status + ' ' + JSON.stringify(result.data))

  return result.data
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()

  if (!data.access_token) throw new Error('Sign-in failed for ' + email)

  return data.access_token
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
  console.log('  ok - ' + message)
}

const recommendation = (suffix, overrides = {}) => ({
  organization_id: CYPRESS,
  recommendation_key: `dbtest:${RUN}:${suffix}`,
  kind: 'corrective_action',
  title: 'DB test recommendation ' + suffix,
  rationale: 'Database regression probe.',
  priority: 'high',
  source_type: 'watch_alert',
  rule_key: 'inspection.failed',
  location_id: MAIN_PLANT,
  evidence: [],
  proposed_action: { action_key: 'corrective_action.create', payload: { title: 'Probe' } },
  verification_criteria: [{ type: 'action_completed' }],
  ...overrides
})

const approval = () => ({
  organization_id: CYPRESS,
  requested_by: ADMIN,
  action_key: 'corrective_action.create',
  target_type: 'organization',
  target_id: CYPRESS,
  request_payload: { title: 'Probe' },
  status: 'pending',
  approval_expires_at: new Date(Date.now() + 3_600_000).toISOString()
})

async function linked(suffix) {
  const [rec] = await must('/rest/v1/forge_ai_recommendations', { method: 'POST', body: recommendation(suffix, { status: 'in_review' }) })
  const [request] = await must('/rest/v1/forge_ai_action_approvals', { method: 'POST', body: approval() })

  await must(`/rest/v1/forge_ai_recommendations?id=eq.${rec.id}`, { method: 'PATCH', body: { action_approval_id: request.id }, prefer: 'return=minimal' })

  return { rec, request }
}

const setApproval = (id, body) => must(`/rest/v1/forge_ai_action_approvals?id=eq.${id}`, { method: 'PATCH', body, prefer: 'return=minimal' })
const getRec = async id => (await must(`/rest/v1/forge_ai_recommendations?id=eq.${id}&select=*`))[0]
const getEvents = id => must(`/rest/v1/forge_ai_recommendation_events?recommendation_id=eq.${id}&select=id,event_type,from_status,to_status,actor_type,actor_user_id,detail&order=id`)

async function main() {
  console.log('Forge AI Command Center recommendations (database)...')

  const token = await signIn('admin@forge2.local')

  for (const table of ['forge_ai_recommendations', 'forge_ai_recommendation_events']) {
    for (const [label, options] of [['anonymous', { key: ANON_KEY }], ['signed-in', { key: ANON_KEY, bearer: token }]]) {
      const read = await call(`/rest/v1/${table}?select=*&limit=1`, options)

      assert(!read.ok || (Array.isArray(read.data) && read.data.length === 0), `${label} clients cannot read ${table}`)
    }
  }

  const write = await call('/rest/v1/forge_ai_recommendations', { key: ANON_KEY, bearer: token, method: 'POST', body: recommendation('client') })
  assert(!write.ok, 'signed-in clients cannot create recommendations directly')

  for (const fn of ['forge_ai_recommendation_follow_approval', 'forge_ai_recommendation_events_append_only']) {
    const rpc = await call('/rest/v1/rpc/' + fn, { key: ANON_KEY, bearer: token, method: 'POST', body: {} })
    assert(!rpc.ok, `${fn} cannot be called by clients`)
  }

  const permissions = await must('/rest/v1/forge_permission_registry?permission_key=in.(forge_ai.view_recommendations,forge_ai.review_recommendations)&select=permission_key,default_scope')
  assert(permissions.length === 2 && permissions.every(item => item.default_scope === 'location'), 'both recommendation permissions are registered and location-scoped by default')

  const [capability] = await must('/rest/v1/forge_ai_capabilities?capability_key=eq.get_recommendations&select=required_permission_key,capability_type')
  assert(capability?.required_permission_key === 'forge_ai.view_recommendations' && capability.capability_type === 'read', 'the recommendations tool is read-only and needs forge_ai.view_recommendations')

  const [action] = await must('/rest/v1/forge_ai_action_registry?action_key=eq.corrective_action.create&select=id,required_permission_key,requires_approval,target_type')
  assert(action?.required_permission_key === 'corrective_actions.create' && action.requires_approval, 'the corrective action AI action needs approval and corrective_actions.create')

  const enabled = await must(`/rest/v1/forge_ai_tenant_actions?organization_id=eq.${CYPRESS}&action_id=eq.${action.id}&enabled=eq.true&select=action_id`)
  assert(enabled.length === 1, 'the corrective action AI action is enabled for the demo tenant')

  const missingCriteria = await call('/rest/v1/forge_ai_recommendations', { method: 'POST', body: recommendation('bad', { source_type: 'risk_assessment', rule_key: null }) })
  assert(!missingCriteria.ok, 'a risk recommendation must name its factor and scope')

  const created = []
  const approvals = []

  try {
    // Approval to execution.
    const first = await linked('exec')
    created.push(first.rec.id)
    approvals.push(first.request.id)

    await setApproval(first.request.id, { status: 'executing', approved_by: ADMIN, approved_at: new Date().toISOString() })
    assert((await getRec(first.rec.id)).status === 'executing', 'an approval that starts running moves its recommendation to executing')

    const executedAt = new Date().toISOString()
    await setApproval(first.request.id, {
      status: 'executed',
      executed_at: executedAt,
      execution_result: { entity_type: 'corrective_action', entity_id: '00000000-0000-4000-8000-00000000c0a1', message: 'ok' }
    })

    const executed = await getRec(first.rec.id)
    const dueDays = (new Date(executed.verification_due_at).getTime() - new Date(executed.executed_at).getTime()) / 86_400_000
    assert(executed.status === 'executed' && executed.result_entity_type === 'corrective_action', 'an executed approval records the created record on the recommendation')
    assert(Math.round(dueDays) === 14, 'verification is due 14 days after execution')

    let events = await getEvents(first.rec.id)
    assert(
      events.map(event => event.event_type).join() === 'approval.executing,approval.executed' &&
        events[1].from_status === 'executing' &&
        events[1].to_status === 'executed' &&
        events[1].actor_user_id === ADMIN &&
        events[1].detail.result.entity_type === 'corrective_action',
      'each approval change is logged with its actor and result'
    )

    await setApproval(first.request.id, { updated_at: new Date().toISOString() })
    assert((await getEvents(first.rec.id)).length === 2, 'approval edits that do not change status log nothing')

    // Append-only history.
    const patched = await call(`/rest/v1/forge_ai_recommendation_events?id=eq.${events[0].id}`, { method: 'PATCH', body: { event_type: 'tampered' } })
    assert(!patched.ok, 'recommendation events cannot be edited')

    const deleted = await call(`/rest/v1/forge_ai_recommendation_events?id=eq.${events[0].id}`, { method: 'DELETE' })
    assert(!deleted.ok, 'recommendation events cannot be deleted')

    events = await getEvents(first.rec.id)
    assert(events[0].event_type === 'approval.executing', 'the history is unchanged')

    // Deleting a user who appears in the history clears their id; nothing else may change.
    const actor = await must('/auth/v1/admin/users', {
      method: 'POST',
      body: { email: `rec-history-${RUN}@forge2.local`, password: 'ForgeDev2!' + RUN, email_confirm: true }
    })
    const [actorEvent] = await must('/rest/v1/forge_ai_recommendation_events', {
      method: 'POST',
      body: { organization_id: CYPRESS, recommendation_id: first.rec.id, event_type: 'reviewed', actor_type: 'user', actor_user_id: actor.id }
    })
    const reassigned = await call(`/rest/v1/forge_ai_recommendation_events?id=eq.${actorEvent.id}`, { method: 'PATCH', body: { actor_user_id: ADMIN } })

    assert(!reassigned.ok, 'an event cannot be re-attributed to another user')

    const removed = await call('/auth/v1/admin/users/' + actor.id, { method: 'DELETE' })

    assert(removed.ok, 'a user named in recommendation history can still be deleted')
    const [cleared] = await must(`/rest/v1/forge_ai_recommendation_events?id=eq.${actorEvent.id}&select=actor_user_id,event_type`)

    assert(cleared.actor_user_id === null && cleared.event_type === 'reviewed', 'the deleted user is cleared from the event and the event is kept')

    // Rejection.
    const second = await linked('reject')
    created.push(second.rec.id)
    approvals.push(second.request.id)

    await setApproval(second.request.id, { status: 'rejected', rejected_by: ADMIN, rejected_at: new Date().toISOString(), rejection_reason: 'Already covered by CA-1' })
    const rejected = await getRec(second.rec.id)
    assert(rejected.status === 'rejected' && rejected.review_note === 'Already covered by CA-1' && rejected.reviewed_by === ADMIN, 'a rejected approval rejects its recommendation with the reason')

    // Expiry returns the recommendation to the queue.
    const third = await linked('expire')
    created.push(third.rec.id)
    approvals.push(third.request.id)

    await setApproval(third.request.id, { status: 'expired' })
    const expired = await getRec(third.rec.id)
    assert(expired.status === 'proposed' && expired.action_approval_id === null, 'an expired approval returns the recommendation to proposed, unlinked')

    const [expiryEvent] = await getEvents(third.rec.id)
    assert(expiryEvent.actor_type === 'system', 'an expiry is logged as a system change')

    // Failure.
    const fourth = await linked('fail')
    created.push(fourth.rec.id)
    approvals.push(fourth.request.id)

    await setApproval(fourth.request.id, { status: 'failed', execution_result: { error: 'Scope check failed' } })
    assert((await getRec(fourth.rec.id)).status === 'failed', 'a failed execution fails the recommendation')

    // One live recommendation per condition.
    const [live] = await must('/rest/v1/forge_ai_recommendations', { method: 'POST', body: recommendation('dup') })
    created.push(live.id)

    const duplicate = await call('/rest/v1/forge_ai_recommendations', { method: 'POST', body: recommendation('dup') })
    assert(!duplicate.ok && duplicate.data?.code === '23505', 'a second live recommendation for the same condition is refused')

    await must(`/rest/v1/forge_ai_recommendations?id=eq.${live.id}`, { method: 'PATCH', body: { status: 'dismissed' }, prefer: 'return=minimal' })
    const [again] = await must('/rest/v1/forge_ai_recommendations', { method: 'POST', body: recommendation('dup') })
    created.push(again.id)
    assert(Boolean(again.id), 'once the first is closed, the condition can be recommended again')

    const approvalReuse = await call(`/rest/v1/forge_ai_recommendations?id=eq.${again.id}`, { method: 'PATCH', body: { action_approval_id: first.request.id } })
    assert(!approvalReuse.ok, 'an approval belongs to at most one recommendation')
  } finally {
    for (const id of created) {
      await call(`/rest/v1/forge_ai_recommendations?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    }

    for (const id of approvals) {
      await call(`/rest/v1/forge_ai_action_approvals?id=eq.${id}`, { method: 'DELETE', prefer: 'return=minimal' })
    }
  }

  const leftovers = await must(`/rest/v1/forge_ai_recommendation_events?detail->>approval_id=in.(${approvals.join(',') || 'none'})&select=id`).catch(() => [])
  assert(leftovers.length === 0, 'deleting a recommendation removes its history with it')

  console.log('Forge AI Command Center recommendations database checks passed.')
}

main().catch(error => {
  console.error('FAILED:', error.message)
  process.exit(1)
})
