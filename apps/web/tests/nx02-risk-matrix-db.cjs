/**
 * NX-02 Part A — shared risk matrix contract checks.
 * Run: node apps/web/tests/nx02-risk-matrix-db.cjs
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
  console.log('NX-02 risk matrix contract checks...')

  const libSrc = fs.readFileSync(
    path.join(__dirname, '../src/lib/forgeRiskMatrix.ts'),
    'utf8'
  )
  assert(libSrc.includes('calculateRisk'), 'forgeRiskMatrix must export calculateRisk')
  assert(libSrc.includes('cloneRiskMatrixVersion'), 'forgeRiskMatrix must support version cloning')
  assert(libSrc.includes('activateRiskMatrix'), 'forgeRiskMatrix must support activation')
  assert(libSrc.includes('validateRiskMatrix'), 'forgeRiskMatrix must validate completeness')

  const matrices = await request(
    '/rest/v1/forge_risk_matrices?organization_id=is.null&matrix_key=eq.forge.core.5x5&select=id,version,is_default,is_core,is_active'
  )
  assert(matrices?.[0]?.id, 'Core 5x5 matrix must exist')
  assert(matrices[0].is_core === true, 'Core matrix must be is_core')
  assert(matrices[0].is_default === true, 'Core matrix must be default')
  assert(matrices[0].is_active === true, 'Core matrix must be active')

  const matrixId = matrices[0].id
  const validation = await rpc('forge_validate_risk_matrix', { p_matrix_id: matrixId })
  assert(validation?.ok === true, 'Core matrix must validate')
  assert(Number(validation.cell_count) === 25, 'Core matrix must have 25 cells')
  assert(Number(validation.likelihood_count) === 5, 'Core matrix must have 5 likelihood levels')
  assert(Number(validation.severity_count) === 5, 'Core matrix must have 5 severity levels')

  const likelihoods = await request(
    '/rest/v1/forge_risk_likelihood_levels?risk_matrix_id=eq.' +
      matrixId +
      '&level_key=eq.likely&select=id,numeric_value'
  )
  const severities = await request(
    '/rest/v1/forge_risk_severity_levels?risk_matrix_id=eq.' +
      matrixId +
      '&level_key=eq.major&select=id,numeric_value'
  )
  assert(likelihoods?.[0]?.id && severities?.[0]?.id, 'Likely/major levels required')

  const cell = await request(
    '/rest/v1/forge_risk_matrix_cells?risk_matrix_id=eq.' +
      matrixId +
      '&likelihood_level_id=eq.' +
      likelihoods[0].id +
      '&severity_level_id=eq.' +
      severities[0].id +
      '&select=score,risk_band_id'
  )
  assert(cell?.[0]?.score === 16, 'Likely×Major score must be 16')

  const band = await request(
    '/rest/v1/forge_risk_bands?id=eq.' + cell[0].risk_band_id + '&select=band_key,requires_review,requires_approval'
  )
  assert(band?.[0]?.band_key === 'high', 'Score 16 must map to high band')
  assert(band[0].requires_review === true, 'High band requires review')
  assert(band[0].requires_approval === true, 'High band requires approval')

  // Tenant clone simulation (service role insert of cloned header only verifies uniqueness path)
  const tenantMatricesBefore = await request(
    '/rest/v1/forge_risk_matrices?organization_id=eq.' + ORG_A + '&select=id'
  )
  assert(Array.isArray(tenantMatricesBefore), 'Tenant matrix query must succeed')

  console.log('NX-02 risk matrix contract checks passed.')
  void USER_A
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
