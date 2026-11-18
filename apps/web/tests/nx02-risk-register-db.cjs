/**
 * NX-02 Risk Register — feature, numbering, inherent assessment cells, control, residual calc.
 * Run: node apps/web/tests/nx02-risk-register-db.cjs
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
  console.log('NX-02 risk register contract checks...')

  const year = new Date().getFullYear()

  const libSrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/forgeRiskRegister.ts'),
    'utf8'
  )
  assert(libSrc.includes('assessInherentRisk'), 'forgeRiskRegister must export assessInherentRisk')
  assert(libSrc.includes('assessResidualRisk'), 'forgeRiskRegister must export assessResidualRisk')
  assert(libSrc.includes('addRiskControl'), 'forgeRiskRegister must export addRiskControl')
  assert(libSrc.includes('ensureTenantDefaultRiskMatrix'), 'must use ensureTenantDefaultRiskMatrix')

  const features = await request(
    '/rest/v1/forge_feature_registry?feature_key=eq.risk_register&select=feature_key,name,platform_state,sort_order'
  )
  assert(features?.[0]?.feature_key === 'risk_register', 'risk_register feature must exist')
  assert(features[0].platform_state === 'enabled', 'risk_register feature must be enabled')
  assert(Number(features[0].sort_order) === 132, 'risk_register sort_order should be 132')

  const perms = await request(
    '/rest/v1/forge_permission_registry?feature_key=eq.risk_register&select=permission_key'
  )
  const keys = new Set((perms || []).map(item => item.permission_key))
  for (const key of [
    'risk_register.view',
    'risk_register.create',
    'risk_register.edit',
    'risk_register.assess',
    'risk_register.treat',
    'risk_register.review',
    'risk_register.approve',
    'risk_register.close',
    'risk_register.archive',
    'risk_register.assign',
    'risk_register.accept'
  ]) {
    assert(keys.has(key), 'Missing permission ' + key)
  }

  const nav = await request(
    '/rest/v1/forge_experience_elements?element_key=eq.nav.risk_register&select=route,settings'
  )
  assert(nav?.[0]?.route === '/risk-register', 'nav.risk_register must point to /risk-register')

  const form = await request(
    '/rest/v1/forge_form_definitions?form_key=eq.risk_register.risk&select=form_key,name'
  )
  assert(form?.[0]?.form_key === 'risk_register.risk', 'risk_register.risk form must exist')

  const n1 = await rpc('next_forge_risk_number', { p_organization_id: ORG_A })
  const n2 = await rpc('next_forge_risk_number', { p_organization_id: ORG_A })
  assert(typeof n1 === 'string' && n1.startsWith('RISK-' + year + '-'), 'Number format RISK-YYYY-######')
  assert(typeof n2 === 'string' && n2.startsWith('RISK-' + year + '-'), 'Second number must match year format')
  assert(n1 !== n2, 'Risk numbers must be unique / incrementing')
  assert(/^RISK-\d{4}-\d{6}$/.test(String(n2)), 'Risk number must pad to 6 digits')

  const matrices = await request(
    '/rest/v1/forge_risk_matrices?organization_id=is.null&matrix_key=eq.forge.core.5x5&is_active=eq.true&select=id,version&order=version.desc&limit=1'
  )
  assert(matrices?.[0]?.id, 'Core risk matrix required for assessment cell checks')
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
  const inherentScore = Number(cells[0].score)

  const bands = await request(
    '/rest/v1/forge_risk_bands?id=eq.' + cells[0].risk_band_id + '&select=band_key'
  )
  const inherentBand = bands?.[0]?.band_key
  assert(inherentBand, 'Cell must map to a risk band')

  const residualLikelihoods = await request(
    '/rest/v1/forge_risk_likelihood_levels?risk_matrix_id=eq.' +
      matrixId +
      '&level_key=eq.unlikely&select=id,level_key'
  )
  const residualSeverities = await request(
    '/rest/v1/forge_risk_severity_levels?risk_matrix_id=eq.' +
      matrixId +
      '&level_key=eq.moderate&select=id,level_key'
  )
  assert(residualLikelihoods?.[0]?.id && residualSeverities?.[0]?.id, 'unlikely/moderate levels required')

  const residualCells = await request(
    '/rest/v1/forge_risk_matrix_cells?risk_matrix_id=eq.' +
      matrixId +
      '&likelihood_level_id=eq.' +
      residualLikelihoods[0].id +
      '&severity_level_id=eq.' +
      residualSeverities[0].id +
      '&select=score,risk_band_id'
  )
  assert(residualCells?.[0]?.score != null, 'unlikely×moderate cell must exist')
  const residualScore = Number(residualCells[0].score)
  const residualBands = await request(
    '/rest/v1/forge_risk_bands?id=eq.' + residualCells[0].risk_band_id + '&select=band_key'
  )
  const residualBand = residualBands?.[0]?.band_key
  assert(residualBand, 'Residual cell must map to a risk band')

  const created = await request('/rest/v1/forge_risks', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      risk_number: n1,
      title: 'Conveyor pinch point',
      description: 'DB contract risk with inherent assessment',
      hazard_description: 'Exposed nip point on line 3',
      category_key: 'physical',
      status: 'assessment',
      risk_matrix_id: matrixId,
      risk_matrix_version: matrixVersion,
      inherent_likelihood_key: 'likely',
      inherent_severity_key: 'major',
      inherent_score: inherentScore,
      inherent_band_key: inherentBand,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(created?.[0]?.id, 'Risk insert must succeed')
  assert(created[0].inherent_score === inherentScore, 'Inherent score must match matrix cell')
  assert(created[0].inherent_band_key === inherentBand, 'Inherent band must match matrix cell')

  const control = await request('/rest/v1/forge_risk_controls', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      risk_id: created[0].id,
      control_type: 'engineering',
      title: 'Fixed guard installed',
      description: 'Interlocked guard covering nip point',
      is_active: true,
      sort_order: 10,
      created_by: USER_A
    }
  })
  assert(control?.[0]?.id, 'Control insert must succeed')
  assert(control[0].control_type === 'engineering', 'Control type must persist')

  const residualUpdate = await request('/rest/v1/forge_risks?id=eq.' + created[0].id, {
    method: 'PATCH',
    body: {
      residual_likelihood_key: 'unlikely',
      residual_severity_key: 'moderate',
      residual_score: residualScore,
      residual_band_key: residualBand,
      status: 'active',
      updated_by: USER_A
    }
  })
  assert(residualUpdate?.[0]?.residual_score === residualScore, 'Residual score must match matrix cell')
  assert(residualUpdate[0].residual_band_key === residualBand, 'Residual band must match matrix cell')
  assert(residualScore < inherentScore, 'Residual score should be lower than inherent for this fixture')

  await request('/rest/v1/forge_risk_controls?risk_id=eq.' + created[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request('/rest/v1/forge_risks?id=eq.' + created[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })

  console.log('NX-02 risk register contract checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
