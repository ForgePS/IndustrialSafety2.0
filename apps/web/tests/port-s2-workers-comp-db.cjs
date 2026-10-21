/**
 * Port slice 2 (Industrial 1.0 -> 2.0): workers' compensation database contract checks.
 * Run: node apps/web/tests/port-s2-workers-comp-db.cjs
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
const insert = async (table, body) => (await request('/rest/v1/' + table, { method: 'POST', body }))[0]
const patch = (table, id, body) => request(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', body })

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

async function main() {
  console.log('Port slice 2: workers\' comp DB checks')
  const created = { locations: [], incidents: [], personnel: [], orgs: [], carriers: [] }

  try {
    const location = await insert('locations', { organization_id: ORG_A, name: 'WC Test Plant ' + RUN, code: 'WC' + RUN })
    created.locations.push(location.id)
    const person = await insert('forge_personnel', {
      organization_id: ORG_A, first_name: 'Wc', last_name: 'Worker ' + RUN, employment_status: 'active', created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    created.personnel.push(person.id)
    const incidentNumber = await rpc('next_forge_incident_number', { p_organization_id: ORG_A })
    const incident = await insert('forge_incidents', {
      organization_id: ORG_A, incident_number: incidentNumber, occurred_at: `${YEAR}-04-07T14:00:00Z`, location_id: location.id,
      summary: 'Back strain lifting sack ' + RUN, incident_type: 'injury', involves_injury: true, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    created.incidents.push(incident.id)
    const carrier = await insert('forge_wc_carriers', { organization_id: ORG_A, name: 'Example Mutual ' + RUN })
    created.carriers.push(carrier.id)

    console.log('Cases')
    const number = await rpc('next_forge_wc_case_number', { p_organization_id: ORG_A, p_year: YEAR })
    assert(/^WC-2025-\d{4}$/.test(number), 'case numbers look like WC-YYYY-NNNN')

    const base = {
      organization_id: ORG_A, case_number: number, personnel_id: person.id, employee_name: 'Wc Worker', location_id: location.id,
      injury_date: `${YEAR}-04-07`, created_by: ADMIN_USER, updated_by: ADMIN_USER
    }
    const wc = await insert('forge_wc_cases', { ...base, incident_id: incident.id })
    assert(wc.status === 'active' && wc.stage === 'intake' && wc.row_version === 1, 'new cases start active in intake')

    await expectFailure(insert('forge_wc_cases', { ...base, case_number: number + '-X' }), 'one active case per worker and injury date (1.0 duplicate check)', { code: '23505' })
    await expectFailure(
      insert('forge_wc_cases', { ...base, case_number: number + '-N', personnel_id: null, osha_recordable: true }),
      'OSHA recordable needs a linked incident',
      { code: '23514', pattern: /recordable_incident/ }
    )
    await expectFailure(patch('forge_wc_cases', wc.id, { osha_privacy_case: true }), 'privacy needs OSHA recordable', { code: '23514' })
    await expectFailure(patch('forge_wc_cases', wc.id, { is_self_pay: true, carrier_id: carrier.id }), 'self pay cannot have a carrier', { code: '23514' })
    await expectFailure(patch('forge_wc_cases', wc.id, { stage: 'closed' }), 'the closed stage requires the closed status', { code: '23514' })
    await expectFailure(patch('forge_wc_cases', wc.id, { injury_date: '2999-01-01' }), 'injury date cannot be in the future', { code: '23514' })
    await expectFailure(patch('forge_wc_cases', wc.id, { reported_date: `${YEAR}-04-01` }), 'reported date cannot precede the injury', { code: '23514' })

    const updated = (await patch('forge_wc_cases', wc.id, { carrier_id: carrier.id, claim_number: 'CLM-' + RUN, stage: 'investigation' }))[0]
    assert(updated.row_version === 2, 'updates increment row_version')

    console.log('Work status periods')
    await insert('forge_wc_work_status_periods', { organization_id: ORG_A, case_id: wc.id, work_status: 'off_work', start_date: `${YEAR}-04-07`, end_date: `${YEAR}-04-11` })
    await expectFailure(
      insert('forge_wc_work_status_periods', { organization_id: ORG_A, case_id: wc.id, work_status: 'restricted', start_date: `${YEAR}-04-10` }),
      'work status periods cannot overlap',
      { code: '23P01' }
    )
    await insert('forge_wc_work_status_periods', { organization_id: ORG_A, case_id: wc.id, work_status: 'restricted', start_date: `${YEAR}-04-12` })
    await expectFailure(
      insert('forge_wc_work_status_periods', { organization_id: ORG_A, case_id: wc.id, work_status: 'off_work', start_date: `${YEAR}-03-01`, end_date: `${YEAR}-03-02` }),
      'periods cannot start before the injury',
      { code: '23514' }
    )
    await expectFailure(
      insert('forge_wc_work_status_periods', { organization_id: ORG_A, case_id: wc.id, work_status: 'off_work', start_date: `${YEAR}-06-10`, end_date: `${YEAR}-06-01` }),
      'periods cannot end before they start',
      { code: '23514' }
    )

    console.log('Restrictions, weekly updates and medical visits')
    await expectFailure(
      insert('forge_wc_restrictions', { organization_id: ORG_A, case_id: wc.id, start_date: `${YEAR}-04-12`, upper_extremity: ['no-juggling'] }),
      'restriction checklists only accept known options',
      { code: '23514' }
    )
    const restriction = await insert('forge_wc_restrictions', {
      organization_id: ORG_A, case_id: wc.id, start_date: `${YEAR}-04-12`, lifting_level: 'light',
      upper_extremity: ['no-lift-above-shoulder'], lower_extremity: ['no-ladders'], push_pull_limit_lbs: 20, transitional_hours_per_day: 6
    })
    assert(restriction.status === 'active', 'restrictions start active')

    await expectFailure(
      insert('forge_wc_weekly_updates', { organization_id: ORG_A, case_id: wc.id, week_of: `${YEAR}-04-15`, notes: 'Tuesday' }),
      'weekly updates are keyed to Thursdays',
      { code: '23514' }
    )
    await insert('forge_wc_weekly_updates', { organization_id: ORG_A, case_id: wc.id, week_of: `${YEAR}-04-17`, notes: 'Light duty, improving.' })
    await expectFailure(
      insert('forge_wc_weekly_updates', { organization_id: ORG_A, case_id: wc.id, week_of: `${YEAR}-04-17`, notes: 'Second' }),
      'one weekly update per case per week',
      { code: '23505' }
    )
    await insert('forge_wc_medical_encounters', { organization_id: ORG_A, case_id: wc.id, encounter_date: `${YEAR}-04-08`, provider_name: 'Clinic', diagnosis: 'Lumbar strain' })

    console.log('OSHA sync')
    const oshaNumber = await rpc('next_forge_osha_case_number', { p_organization_id: ORG_A, p_location_id: location.id, p_year: YEAR })
    const osha = await insert('forge_osha_cases', {
      organization_id: ORG_A, case_number: oshaNumber, incident_id: incident.id, personnel_id: person.id, location_id: location.id,
      employee_name: 'Wc Worker', injury_date: `${YEAR}-04-07`, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    await patch('forge_wc_cases', wc.id, { osha_recordable: true, osha_privacy_case: true, osha_case_type: 'injury' })

    const synced = await rpc('forge_apply_wc_to_osha_case', {
      p_organization_id: ORG_A, p_wc_case_id: wc.id, p_osha_case_id: osha.id, p_recordable: true, p_privacy: true,
      p_case_outcome: 'days_away', p_case_type: 'injury', p_days_away: 150, p_restricted_days: 60, p_actor_user_id: ADMIN_USER
    })
    assert(synced.recordability === 'recordable' && synced.is_privacy_case === true && synced.case_outcome === 'days_away', 'sync makes the OSHA case recordable with the outcome')
    assert(synced.days_away === 150 && synced.restricted_days === 30, 'sync caps the days at 180, days away first')
    const [linked] = await request(`/rest/v1/forge_wc_cases?id=eq.${wc.id}&select=osha_case_id,osha_synced_at`)
    assert(linked.osha_case_id === osha.id && linked.osha_synced_at, 'the workers\' comp case records its OSHA link and sync time')
    const oshaActivity = await request(`/rest/v1/forge_osha_case_activity?case_id=eq.${osha.id}&activity_type=eq.synced_from_workers_comp`)
    assert(oshaActivity.length === 1, 'the OSHA case history notes the sync')

    const cleared = await rpc('forge_apply_wc_to_osha_case', {
      p_organization_id: ORG_A, p_wc_case_id: wc.id, p_osha_case_id: osha.id, p_recordable: false, p_privacy: false,
      p_case_outcome: null, p_case_type: null, p_days_away: 4, p_restricted_days: 0, p_actor_user_id: ADMIN_USER
    })
    assert(cleared.recordability === 'not_recordable' && cleared.case_outcome === null && cleared.is_privacy_case === false, 'clearing the flag marks the OSHA case not recordable')
    assert(cleared.not_recordable_reason.includes(number), 'the not-recordable reason names the workers\' comp case')

    await patch('forge_osha_cases', osha.id, { status: 'voided', void_reason: 'Test' })
    await expectFailure(
      rpc('forge_apply_wc_to_osha_case', {
        p_organization_id: ORG_A, p_wc_case_id: wc.id, p_osha_case_id: osha.id, p_recordable: true, p_privacy: false,
        p_case_outcome: 'other_recordable', p_case_type: 'injury', p_days_away: 0, p_restricted_days: 0, p_actor_user_id: ADMIN_USER
      }),
      'a voided OSHA case is never re-used',
      { code: '23514' }
    )

    console.log('Tenant guards and archived cases')
    const org = await insert('organizations', { name: 'WC Isolation ' + RUN, slug: 'wc-isolation-' + RUN, status: 'active', created_by: ADMIN_USER })
    created.orgs.push(org.id)
    const foreignCarrier = await insert('forge_wc_carriers', { organization_id: org.id, name: 'Foreign Carrier' })
    await expectFailure(patch('forge_wc_cases', wc.id, { carrier_id: foreignCarrier.id }), 'a case cannot use another organization\'s carrier', { code: '23503' })
    await expectFailure(
      insert('forge_wc_cases', { ...base, organization_id: org.id, case_number: 'X-' + RUN, personnel_id: null, location_id: null, incident_id: incident.id }),
      'a case cannot link another organization\'s incident',
      { code: '23503' }
    )
    await expectFailure(
      insert('forge_wc_work_status_periods', { organization_id: org.id, case_id: wc.id, work_status: 'off_work', start_date: `${YEAR}-05-01` }),
      'child rows cannot be filed under another organization',
      { code: '23503' }
    )

    await patch('forge_wc_cases', wc.id, { osha_recordable: false, osha_privacy_case: false, status: 'archived' })
    await expectFailure(patch('forge_wc_cases', wc.id, { claim_notes: 'x' }), 'archived cases cannot be edited', { code: '23514' })
    await expectFailure(
      insert('forge_wc_weekly_updates', { organization_id: ORG_A, case_id: wc.id, week_of: `${YEAR}-04-24`, notes: 'x' }),
      'archived cases accept no new records',
      { code: '23514' }
    )

    console.log('Permissions')
    const grants = await request(
      '/rest/v1/forge_tenant_role_permissions?select=forge_tenant_roles!inner(role_key,organization_id),forge_permission_registry!inner(permission_key)' +
      `&forge_tenant_roles.organization_id=eq.${ORG_A}&forge_permission_registry.permission_key=like.workers_comp.medical.*`
    )
    const roles = new Set(grants.map(row => row.forge_tenant_roles.role_key))
    assert(roles.has('company-owner') && roles.has('company-administrator'), 'company owners and administrators get medical access')
    assert(!roles.has('read-only') && !roles.has('employee') && !roles.has('supervisor'), 'read-only, employee and supervisor roles do not')

    console.log('Direct access as an authenticated member (demo employee)')
    const token = await signIn('user@forge2.local')
    for (const table of ['forge_wc_cases', 'forge_wc_carriers', 'forge_wc_work_status_periods', 'forge_wc_restrictions', 'forge_wc_medical_encounters', 'forge_wc_weekly_updates', 'forge_wc_case_activity']) {
      await expectFailure(request(`/rest/v1/${table}?select=*`, { token }), `members cannot read ${table}`)
    }
    await expectFailure(rpc('next_forge_wc_case_number', { p_organization_id: ORG_A, p_year: YEAR }, { token }), 'members cannot draw case numbers')
    await expectFailure(
      rpc('forge_apply_wc_to_osha_case', {
        p_organization_id: ORG_A, p_wc_case_id: wc.id, p_osha_case_id: osha.id, p_recordable: true, p_privacy: false,
        p_case_outcome: 'other_recordable', p_case_type: 'injury', p_days_away: 0, p_restricted_days: 0, p_actor_user_id: ADMIN_USER
      }, { token }),
      'members cannot run the OSHA sync'
    )

    console.log('All port slice 2 workers\' comp DB checks passed.')
  } finally {
    for (const id of created.incidents) {
      await request(`/rest/v1/forge_wc_cases?incident_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
      await request(`/rest/v1/forge_osha_cases?incident_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    }
    for (const id of created.locations) await request(`/rest/v1/forge_wc_cases?location_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.incidents) await request(`/rest/v1/forge_incidents?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.carriers) await request(`/rest/v1/forge_wc_carriers?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.personnel) await request(`/rest/v1/forge_personnel?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.locations) await request(`/rest/v1/locations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.orgs) await request(`/rest/v1/organizations?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
