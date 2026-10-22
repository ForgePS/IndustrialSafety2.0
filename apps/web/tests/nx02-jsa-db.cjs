/**
 * NX-02 JSA/JHA — feature, numbering, step+hazard+control, risk score, execution.
 * Run: node apps/web/tests/nx02-jsa-db.cjs
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
  console.log('NX-02 JSA/JHA contract checks...')

  const year = new Date().getFullYear()

  const libSrc = fs.readFileSync(path.join(__dirname, '../src/lib/forgeJsa.ts'), 'utf8')
  assert(libSrc.includes('addHazard'), 'forgeJsa must export addHazard')
  assert(libSrc.includes('createExecution'), 'forgeJsa must export createExecution')
  assert(libSrc.includes('createRevision'), 'forgeJsa must export createRevision')
  assert(libSrc.includes('calculateRisk'), 'must use calculateRisk')
  assert(libSrc.includes('ensureTenantDefaultRiskMatrix'), 'must use ensureTenantDefaultRiskMatrix')

  const features = await request(
    '/rest/v1/forge_feature_registry?feature_key=eq.jsa_jha&select=feature_key,name,platform_state,sort_order,category'
  )
  assert(features?.[0]?.feature_key === 'jsa_jha', 'jsa_jha feature must exist')
  assert(features[0].platform_state === 'enabled', 'jsa_jha feature must be enabled')
  assert(Number(features[0].sort_order) === 125, 'jsa_jha sort_order should be 125')
  assert(
    features[0].category === 'People & Training',
    'jsa_jha category should be People & Training'
  )

  const perms = await request(
    '/rest/v1/forge_permission_registry?feature_key=eq.jsa_jha&select=permission_key'
  )
  const keys = new Set((perms || []).map(item => item.permission_key))
  for (const key of [
    'jsa_jha.view',
    'jsa_jha.create',
    'jsa_jha.edit',
    'jsa_jha.submit',
    'jsa_jha.approve',
    'jsa_jha.acknowledge',
    'jsa_jha.execute',
    'jsa_jha.close',
    'jsa_jha.archive',
    'jsa_jha.assign'
  ]) {
    assert(keys.has(key), 'Missing permission ' + key)
  }

  const nav = await request(
    '/rest/v1/forge_experience_elements?element_key=eq.nav.jsa_jha&select=route,settings'
  )
  assert(nav?.[0]?.route === '/jsas', 'nav.jsa_jha must point to /jsas')

  const form = await request(
    '/rest/v1/forge_form_definitions?form_key=eq.jsa_jha.jsa&select=form_key,name'
  )
  assert(form?.[0]?.form_key === 'jsa_jha.jsa', 'jsa_jha.jsa form must exist')

  const n1 = await rpc('next_forge_jsa_number', { p_organization_id: ORG_A })
  const n2 = await rpc('next_forge_jsa_number', { p_organization_id: ORG_A })
  assert(typeof n1 === 'string' && n1.startsWith('JSA-' + year + '-'), 'Number format JSA-YYYY-######')
  assert(typeof n2 === 'string' && n2.startsWith('JSA-' + year + '-'), 'Second number must match year format')
  assert(n1 !== n2, 'JSA numbers must be unique / incrementing')
  assert(/^JSA-\d{4}-\d{6}$/.test(String(n2)), 'JSA number must pad to 6 digits')

  const matrices = await request(
    '/rest/v1/forge_risk_matrices?organization_id=is.null&matrix_key=eq.forge.core.5x5&is_active=eq.true&select=id,version&order=version.desc&limit=1'
  )
  assert(matrices?.[0]?.id, 'Core risk matrix required for hazard scoring')
  const matrixId = matrices[0].id
  const matrixVersion = matrices[0].version

  const likelihoods = await request(
    '/rest/v1/forge_risk_likelihood_levels?risk_matrix_id=eq.' +
      matrixId +
      '&level_key=eq.likely&select=id,level_key,numeric_value'
  )
  const severities = await request(
    '/rest/v1/forge_risk_severity_levels?risk_matrix_id=eq.' +
      matrixId +
      '&level_key=eq.major&select=id,level_key,numeric_value'
  )
  assert(likelihoods?.[0]?.id && severities?.[0]?.id, 'likely/major levels required')

  const cells = await request(
    '/rest/v1/forge_risk_matrix_cells?risk_matrix_id=eq.' +
      matrixId +
      '&likelihood_level_id=eq.' +
      likelihoods[0].id +
      '&severity_level_id=eq.' +
      severities[0].id +
      '&select=score,risk_band_id'
  )
  assert(cells?.[0]?.score != null, 'likely×major cell must exist')
  const riskScore = Number(cells[0].score)
  const bands = await request(
    '/rest/v1/forge_risk_bands?id=eq.' + cells[0].risk_band_id + '&select=band_key'
  )
  const riskBand = bands?.[0]?.band_key
  assert(riskBand, 'Cell must map to a risk band')

  const created = await request('/rest/v1/forge_jsas', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_number: n1,
      title: 'Conveyor belt changeout',
      description: 'DB contract JSA with step hazard control',
      job_title: 'Millwright',
      task_name: 'Belt replacement',
      status: 'draft',
      version: 1,
      risk_matrix_id: matrixId,
      risk_matrix_version: matrixVersion,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(created?.[0]?.id, 'JSA insert must succeed')

  const step = await request('/rest/v1/forge_jsa_steps', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: created[0].id,
      step_number: 1,
      title: 'Isolate energy',
      description: 'Lock out conveyor drive',
      sort_order: 10,
      created_by: USER_A
    }
  })
  assert(step?.[0]?.id, 'Step insert must succeed')

  const hazard = await request('/rest/v1/forge_jsa_hazards', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: created[0].id,
      step_id: step[0].id,
      hazard_description: 'Unexpected start-up during isolation',
      category_key: 'physical',
      likelihood_key: 'likely',
      severity_key: 'major',
      risk_score: riskScore,
      risk_band_key: riskBand,
      sort_order: 10,
      created_by: USER_A
    }
  })
  assert(hazard?.[0]?.id, 'Hazard insert must succeed')
  assert(hazard[0].risk_score === riskScore, 'Hazard risk_score must match matrix cell')
  assert(hazard[0].risk_band_key === riskBand, 'Hazard risk_band_key must match matrix cell')

  const control = await request('/rest/v1/forge_jsa_controls', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: created[0].id,
      hazard_id: hazard[0].id,
      control_type: 'administrative',
      title: 'Verify zero energy state',
      description: 'Try-start after LOTO',
      sort_order: 10,
      created_by: USER_A
    }
  })
  assert(control?.[0]?.id, 'Control insert must succeed')
  assert(control[0].control_type === 'administrative', 'Control type must persist')

  const exeNumber = await rpc('next_forge_jsa_execution_number', { p_organization_id: ORG_A })
  assert(
    typeof exeNumber === 'string' && /^JSAEX-\d{4}-\d{6}$/.test(String(exeNumber)),
    'Execution number format JSAEX-YYYY-######'
  )

  const personnel = await request(
    '/rest/v1/forge_personnel?organization_id=eq.' +
      ORG_A +
      '&select=id&limit=1'
  )
  assert(personnel?.[0]?.id, 'Demo personnel required for execution participant')

  const execution = await request('/rest/v1/forge_jsa_executions', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      jsa_id: created[0].id,
      execution_number: exeNumber,
      // Crew is assembled while planned (NX-02R2: no crew additions to active work).
      status: 'planned',
      lead_personnel_id: personnel[0].id,
      created_by: USER_A
    }
  })
  assert(execution?.[0]?.id, 'Execution insert must succeed')

  const participant = await request('/rest/v1/forge_jsa_execution_participants', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      execution_id: execution[0].id,
      personnel_id: personnel[0].id,
      user_id: USER_A,
      role: 'lead'
    }
  })
  assert(participant?.[0]?.id, 'Participant insert must succeed')
  assert(participant[0].role === 'lead', 'Participant role must persist')

  await request('/rest/v1/forge_jsa_execution_participants?execution_id=eq.' + execution[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request('/rest/v1/forge_jsa_executions?id=eq.' + execution[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request('/rest/v1/forge_jsa_controls?jsa_id=eq.' + created[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request('/rest/v1/forge_jsa_hazards?jsa_id=eq.' + created[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request('/rest/v1/forge_jsa_steps?jsa_id=eq.' + created[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request('/rest/v1/forge_jsas?id=eq.' + created[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })

  console.log('NX-02 JSA/JHA contract checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
