/**
 * Port slice 1 (Industrial 1.0 -> 2.0): OSHA recordkeeping database contract checks.
 * Run: node apps/web/tests/port-s1-osha-db.cjs
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
const SEED_PERSON = '20000000-0000-4000-8000-000000000600'
const RUN = Date.now().toString().slice(-7)
const YEAR = 2025

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
      Prefer: options.prefer || 'return=representation'
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

async function expectFailure(promise, message, { code, pattern } = {}) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected code ${code}, got ${error.code}: ${error.message})`)
    if (pattern && !pattern.test(error.message)) throw new Error(`FAIL: ${message} (unexpected message: ${error.message})`)
    console.log('  ok - ' + message)
    return error
  }
  throw new Error('FAIL: ' + message + ' (write unexpectedly succeeded)')
}

async function signIn(email) {
  const response = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'ForgeDev2!' })
  })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error('Unable to sign in as ' + email)
  return data.access_token
}

const insert = async (table, body) => (await request('/rest/v1/' + table, { method: 'POST', body }))[0]
const patch = (table, id, body) => request(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', body })

async function main() {
  console.log('Port slice 1: OSHA recordkeeping DB checks')
  const created = { locations: [], incidents: [], personnel: [], orgs: [] }

  try {
    const location = await insert('locations', { organization_id: ORG_A, name: 'OSHA Test Plant ' + RUN, code: 'OT' + RUN })
    const locationB = await insert('locations', { organization_id: ORG_A, name: 'OSHA Test Annex ' + RUN, code: 'OA' + RUN })
    created.locations.push(location.id, locationB.id)

    const second = await insert('forge_personnel', {
      organization_id: ORG_A, first_name: 'Second', last_name: 'Worker ' + RUN, employment_status: 'active', created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    created.personnel.push(second.id)

    const incidentNumber = await rpc('next_forge_incident_number', { p_organization_id: ORG_A })
    const incident = await insert('forge_incidents', {
      organization_id: ORG_A, incident_number: incidentNumber, occurred_at: `${YEAR}-03-03T04:30:00Z`, location_id: location.id,
      summary: 'Hand caught in conveyor ' + RUN, incident_type: 'injury', involves_injury: true, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    created.incidents.push(incident.id)

    console.log('Case numbers')
    const n1 = await rpc('next_forge_osha_case_number', { p_organization_id: ORG_A, p_location_id: location.id, p_year: YEAR })
    const n2 = await rpc('next_forge_osha_case_number', { p_organization_id: ORG_A, p_location_id: location.id, p_year: YEAR })
    const nB = await rpc('next_forge_osha_case_number', { p_organization_id: ORG_A, p_location_id: locationB.id, p_year: YEAR })
    assert(n1 === `${YEAR}-001` && n2 === `${YEAR}-002`, 'case numbers count up per establishment and year')
    assert(nB === `${YEAR}-001`, 'each establishment has its own case sequence')

    const baseCase = {
      organization_id: ORG_A, location_id: location.id, incident_id: incident.id, employee_name: 'Seed Person',
      injury_date: `${YEAR}-03-02`, created_by: ADMIN_USER, updated_by: ADMIN_USER
    }

    const caseA = await insert('forge_osha_cases', { ...baseCase, case_number: n1, personnel_id: SEED_PERSON })
    assert(caseA.calendar_year === YEAR && caseA.recordability === 'pending' && caseA.row_version === 1, 'a new case starts pending with its calendar year derived')

    await expectFailure(
      insert('forge_osha_cases', { ...baseCase, case_number: n2, personnel_id: SEED_PERSON }),
      'one active case per employee per incident',
      { code: '23505' }
    )

    console.log('Classification constraints')
    await expectFailure(patch('forge_osha_cases', caseA.id, { recordability: 'recordable' }), 'recordable cases need an outcome and type', { code: '23514' })
    await expectFailure(
      patch('forge_osha_cases', caseA.id, { recordability: 'recordable', case_outcome: 'days_away', case_type: 'injury', days_away: 150, restricted_days: 31 }),
      'days away plus restricted days cannot exceed 180',
      { code: '23514', pattern: /day_cap/ }
    )
    await expectFailure(patch('forge_osha_cases', caseA.id, { is_privacy_case: true }), 'only recordable cases can be privacy cases', { code: '23514' })
    await expectFailure(
      patch('forge_osha_cases', caseA.id, { recordability: 'not_recordable', case_outcome: 'other_recordable' }),
      'not-recordable cases cannot keep an outcome',
      { code: '23514' }
    )
    await expectFailure(
      patch('forge_osha_cases', caseA.id, { recordability: 'recordable', case_outcome: 'days_away', case_type: 'injury', date_of_death: `${YEAR}-03-05` }),
      'date of death requires a death outcome',
      { code: '23514' }
    )
    await expectFailure(patch('forge_osha_cases', caseA.id, { injury_date: '2999-01-01' }), 'injury date cannot be in the future', { code: '23514' })
    await expectFailure(patch('forge_osha_cases', caseA.id, { location_id: locationB.id }), 'a case cannot move to another establishment', { code: '23514' })
    await expectFailure(patch('forge_osha_cases', caseA.id, { injury_date: `${YEAR - 1}-12-30` }), 'a case cannot move to another log year', { code: '23514' })

    const classified = (await patch('forge_osha_cases', caseA.id, {
      recordability: 'recordable', case_outcome: 'days_away', case_type: 'injury', days_away: 4, restricted_days: 2, is_privacy_case: true
    }))[0]
    assert(classified.row_version === 2, 'each update increments row_version')

    const caseB = await insert('forge_osha_cases', {
      ...baseCase, case_number: n2, personnel_id: second.id, recordability: 'recordable',
      case_outcome: 'job_transfer_restriction', case_type: 'skin_disorder', restricted_days: 10
    })
    const caseVoid = await insert('forge_osha_cases', {
      ...baseCase, case_number: `${YEAR}-099`, incident_id: null, personnel_id: null, employee_name: 'Voided Entry',
      recordability: 'recordable', case_outcome: 'other_recordable', case_type: 'injury'
    })
    await insert('forge_osha_cases', { ...baseCase, case_number: `${YEAR}-098`, incident_id: null, personnel_id: null, employee_name: 'Still Pending' })

    await expectFailure(patch('forge_osha_cases', caseVoid.id, { status: 'voided' }), 'voiding requires a reason', { code: '23514' })
    await patch('forge_osha_cases', caseVoid.id, { status: 'voided', void_reason: 'Duplicate entry', voided_at: new Date().toISOString() })
    await expectFailure(patch('forge_osha_cases', caseVoid.id, { days_away: 1 }), 'voided cases cannot be edited', { code: '23514' })

    console.log('Form 300A totals')
    const [totals] = await rpc('forge_osha_300a_totals', { p_organization_id: ORG_A, p_year: YEAR, p_location_ids: [location.id] })
    assert(totals.recordable_cases === 2, 'totals count recordable cases only (pending and voided excluded)')
    assert(totals.days_away_cases === 1 && totals.transfer_cases === 1 && totals.deaths === 0 && totals.other_cases === 0, 'outcome columns G-J are counted once per case')
    assert(totals.days_away === 4 && totals.restricted_days === 12, 'days K and L are summed')
    assert(totals.injuries === 1 && totals.skin_disorders === 1, 'type columns M1-M6 are counted')
    const otherYear = await rpc('forge_osha_300a_totals', { p_organization_id: ORG_A, p_year: YEAR - 1, p_location_ids: [location.id] })
    assert(otherYear.length === 0, 'totals are limited to the requested year')

    console.log('Form 300A certification')
    const summary = await insert('forge_osha_establishment_years', {
      organization_id: ORG_A, location_id: location.id, year: YEAR, establishment_name: 'OSHA Test Plant',
      annual_average_employees: 210, total_hours_worked: 400000, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    await expectFailure(patch('forge_osha_establishment_years', summary.id, { status: 'certified' }), 'certifying directly without certifier details is rejected', { code: '23514' })
    await expectFailure(
      insert('forge_osha_establishment_years', { organization_id: ORG_A, location_id: location.id, year: YEAR }),
      'one summary per establishment per year',
      { code: '23505' }
    )
    await expectFailure(
      rpc('forge_certify_osha_establishment_year', {
        p_organization_id: ORG_A, p_summary_id: summary.id, p_expected_row_version: 99, p_certifier_name: 'Exec',
        p_certifier_title: 'Plant Manager', p_certifier_phone: '', p_certification_date: `${YEAR + 1}-01-15`, p_actor_user_id: ADMIN_USER
      }),
      'certification rejects a stale row version',
      { code: '40001' }
    )

    const certified = await rpc('forge_certify_osha_establishment_year', {
      p_organization_id: ORG_A, p_summary_id: summary.id, p_expected_row_version: summary.row_version, p_certifier_name: 'Exec Example',
      p_certifier_title: 'Plant Manager', p_certifier_phone: '555-0100', p_certification_date: `${YEAR + 1}-01-15`, p_actor_user_id: ADMIN_USER
    })
    assert(certified.status === 'certified' && certified.certified_by === ADMIN_USER, 'certification records who certified')
    assert(certified.certified_days_away_cases === 1 && certified.certified_transfer_cases === 1 && certified.certified_restricted_days === 12, 'certification freezes the current totals')

    await expectFailure(patch('forge_osha_establishment_years', summary.id, { total_hours_worked: 1 }), 'a certified summary cannot be edited', { code: '23514' })

    // Log changes after certification do not alter the frozen snapshot.
    await patch('forge_osha_cases', caseB.id, { restricted_days: 20 })
    const [afterChange] = await request(`/rest/v1/forge_osha_establishment_years?id=eq.${summary.id}`)
    assert(afterChange.certified_restricted_days === 12, 'the certified snapshot does not change when the log changes')

    const reopened = (await patch('forge_osha_establishment_years', summary.id, { status: 'draft' }))[0]
    assert(reopened.status === 'draft' && reopened.certified_days_away_cases === null && reopened.certified_at === null, 'reopening clears the snapshot and certification time')

    console.log('Tenant guards')
    const org = await insert('organizations', { name: 'OSHA Isolation ' + RUN, slug: 'osha-isolation-' + RUN, status: 'active', created_by: ADMIN_USER })
    created.orgs.push(org.id)
    const foreignLocation = await insert('locations', { organization_id: org.id, name: 'Foreign Plant' })
    await expectFailure(
      insert('forge_osha_cases', { ...baseCase, organization_id: org.id, location_id: foreignLocation.id, case_number: 'X-1', personnel_id: null }),
      'a case cannot link another organization\'s incident',
      { code: '23503' }
    )
    await expectFailure(
      insert('forge_osha_cases', { ...baseCase, location_id: foreignLocation.id, case_number: 'X-2', incident_id: null, personnel_id: null }),
      'a case cannot use another organization\'s Location',
      { code: '23503' }
    )
    await expectFailure(
      insert('forge_osha_establishment_years', { organization_id: ORG_A, location_id: foreignLocation.id, year: YEAR }),
      'a summary cannot use another organization\'s Location',
      { code: '23503' }
    )

    console.log('Direct access as an authenticated member (demo employee)')
    const token = await signIn('user@forge2.local')
    for (const table of ['forge_osha_cases', 'forge_osha_establishment_years', 'forge_osha_case_activity', 'forge_osha_case_sequences']) {
      await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
    }
    await expectFailure(rpc('forge_osha_300a_totals', { p_organization_id: ORG_A, p_year: YEAR }, { token }), 'members cannot call the totals RPC')
    await expectFailure(
      rpc('next_forge_osha_case_number', { p_organization_id: ORG_A, p_location_id: location.id, p_year: YEAR }, { token }),
      'members cannot draw case numbers'
    )
    await expectFailure(
      rpc('forge_certify_osha_establishment_year', {
        p_organization_id: ORG_A, p_summary_id: summary.id, p_expected_row_version: reopened.row_version, p_certifier_name: 'x',
        p_certifier_title: 'x', p_certifier_phone: '', p_certification_date: `${YEAR + 1}-01-15`, p_actor_user_id: ADMIN_USER
      }, { token }),
      'members cannot certify summaries'
    )

    console.log('All port slice 1 OSHA DB checks passed.')
  } finally {
    // OSHA rows reference incidents and locations with ON DELETE RESTRICT, so remove them first.
    for (const id of created.locations) {
      await request(`/rest/v1/forge_osha_cases?location_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
      await request(`/rest/v1/forge_osha_establishment_years?location_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    }
    for (const id of created.incidents) await request(`/rest/v1/forge_incidents?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.personnel) await request(`/rest/v1/forge_personnel?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.locations) await request(`/rest/v1/locations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.orgs) await request(`/rest/v1/organizations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
