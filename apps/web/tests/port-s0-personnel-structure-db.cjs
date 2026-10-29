/**
 * Port slice 0 (Industrial 1.0 -> 2.0): personnel structure, parity fields and sensitive data.
 * Database contract checks against local Supabase.
 *
 * Run: node apps/web/tests/port-s0-personnel-structure-db.cjs
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
const ANON_KEY = process.env.ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ORG_A = '20000000-0000-4000-8000-000000000100'
const ADMIN_USER = '20000000-0000-4000-8000-000000000001'
const DEMO_USER_EMAIL = 'user@forge2.local'
const DEMO_PASSWORD = 'ForgeDev2!'
const MILLING = '20000000-0000-4000-8000-000000002001'
const MAINTENANCE = '20000000-0000-4000-8000-000000002002'
const MILL_OPERATOR = '20000000-0000-4000-8000-000000002101'
const RUN = Date.now().toString().slice(-7)

if (!API_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing Supabase URL, anon key or service role key.')
  process.exit(1)
}

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + token,
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
    const error = new Error(String((data && (data.message || data.error)) || response.status + ' ' + text))
    error.status = response.status
    error.code = data && data.code
    throw error
  }
  return data
}

const rpc = (fn, args, options = {}) => request('/rest/v1/rpc/' + fn, { ...options, method: 'POST', body: args })

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, { code, status } = {}) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected code ${code}, got ${error.code}: ${error.message})`)
    if (status && error.status !== status) throw new Error(`FAIL: ${message} (expected HTTP ${status}, got ${error.status}: ${error.message})`)
    console.log('  ok - ' + message)
    return error
  }
  throw new Error('FAIL: ' + message + ' (write unexpectedly succeeded)')
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD })
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error('Unable to sign in as ' + email)
  return data.access_token
}

const createPerson = async (overrides = {}) => {
  const rows = await request('/rest/v1/forge_personnel', {
    method: 'POST',
    body: {
      organization_id: ORG_A,
      first_name: 'Port',
      last_name: 'Fixture ' + RUN,
      employment_status: 'active',
      created_by: ADMIN_USER,
      updated_by: ADMIN_USER,
      ...overrides
    }
  })
  return rows[0]
}

async function main() {
  console.log('Port slice 0: personnel structure DB checks')
  const cleanupPersonnel = []
  let orgB = null

  try {
    console.log('Employee number matching key')
    const keys = await Promise.all(
      ['EMP-0042', 'emp 42', '42', '0042', 'EMP_AB12', 'ab12', '   ', 'EMP'].map(raw => rpc('forge_employee_number_key', { raw }))
    )
    assert(keys.slice(0, 4).every(key => key === '42'), 'EMP-0042, emp 42, 42 and 0042 share one key')
    assert(keys[4] === 'ab12' && keys[5] === 'ab12', 'EMP_AB12 and AB12 share one key')
    assert(keys[6] === null && keys[7] === null, 'blank and bare EMP have no key')

    const number = String(Number(RUN))
    const first = await createPerson({ employee_number: 'EMP-00' + number })
    cleanupPersonnel.push(first.id)
    assert(first.employee_number_key === number, 'generated employee_number_key is stored')

    await expectFailure(createPerson({ employee_number: ' ' + number }), 'a second active person with an equivalent employee number is rejected', { code: '23505' })

    const match = await rpc('forge_find_personnel_by_employee_number', { p_organization_id: ORG_A, p_employee_number: 'emp ' + number })
    assert(match.length === 1 && match[0].id === first.id, 'forge_find_personnel_by_employee_number resolves an alternate spelling')

    console.log('Same-organization guards')
    const orgRows = await request('/rest/v1/organizations', {
      method: 'POST',
      body: { name: 'Port S0 Isolation ' + RUN, slug: 'port-s0-isolation-' + RUN, status: 'active', created_by: ADMIN_USER }
    })
    orgB = orgRows[0].id
    const foreignDepartment = (await request('/rest/v1/forge_departments', {
      method: 'POST',
      body: { organization_id: orgB, name: 'Foreign Department' }
    }))[0]
    const foreignPosition = (await request('/rest/v1/forge_positions', {
      method: 'POST',
      body: { organization_id: orgB, name: 'Foreign Position' }
    }))[0]

    await expectFailure(
      request(`/rest/v1/forge_personnel?id=eq.${first.id}`, { method: 'PATCH', body: { department_id: foreignDepartment.id } }),
      'personnel cannot reference another organization\'s department',
      { code: '23503' }
    )
    await expectFailure(
      request(`/rest/v1/forge_personnel?id=eq.${first.id}`, { method: 'PATCH', body: { position_id: foreignPosition.id } }),
      'personnel cannot reference another organization\'s position',
      { code: '23503' }
    )
    await expectFailure(
      request('/rest/v1/forge_departments', {
        method: 'POST',
        body: { organization_id: orgB, name: 'Cross Location', location_id: '20000000-0000-4000-8000-000000000300' }
      }),
      'a department cannot use another organization\'s Location',
      { code: '23503' }
    )
    await expectFailure(
      request('/rest/v1/forge_positions', { method: 'POST', body: { organization_id: orgB, name: 'Cross Department', department_id: MILLING } }),
      'a position cannot use another organization\'s department',
      { code: '23503' }
    )

    console.log('Structure and personnel rules')
    await expectFailure(
      request(`/rest/v1/forge_personnel?id=eq.${first.id}`, { method: 'PATCH', body: { department_id: MAINTENANCE, position_id: MILL_OPERATOR } }),
      'a position from a different department is rejected',
      { code: '23514' }
    )
    await expectFailure(
      request(`/rest/v1/forge_personnel?id=eq.${first.id}`, { method: 'PATCH', body: { supervisor_personnel_id: first.id } }),
      'a person cannot supervise themselves',
      { code: '23514' }
    )
    await expectFailure(
      request(`/rest/v1/forge_personnel?id=eq.${first.id}`, { method: 'PATCH', body: { hire_date: '2024-05-01', termination_date: '2024-04-30' } }),
      'termination before hire is rejected',
      { code: '23514' }
    )
    await expectFailure(
      request('/rest/v1/forge_departments', { method: 'POST', body: { organization_id: ORG_A, location_id: '20000000-0000-4000-8000-000000000300', name: ' milling ' } }),
      'duplicate active department name at the same Location is rejected (case and spacing ignored)',
      { code: '23505' }
    )

    console.log('Employment history')
    await request(`/rest/v1/forge_personnel?id=eq.${first.id}`, {
      method: 'PATCH',
      body: { department_id: MILLING, position_id: MILL_OPERATOR, updated_by: ADMIN_USER }
    })
    await request(`/rest/v1/forge_personnel?id=eq.${first.id}`, {
      method: 'PATCH',
      body: { employment_status: 'terminated', termination_date: '2026-10-01', updated_by: ADMIN_USER }
    })
    await request(`/rest/v1/forge_personnel?id=eq.${first.id}`, {
      method: 'PATCH',
      body: { employment_status: 'active', termination_date: null, updated_by: ADMIN_USER }
    })
    const events = await request(`/rest/v1/forge_personnel_employment_events?personnel_id=eq.${first.id}&order=id`)
    const types = events.map(event => event.event_type)
    assert(types[0] === 'hired', 'creating a person records a hired event')
    assert(types.includes('department_changed') && types.includes('position_changed'), 'assignment changes are recorded')
    const terminated = events.find(event => event.event_type === 'terminated')
    assert(terminated && terminated.effective_date === '2026-10-01', 'termination is recorded with the termination date')
    assert(types[types.length - 1] === 'rehired', 'returning from terminated is recorded as rehired')
    assert(events.every(event => event.event_type === 'hired' || event.actor_user_id === ADMIN_USER), 'events carry the acting user')

    console.log('Sensitive data and emergency contacts')
    await expectFailure(
      request('/rest/v1/forge_personnel_sensitive', { method: 'POST', body: { personnel_id: first.id, organization_id: orgB, date_of_birth: '1990-01-01' } }),
      'sensitive data cannot be filed under another organization',
      { code: '23503' }
    )
    await expectFailure(
      request('/rest/v1/forge_personnel_sensitive', { method: 'POST', body: { personnel_id: first.id, organization_id: ORG_A, date_of_birth: '2999-01-01' } }),
      'a future date of birth is rejected',
      { code: '23514' }
    )
    await request('/rest/v1/forge_personnel_sensitive', {
      method: 'POST',
      body: { personnel_id: first.id, organization_id: ORG_A, date_of_birth: '1990-02-03', sex: 'female', city: 'Testville', state_region: 'AR' }
    })

    const replaced = await rpc('forge_replace_personnel_emergency_contacts', {
      p_organization_id: ORG_A,
      p_personnel_id: first.id,
      p_contacts: [
        { name: 'Contact One', relationship: 'Spouse', phone: '555-0101' },
        { name: 'Contact Two', phone: '555-0102' }
      ],
      p_actor_user_id: ADMIN_USER
    })
    assert(replaced === 2, 'emergency contacts are saved in priority order')
    await rpc('forge_replace_personnel_emergency_contacts', {
      p_organization_id: ORG_A,
      p_personnel_id: first.id,
      p_contacts: [{ name: 'Contact Two', phone: '555-0102' }],
      p_actor_user_id: ADMIN_USER
    })
    const contacts = await request(`/rest/v1/forge_personnel_emergency_contacts?personnel_id=eq.${first.id}&order=priority`)
    assert(contacts.length === 1 && contacts[0].priority === 1 && contacts[0].name === 'Contact Two', 'replacing contacts is atomic and re-numbers priority')
    await expectFailure(
      rpc('forge_replace_personnel_emergency_contacts', { p_organization_id: orgB, p_personnel_id: first.id, p_contacts: [], p_actor_user_id: ADMIN_USER }),
      'emergency contacts cannot be replaced through another organization',
      { code: '23503' }
    )

    console.log('Direct access as an authenticated member (demo employee)')
    const token = await signIn(DEMO_USER_EMAIL)
    await expectFailure(request('/rest/v1/forge_personnel_sensitive?select=*', { token }), 'members cannot read sensitive personnel data directly')
    await expectFailure(request('/rest/v1/forge_personnel_emergency_contacts?select=*', { token }), 'members cannot read emergency contacts directly')
    await expectFailure(request('/rest/v1/forge_personnel_employment_events?select=*', { token }), 'members cannot read employment history directly')
    await expectFailure(
      rpc('forge_replace_personnel_emergency_contacts', { p_organization_id: ORG_A, p_personnel_id: first.id, p_contacts: [], p_actor_user_id: ADMIN_USER }, { token }),
      'members cannot call the emergency-contact RPC'
    )
    await expectFailure(
      rpc('forge_find_personnel_by_employee_number', { p_organization_id: ORG_A, p_employee_number: number }, { token }),
      'members cannot call the employee-number lookup RPC'
    )
    await expectFailure(
      request('/rest/v1/forge_departments', { token, method: 'POST', body: { organization_id: ORG_A, name: 'Member Write ' + RUN } }),
      'members cannot write departments directly'
    )
    await expectFailure(
      request(`/rest/v1/forge_personnel?id=eq.${first.id}`, { token, method: 'PATCH', body: { is_dot_driver: true } }),
      'members cannot update personnel records directly'
    )
    await expectFailure(
      request('/rest/v1/forge_personnel', { token, method: 'POST', body: { organization_id: ORG_A, first_name: 'Direct', last_name: 'Insert' } }),
      'members cannot insert personnel records directly'
    )
    const visiblePersonnel = await request(`/rest/v1/forge_personnel?id=eq.${first.id}&select=id,is_dot_driver`, { token })
    assert(visiblePersonnel.length === 1 && visiblePersonnel[0].is_dot_driver === false, 'members keep read access and the record is unchanged')
    const visibleDepartments = await request('/rest/v1/forge_departments?select=id,organization_id', { token })
    assert(visibleDepartments.some(row => row.id === MILLING), 'members can read their own organization\'s departments')
    assert(visibleDepartments.every(row => row.organization_id === ORG_A), 'members cannot see another organization\'s departments')

    console.log('All port slice 0 DB checks passed.')
  } finally {
    for (const id of cleanupPersonnel) {
      await request(`/rest/v1/forge_personnel?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    }
    if (orgB) await request(`/rest/v1/organizations?id=eq.${orgB}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
