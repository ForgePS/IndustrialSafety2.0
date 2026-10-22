/**
 * NX-02 workflow definition contract checks.
 * Run: node apps/web/tests/nx02-workflows-db.cjs
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

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const EXPECTED = [
  {
    workflow_key: 'observations.lifecycle',
    resource_type: 'observation',
    states: ['draft', 'submitted', 'review', 'action_required', 'no_action', 'closed'],
    transitions: [
      'submit',
      'begin_review',
      'return_for_info',
      'require_action',
      'no_action',
      'close_from_action',
      'close_no_action'
    ]
  },
  {
    workflow_key: 'risk_register.lifecycle',
    resource_type: 'risk_register',
    states: ['draft', 'assessment', 'review', 'active', 'closed'],
    transitions: [
      'submit_assessment',
      'submit_for_review',
      'activate',
      'send_to_review',
      'close',
      'reopen'
    ]
  },
  {
    workflow_key: 'jsa.lifecycle',
    resource_type: 'jsa',
    states: ['draft', 'in_review', 'approved', 'active', 'superseded', 'retired'],
    transitions: [
      'submit',
      'approve',
      'activate',
      'supersede',
      'retire_from_active',
      'retire_from_superseded',
      'retire_from_approved'
    ]
  }
]

async function main() {
  console.log('NX-02 workflow definition checks...')

  for (const expected of EXPECTED) {
    const defs = await request(
      '/rest/v1/forge_workflow_definitions?workflow_key=eq.' +
        expected.workflow_key +
        '&version=eq.1&select=id,organization_id,resource_type,is_core,is_active'
    )
    assert(defs?.length === 1, expected.workflow_key + ' definition missing')
    const def = defs[0]
    assert(def.organization_id === null, expected.workflow_key + ' must be core (null org)')
    assert(def.is_core === true, expected.workflow_key + ' must have is_core=true')
    assert(def.is_active === true, expected.workflow_key + ' must be active')
    assert(
      def.resource_type === expected.resource_type,
      expected.workflow_key + ' resource_type mismatch'
    )

    const states = await request(
      '/rest/v1/forge_workflow_states?workflow_definition_id=eq.' +
        def.id +
        '&select=state_key,is_initial,is_terminal'
    )
    const stateKeys = new Set((states || []).map(item => item.state_key))
    for (const key of expected.states) {
      assert(stateKeys.has(key), expected.workflow_key + ' missing state ' + key)
    }
    const initial = (states || []).filter(item => item.is_initial)
    assert(initial.length === 1, expected.workflow_key + ' must have exactly one initial state')
    assert(initial[0].state_key === 'draft', expected.workflow_key + ' initial state must be draft')

    const transitions = await request(
      '/rest/v1/forge_workflow_transitions?workflow_definition_id=eq.' +
        def.id +
        '&select=transition_key'
    )
    const transitionKeys = new Set((transitions || []).map(item => item.transition_key))
    for (const key of expected.transitions) {
      assert(transitionKeys.has(key), expected.workflow_key + ' missing transition ' + key)
    }

    console.log('  ok', expected.workflow_key)
  }

  const sourceOpts = await request(
    '/rest/v1/forge_lookup_definitions?lookup_key=eq.corrective_actions.source_type&select=id'
  )
  assert(sourceOpts?.[0]?.id, 'corrective_actions.source_type lookup missing')
  const options = await request(
    '/rest/v1/forge_lookup_options?lookup_id=eq.' +
      sourceOpts[0].id +
      '&option_key=in.(observation,jsa,risk)&select=option_key'
  )
  const optionKeys = new Set((options || []).map(item => item.option_key))
  assert(optionKeys.has('observation'), 'CAPA source_type observation missing')
  assert(optionKeys.has('jsa'), 'CAPA source_type jsa missing')
  assert(optionKeys.has('risk'), 'CAPA source_type risk missing')

  console.log('NX-02 workflow definition checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
