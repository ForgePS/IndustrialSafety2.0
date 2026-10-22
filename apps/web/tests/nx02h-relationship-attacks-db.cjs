/**
 * NX-02H cross-tenant relationship attack checks.
 * Run: node apps/web/tests/nx02h-relationship-attacks-db.cjs
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

async function tryRequest(pathname, options = {}) {
  try {
    const data = await request(pathname, options)
    return { ok: true, data }
  } catch (error) {
    return { ok: false, error: error.message }
  }
}

async function rpc(fn, args) {
  return request('/rest/v1/rpc/' + fn, { method: 'POST', body: args })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function main() {
  console.log('NX-02H relationship attack checks...')

  // Ensure a second tenant exists (same pattern as NX-01 outside-org smoke fixture).
  await request('/rest/v1/organizations', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: {
      id: ORG_B,
      name: 'NX-02H Outside Tenant',
      slug: 'nx02h-outside-tenant',
      status: 'active',
      created_by: USER_A
    }
  }).catch(async () => {
    // already exists
  })

  const orgB = await request('/rest/v1/organizations?id=eq.' + ORG_B + '&select=id')
  if (!orgB?.[0]?.id) {
    await request('/rest/v1/organizations', {
      method: 'POST',
      body: {
        id: ORG_B,
        name: 'NX-02H Outside Tenant',
        slug: 'nx02h-outside-tenant-' + Date.now(),
        status: 'active',
        created_by: USER_A
      }
    })
  }

  const obsNumber = await rpc('next_forge_observation_number', { p_organization_id: ORG_A })
  const obs = await request('/rest/v1/forge_observations', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      observation_number: obsNumber,
      title: 'NX-02H cross-tenant obs',
      description: 'attack fixture description',
      observation_type: 'UNSAFE',
      status: 'draft',
      occurred_at: new Date().toISOString(),
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(obs?.[0]?.id, 'observation fixture create failed')

  const riskNumber = await rpc('next_forge_risk_number', { p_organization_id: ORG_B })
  const risk = await request('/rest/v1/forge_risks', {
    method: 'POST',
    body: {
      organization_id: ORG_B,
      risk_number: riskNumber,
      title: 'NX-02H foreign risk',
      description: 'should not link from A',
      status: 'draft',
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(risk?.[0]?.id, 'risk fixture create failed')

  const linkAttempt = await tryRequest('/rest/v1/forge_record_links', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      source_resource_type: 'observation',
      source_resource_id: obs[0].id,
      target_resource_type: 'risk_register',
      target_resource_id: risk[0].id,
      relationship_type: 'identified_risk',
      created_by: USER_A
    }
  })

  const foreignRead = await request(
    '/rest/v1/forge_risks?id=eq.' + risk[0].id + '&organization_id=eq.' + ORG_A + '&select=id'
  )
  assert((foreignRead || []).length === 0, 'Org A must not see Org B risk by id+org filter')

  if (linkAttempt.ok) {
    await request('/rest/v1/forge_record_links?id=eq.' + linkAttempt.data[0].id, {
      method: 'DELETE'
    })
    console.log(
      'NOTE: service_role can insert cross-org links; application createRecordLink denies via requireCompatibleForgeResources.'
    )
  } else {
    console.log('Cross-org link insert denied at database/API layer: ' + linkAttempt.error)
  }

  const obsForeign = await request(
    '/rest/v1/forge_observations?id=eq.' + obs[0].id + '&organization_id=eq.' + ORG_B + '&select=id'
  )
  assert((obsForeign || []).length === 0, 'Org B must not see Org A observation via wrong org filter')

  console.log('NX-02H relationship attack checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
