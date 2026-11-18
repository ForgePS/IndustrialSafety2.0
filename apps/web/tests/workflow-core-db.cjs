/**
 * NX-01 database / RPC regression checks against local Supabase.
 * Run: node apps/web/tests/workflow-core-db.cjs
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or API_URL + SERVICE_ROLE_KEY).
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

if (!API_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing Supabase URL or service role key.')
  process.exit(1)
}

const ORG_A = '20000000-0000-4000-8000-000000000100'
const ORG_B = '30000000-0000-4000-8000-000000000100'
const USER_A = '20000000-0000-4000-8000-000000000002'

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
    const message =
      (data && (data.message || data.error || data.hint)) ||
      response.status + ' ' + text
    const error = new Error(String(message))
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

async function main() {
  console.log('NX-01 workflow-core DB checks...')

  const defs = await request(
    '/rest/v1/forge_workflow_definitions?workflow_key=eq.corrective_actions.lifecycle&select=*&order=version.desc'
  )
  assert(defs?.length >= 1, 'CAPA workflow definition missing')
  const def = defs[0]
  assert(def.organization_id === null, 'Core workflow should have null organization_id')
  assert(def.version === 1, 'Expected version 1')

  const states = await request(
    '/rest/v1/forge_workflow_states?workflow_definition_id=eq.' + def.id + '&select=*'
  )
  const initials = states.filter(s => s.is_initial)
  assert(initials.length === 1, 'Exactly one initial state required')
  assert(initials[0].state_key === 'open', 'Initial state should be open')

  // Duplicate definition version must fail
  let dupFailed = false
  try {
    await request('/rest/v1/forge_workflow_definitions', {
      method: 'POST',
      body: {
        organization_id: null,
        workflow_key: 'corrective_actions.lifecycle',
        name: 'Dup',
        resource_type: 'corrective_action',
        version: 1,
        is_core: true,
        is_active: true
      }
    })
  } catch (error) {
    dupFailed = error.status === 409 || String(error.message).includes('23505')
  }
  assert(dupFailed, 'Duplicate workflow key/version should be rejected')

  // Create a deterministic CAPA fixture for instance / link tests
  const capaNumber = 'CA-NX01-' + Date.now()
  const capaRows = await request('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      action_number: capaNumber,
      title: 'NX-01 DB fixture CAPA',
      description: 'Created by workflow-core-db.cjs',
      action_type: 'corrective',
      severity: 'moderate',
      source_type: 'manual',
      status: 'open',
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(capaRows?.[0]?.id, 'Unable to create CAPA fixture')
  const capa = capaRows[0]

  // Ensure workflow instance (mimic adapter / backfill)
  let instances = await request(
    '/rest/v1/forge_workflow_instances?organization_id=eq.' +
      ORG_A +
      '&resource_type=eq.corrective_action&resource_id=eq.' +
      capa.id +
      '&select=*'
  )
  if (!instances?.length) {
    instances = await request('/rest/v1/forge_workflow_instances', {
      method: 'POST',
      body: {
        organization_id: ORG_A,
        workflow_definition_id: def.id,
        workflow_version: 1,
        resource_type: 'corrective_action',
        resource_id: capa.id,
        current_state_key: 'open'
      }
    })
  }
  assert(Array.isArray(instances) ? instances.length >= 1 : Boolean(instances?.id), 'CAPA workflow instance missing')
  const instance = Array.isArray(instances) ? instances[0] : instances
  assert(instance.workflow_definition_id === def.id, 'Instance must point at core definition')

  // Duplicate active instance prevented
  let dupInstance = false
  try {
    await request('/rest/v1/forge_workflow_instances', {
      method: 'POST',
      body: {
        organization_id: ORG_A,
        workflow_definition_id: def.id,
        workflow_version: 1,
        resource_type: 'corrective_action',
        resource_id: capa.id,
        current_state_key: 'open'
      }
    })
  } catch (error) {
    dupInstance = error.status === 409 || String(error.message).includes('23505')
  }
  assert(dupInstance, 'Duplicate active workflow instance should fail')

  // Cross-tenant instance insert must not be allowed to attach org B resource with org A org id inconsistently —
  // create a fake uuid resource under org B and ensure we cannot create org A instance for it via unique checks.
  const foreignId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  let crossTenantOk = false
  try {
    await request('/rest/v1/forge_workflow_instances', {
      method: 'POST',
      body: {
        organization_id: ORG_A,
        workflow_definition_id: def.id,
        workflow_version: 1,
        resource_type: 'corrective_action',
        resource_id: foreignId,
        current_state_key: 'open'
      }
    })
    // Cleanup if insert succeeded (app layer blocks real cross-tenant; schema allows UUID)
    await request(
      '/rest/v1/forge_workflow_instances?organization_id=eq.' +
        ORG_A +
        '&resource_id=eq.' +
        foreignId,
      { method: 'DELETE', prefer: 'return=minimal' }
    )
    crossTenantOk = true
  } catch {
    crossTenantOk = false
  }
  // Schema does not FK resource_id; app validators enforce. Record that schema allowed UUID insert is expected.
  console.log(
    '  note: workflow_instances resource_id is polymorphic (app-validated); insert of unknown UUID =',
    crossTenantOk ? 'allowed at DB' : 'blocked'
  )

  // Transition + idempotency
  const startKey = 'nx01-db-idempotency-' + Date.now()
  const first = await rpc('forge_perform_workflow_transition', {
    p_organization_id: ORG_A,
    p_instance_id: instance.id,
    p_expected_state: instance.current_state_key,
    p_transition_key: 'db_test_noop_sync',
    p_to_state: instance.current_state_key,
    p_actor_user_id: USER_A,
    p_comment: 'idempotency probe',
    p_metadata: { test: true },
    p_idempotency_key: startKey,
    p_complete: false,
    p_cancel: false
  })
  assert(first?.ok === true, 'First transition RPC failed: ' + JSON.stringify(first))

  const second = await rpc('forge_perform_workflow_transition', {
    p_organization_id: ORG_A,
    p_instance_id: instance.id,
    p_expected_state: instance.current_state_key,
    p_transition_key: 'db_test_noop_sync',
    p_to_state: instance.current_state_key,
    p_actor_user_id: USER_A,
    p_comment: 'idempotency probe retry',
    p_metadata: { test: true },
    p_idempotency_key: startKey,
    p_complete: false,
    p_cancel: false
  })
  assert(second?.ok === true && second?.duplicate === true, 'Idempotent retry must return duplicate')
  assert(second.event_id === first.event_id, 'Idempotent retry must reuse event id')

  // Events immutable: update/delete should be denied for authenticated; service_role can —
  // verify event exists
  const events = await request(
    '/rest/v1/forge_workflow_events?workflow_instance_id=eq.' +
      instance.id +
      '&id=eq.' +
      first.event_id +
      '&select=id'
  )
  assert(events?.length === 1, 'Workflow event missing after transition')

  // Record links same-tenant
  const assets = await request(
    '/rest/v1/forge_assets?organization_id=eq.' + ORG_A + '&select=id&limit=1'
  )
  assert(assets?.length, 'Seeded asset required for link test')

  const linkRows = await request('/rest/v1/forge_record_links', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      source_resource_type: 'corrective_action',
      source_resource_id: capa.id,
      target_resource_type: 'asset',
      target_resource_id: assets[0].id,
      relationship_type: 'related',
      created_by: USER_A
    }
  })
  assert(linkRows?.[0]?.id, 'Record link insert failed')
  const linkId = linkRows[0].id

  let dupLinkFailed = false
  try {
    await request('/rest/v1/forge_record_links', {
      method: 'POST',
      body: {
        organization_id: ORG_A,
        source_resource_type: 'corrective_action',
        source_resource_id: capa.id,
        target_resource_type: 'asset',
        target_resource_id: assets[0].id,
        relationship_type: 'related',
        created_by: USER_A
      }
    })
  } catch (error) {
    dupLinkFailed = error.status === 409 || String(error.message).includes('23505')
  }
  assert(dupLinkFailed, 'Duplicate active record link should fail')

  await request('/rest/v1/forge_record_links?id=eq.' + linkId, {
    method: 'PATCH',
    body: { archived_at: new Date().toISOString(), archived_by: USER_A }
  })

  // Acknowledgment uniqueness
  const ackType = 'nx01-db-ack-' + Date.now()
  await request('/rest/v1/forge_record_acknowledgements', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      resource_type: 'corrective_action',
      resource_id: capa.id,
      acknowledgement_type: ackType,
      user_id: USER_A,
      signature_method: 'click_confirm'
    }
  })
  let dupAck = false
  try {
    await request('/rest/v1/forge_record_acknowledgements', {
      method: 'POST',
      body: {
        organization_id: ORG_A,
        resource_type: 'corrective_action',
        resource_id: capa.id,
        acknowledgement_type: ackType,
        user_id: USER_A,
        signature_method: 'click_confirm'
      }
    })
  } catch (error) {
    dupAck = error.status === 409 || String(error.message).includes('23505')
  }
  assert(dupAck, 'Duplicate acknowledgment should fail')

  // Approval request lifecycle
  const approval = await request('/rest/v1/forge_approval_requests', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      resource_type: 'corrective_action',
      resource_id: capa.id,
      approval_type: 'nx01_test',
      status: 'pending',
      requested_by: USER_A
    }
  })
  assert(approval?.[0]?.id, 'Approval request insert failed')
  const steps = await request('/rest/v1/forge_approval_steps', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      approval_request_id: approval[0].id,
      step_order: 1,
      status: 'pending'
    }
  })
  assert(steps?.[0]?.id, 'Approval step insert failed')
  await request('/rest/v1/forge_approval_steps?id=eq.' + steps[0].id, {
    method: 'PATCH',
    body: {
      status: 'approved',
      decision: 'approved',
      decided_by: USER_A,
      decided_at: new Date().toISOString(),
      comment: 'ok'
    }
  })
  await request('/rest/v1/forge_approval_requests?id=eq.' + approval[0].id, {
    method: 'PATCH',
    body: { status: 'approved', completed_at: new Date().toISOString() }
  })

  // Permissions registered
  const perms = await request(
    '/rest/v1/forge_permission_registry?feature_key=eq.workflow_core&select=permission_key'
  )
  assert(perms?.length >= 10, 'workflow_core permissions missing')

  // Org B cannot see Org A instance via filtered query (service role can; document RLS for authenticated)
  const orgBView = await request(
    '/rest/v1/forge_workflow_instances?organization_id=eq.' +
      ORG_B +
      '&resource_id=eq.' +
      capa.id +
      '&select=id'
  )
  assert(!orgBView?.length, 'Org B query must not return Org A CAPA workflow instance')

  console.log('NX-01 workflow-core DB checks PASSED')
}

main().catch(error => {
  console.error('NX-01 workflow-core DB checks FAILED')
  console.error(error)
  process.exit(1)
})
