/**
 * NX-02H Forge AI — capability registry + draft_jsa action registration.
 * Run: node apps/web/tests/nx02h-ai-capabilities-db.cjs
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

async function main() {
  console.log('NX-02H AI capability checks...')

  const required = [
    ['search_observations', 'observations.view', 'read'],
    ['analyze_observations', 'observations.view', 'read'],
    ['search_risks', 'risk_register.view', 'read'],
    ['explain_risk', 'risk_register.view', 'read'],
    ['search_jsas', 'jsa_jha.view', 'read'],
    ['draft_jsa', 'jsa_jha.create', 'draft']
  ]

  for (const [key, permission, type] of required) {
    const rows = await request(
      '/rest/v1/forge_ai_capabilities?capability_key=eq.' +
        key +
        '&select=capability_key,required_permission_key,capability_type,platform_enabled,requires_approval'
    )
    assert(rows?.[0]?.capability_key === key, key + ' capability missing')
    assert(rows[0].required_permission_key === permission, key + ' permission mismatch')
    assert(rows[0].capability_type === type, key + ' capability_type mismatch')
    assert(rows[0].platform_enabled === true, key + ' must be platform enabled')
  }

  const draft = await request(
    '/rest/v1/forge_ai_capabilities?capability_key=eq.draft_jsa&select=requires_approval,sensitive'
  )
  assert(draft?.[0]?.requires_approval === true, 'draft_jsa must require approval')
  assert(draft?.[0]?.sensitive === true, 'draft_jsa must be marked sensitive')

  const action = await request(
    '/rest/v1/forge_ai_action_registry?action_key=eq.jsa.create_draft&select=action_key,target_type,required_permission_key,platform_enabled,requires_approval'
  )
  assert(action?.[0]?.action_key === 'jsa.create_draft', 'jsa.create_draft action missing')
  assert(action[0].target_type === 'organization', 'jsa.create_draft target_type must be organization')
  assert(action[0].required_permission_key === 'jsa_jha.create', 'jsa.create_draft permission mismatch')
  assert(action[0].platform_enabled === true, 'jsa.create_draft must be enabled')
  assert(action[0].requires_approval === true, 'jsa.create_draft must require approval')

  console.log('NX-02H AI capability checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
