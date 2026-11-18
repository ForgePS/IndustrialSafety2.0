/**
 * NX-02 Observations — numbering, anonymous reporter isolation, feature registry.
 * Run: node apps/web/tests/nx02-observations-db.cjs
 *
 * Note: forge_observation_reporters is service_role only at the DB layer.
 * Ordinary viewers must not see reporter identity via the app layer when
 * reporting_mode=anonymous and the viewer lacks observations.view_reporter_identity.
 * This test verifies service_role can read the restricted table directly (expected),
 * and that the observations row itself does not store anonymous identity columns.
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
  console.log('NX-02 observations contract checks...')

  const year = new Date().getFullYear()

  const features = await request(
    '/rest/v1/forge_feature_registry?feature_key=eq.observations&select=feature_key,name,platform_state'
  )
  assert(features?.[0]?.feature_key === 'observations', 'observations feature must exist')
  assert(features[0].platform_state === 'enabled', 'observations feature must be enabled')

  const perms = await request(
    '/rest/v1/forge_permission_registry?feature_key=eq.observations&select=permission_key'
  )
  const keys = new Set((perms || []).map(item => item.permission_key))
  for (const key of [
    'observations.view',
    'observations.create',
    'observations.edit',
    'observations.submit',
    'observations.review',
    'observations.assign',
    'observations.close',
    'observations.archive',
    'observations.view_reporter_identity'
  ]) {
    assert(keys.has(key), 'Missing permission ' + key)
  }

  const nav = await request(
    '/rest/v1/forge_experience_elements?element_key=eq.nav.observations&select=route,settings'
  )
  assert(nav?.[0]?.route === '/observations', 'nav.observations must point to /observations')

  const n1 = await rpc('next_forge_observation_number', { p_organization_id: ORG_A })
  const n2 = await rpc('next_forge_observation_number', { p_organization_id: ORG_A })
  assert(typeof n1 === 'string' && n1.startsWith('OBS-' + year + '-'), 'Number format OBS-YYYY-######')
  assert(typeof n2 === 'string' && n2.startsWith('OBS-' + year + '-'), 'Second number must match year format')
  assert(n1 !== n2, 'Observation numbers must be unique / incrementing')

  const seqMatch = String(n2).match(/^OBS-\d{4}-(\d{6})$/)
  assert(seqMatch, 'Observation number must pad to 6 digits')

  const anonymous = await request('/rest/v1/forge_observations', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      observation_number: n1,
      title: 'Anonymous near miss',
      description: 'DB contract anonymous reporter isolation',
      observation_type: 'NEAR_MISS',
      reporting_mode: 'anonymous',
      status: 'draft',
      reported_by_user_id: null,
      reported_by_personnel_id: null,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(anonymous?.[0]?.id, 'Anonymous observation insert must succeed')
  assert(anonymous[0].reported_by_user_id == null, 'Anonymous row must not store reported_by_user_id')
  assert(
    anonymous[0].reported_by_personnel_id == null,
    'Anonymous row must not store reported_by_personnel_id'
  )

  const reporter = await request('/rest/v1/forge_observation_reporters', {
    method: 'POST',
    body: {
      observation_id: anonymous[0].id,
      organization_id: ORG_A,
      auth_user_id: USER_A,
      personnel_id: null
    }
  })
  assert(reporter?.[0]?.id, 'Restricted reporter row must insert via service role')

  const reporterRead = await request(
    '/rest/v1/forge_observation_reporters?observation_id=eq.' +
      anonymous[0].id +
      '&select=auth_user_id,organization_id'
  )
  assert(
    reporterRead?.[0]?.auth_user_id === USER_A,
    'Service role may read forge_observation_reporters (app layer must still hide without permission)'
  )

  const named = await request('/rest/v1/forge_observations', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      observation_number: n2,
      title: 'Named unsafe act',
      description: 'DB contract named reporter',
      observation_type: 'UNSAFE',
      reporting_mode: 'named',
      status: 'draft',
      reported_by_user_id: USER_A,
      created_by: USER_A,
      updated_by: USER_A
    }
  })
  assert(named?.[0]?.id, 'Named observation insert must succeed')
  assert(named[0].reported_by_user_id === USER_A, 'Named observation stores reporter on row')

  // Cleanup test rows
  await request('/rest/v1/forge_observation_reporters?observation_id=eq.' + anonymous[0].id, {
    method: 'DELETE',
    prefer: 'return=minimal'
  })
  await request(
    '/rest/v1/forge_observations?id=in.(' + anonymous[0].id + ',' + named[0].id + ')',
    { method: 'DELETE', prefer: 'return=minimal' }
  )

  console.log('NX-02 observations contract checks passed.')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
