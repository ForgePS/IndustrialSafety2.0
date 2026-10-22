/**
 * NX-02 workflow transitions — ensure instance + draft transitions exist.
 * Run: node apps/web/tests/nx02-workflow-transitions-db.cjs
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
    throw new Error(String((data && (data.message || data.error)) || response.status + ' ' + text))
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
  console.log('NX-02 workflow transition checks...')

  const defs = await request(
    '/rest/v1/forge_workflow_definitions?workflow_key=eq.observations.lifecycle&organization_id=is.null&select=id,workflow_key,resource_type,version'
  )
  assert(defs?.[0]?.id, 'observations.lifecycle definition must exist')
  const defId = defs[0].id

  const draftTransitions = await request(
    '/rest/v1/forge_workflow_transitions?workflow_definition_id=eq.' +
      defId +
      '&from_state_key=eq.draft&select=transition_key,to_state_key,required_permission'
  )
  const keys = new Set((draftTransitions || []).map(item => item.transition_key))
  assert(keys.has('submit'), 'draft must allow submit transition')

  const observationNumber = await rpc('next_forge_observation_number', {
    p_organization_id: ORG_A
  })
  assert(
    typeof observationNumber === 'string' && observationNumber.startsWith('OBS-'),
    'Must allocate observation number'
  )

  const [observation] = await request('/rest/v1/forge_observations', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      observation_number: observationNumber,
      title: 'NX-02 workflow transition draft',
      description: 'Service-role observation for workflow instance/transition contract.',
      observation_type: 'UNSAFE',
      reporting_mode: 'named',
      status: 'draft',
      reported_by_user_id: USER_A,
      created_by: USER_A,
      updated_by: USER_A,
      occurred_at: new Date().toISOString()
    }
  })
  assert(observation?.id, 'Observation insert must return id')
  assert(observation.status === 'draft', 'Observation must start in draft')

  const [instance] = await request('/rest/v1/forge_workflow_instances', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      workflow_definition_id: defId,
      workflow_version: defs[0].version || 1,
      resource_type: 'observation',
      resource_id: observation.id,
      current_state_key: 'draft'
    }
  })
  assert(instance?.id, 'Workflow instance must be creatable for observation')
  assert(instance.current_state_key === 'draft', 'Instance must initialize at draft')

  const allowedFromDraft = (draftTransitions || []).filter(
    item => item.from_state_key === 'draft' || !item.from_state_key
  )
  assert(
    allowedFromDraft.some(item => item.transition_key === 'submit'),
    'Submit must be available from draft for ensured instance'
  )

  // Domain status update path (service-role stand-in for adapter step 3)
  const [updated] = await request(
    '/rest/v1/forge_observations?id=eq.' + observation.id + '&organization_id=eq.' + ORG_A,
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        updated_by: USER_A,
        row_version: Number(observation.row_version || 1) + 1
      }
    }
  )
  assert(updated?.status === 'submitted', 'Observation status update path must work')

  const [advanced] = await request(
    '/rest/v1/forge_workflow_instances?id=eq.' + instance.id,
    {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        current_state_key: 'submitted'
      }
    }
  )
  assert(advanced?.current_state_key === 'submitted', 'Workflow instance must advance with domain')

  console.log('NX-02 workflow transition checks passed.')
  console.log(
    JSON.stringify(
      {
        observation_id: observation.id,
        observation_number: observationNumber,
        instance_id: instance.id,
        draft_transitions: [...keys]
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
