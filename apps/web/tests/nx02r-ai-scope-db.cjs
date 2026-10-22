/**
 * NX-02R — AI draft JSA scope / cross-tenant assignment contracts.
 * Run: node apps/web/tests/nx02r-ai-scope-db.cjs
 *
 * Service role performs authorized mutation; it does NOT determine authorization.
 * Every AI draft JSA must pass resolveAndAuthorizeJsaAssignment for the requester
 * before createJsa (service-role insert).
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:35421'
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5OTZ9.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const ORG_A = '20000000-0000-4000-8000-000000000100'
const ORG_B = '30000000-0000-4000-8000-000000000100'
const LOC_A = '20000000-0000-4000-8000-000000000300'
const LOC_B = '30000000-0000-4000-8000-000000000300'
const LOC_A2 = '20000000-0000-4000-8000-000000000301'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function request(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=representation'
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

async function main() {
  console.log('NX-02R AI draft JSA scope checks...')

  const aiSrc = fs.readFileSync(path.join(__dirname, '../src/lib/forgeAiActions.ts'), 'utf8')
  const assignSrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/forgeJsaAssignment.ts'),
    'utf8'
  )
  const createSrc = fs.readFileSync(path.join(__dirname, '../src/lib/forgeJsa.ts'), 'utf8')

  assert(/resolveRequesterJsaCreateScope/.test(aiSrc), 'executeDraftJsa must re-resolve requester scope')
  assert(/resolveAndAuthorizeJsaAssignment/.test(aiSrc), 'AI paths must use shared assignment validator')
  assert(
    /requested_by/.test(aiSrc) && /requesterId/.test(aiSrc),
    'AI draft must authorize as original requested_by, not only approver'
  )
  assert(/status:\s*'draft'/.test(createSrc), 'createJsa must always persist draft')
  assert(!/status:\s*input\.status/.test(createSrc), 'createJsa must ignore caller status')
  assert(/jsaWithinScope/.test(assignSrc), 'assignment helper must call jsaWithinScope')
  assert(
    /Service role performs the mutation/.test(assignSrc) ||
      /DOES NOT determine authorization/i.test(assignSrc) ||
      /determines authorization/.test(assignSrc),
    'assignment helper must document service-role boundary'
  )

  // Ensure Tenant B + foreign location exist
  await request('POST', '/rest/v1/organizations', {
    id: ORG_B,
    name: 'NX-02R Outside Tenant',
    slug: 'nx02r-ai-outside',
    status: 'active'
  }).catch(() => null)

  await request('POST', '/rest/v1/locations', {
    id: LOC_B,
    organization_id: ORG_B,
    name: 'Tenant B Location',
    code: 'TB-AI',
    is_active: true
  }).catch(() => null)

  await request('POST', '/rest/v1/locations', {
    id: LOC_A2,
    organization_id: ORG_A,
    name: 'Location A2',
    code: 'A2',
    is_active: true
  }).catch(() => null)

  // Mirror: location must belong to organization (cross-tenant DENY)
  {
    const { data } = await request(
      'GET',
      '/rest/v1/locations?id=eq.' + LOC_B + '&organization_id=eq.' + ORG_A + '&select=id'
    )
    assert(!Array.isArray(data) || data.length === 0, 'Tenant B location must not resolve under Tenant A')
    console.log('  foreign location_id (Tenant B) DENY under Tenant A org filter')
  }

  // Mirror: same-tenant wrong location exists in org but out-of-scope users are denied by jsaWithinScope
  {
    const { data } = await request(
      'GET',
      '/rest/v1/locations?id=eq.' + LOC_A2 + '&organization_id=eq.' + ORG_A + '&select=id'
    )
    assert(Array.isArray(data) && data.length === 1, 'Location A2 must exist in Tenant A for out-of-scope tests')
    console.log('  same-tenant Location A2 exists (scope denial is via jsaWithinScope)')
  }

  // Valid in-scope location for Tenant A
  {
    const { data } = await request(
      'GET',
      '/rest/v1/locations?id=eq.' + LOC_A + '&organization_id=eq.' + ORG_A + '&select=id'
    )
    assert(Array.isArray(data) && data.length === 1, 'Demo Location must exist for ALLOW path')
    console.log('  valid Tenant A in-scope location ALLOW candidate')
  }

  // Capability registry: draft_jsa sensitive + requires approval
  {
    const { data } = await request(
      'GET',
      '/rest/v1/forge_ai_capabilities?capability_key=in.(search_observations,analyze_observations,search_risks,explain_risk,search_jsas,draft_jsa)&select=capability_key,required_permission_key,requires_approval,sensitive'
    )
    const rows = Array.isArray(data) ? data : []
    const byKey = Object.fromEntries(rows.map(r => [r.capability_key, r]))
    for (const key of [
      'search_observations',
      'analyze_observations',
      'search_risks',
      'explain_risk',
      'search_jsas',
      'draft_jsa'
    ]) {
      assert(byKey[key], 'missing AI capability ' + key)
    }
    assert(byKey.draft_jsa.requires_approval === true, 'draft_jsa requires approval')
    assert(byKey.draft_jsa.sensitive === true, 'draft_jsa is sensitive')
    console.log('  AI capability suite registered (6 NX-02 tools)')
  }

  console.log('NX-02R AI draft JSA scope checks passed.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
