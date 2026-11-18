/**
 * Batch 1 parity: workers' comp relink guard and weekly notice dedupe (database contract).
 * Run: node apps/web/tests/port-b1-wc-db.cjs
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
  console.log('Batch 1: workers\' comp parity DB checks')
  const created = { locations: [], incidents: [], personnel: [], orgs: [], cases: [] }

  try {
    const location = await insert('locations', { organization_id: ORG_A, name: 'WC B1 Plant ' + RUN, code: 'WB' + RUN })
    const location2 = await insert('locations', { organization_id: ORG_A, name: 'WC B1 Yard ' + RUN, code: 'WY' + RUN })
    created.locations.push(location.id, location2.id)
    const newPerson = async (organizationId, lastName) =>
      insert('forge_personnel', {
        organization_id: organizationId, first_name: 'Wcb', last_name: lastName + ' ' + RUN, employment_status: 'active', created_by: ADMIN_USER, updated_by: ADMIN_USER
      })
    const person = await newPerson(ORG_A, 'Worker')
    const person2 = await newPerson(ORG_A, 'Other')
    created.personnel.push(person.id, person2.id)
    const newIncident = async (organizationId, summary, locationId = null) => {
      const incidentNumber = await rpc('next_forge_incident_number', { p_organization_id: organizationId })
      const row = await insert('forge_incidents', {
        organization_id: organizationId, incident_number: incidentNumber, occurred_at: `${YEAR}-05-07T14:00:00Z`, location_id: locationId,
        summary: summary + ' ' + RUN, incident_type: 'injury', involves_injury: true, created_by: ADMIN_USER, updated_by: ADMIN_USER
      })
      created.incidents.push(row.id)
      return row
    }
    const incident = await newIncident(ORG_A, 'Wrong incident', location.id)
    const incident2 = await newIncident(ORG_A, 'Right incident', location.id)

    console.log('Relinking employee, incident and Location')
    const number = await rpc('next_forge_wc_case_number', { p_organization_id: ORG_A, p_year: YEAR })
    const wc = await insert('forge_wc_cases', {
      organization_id: ORG_A, case_number: number, personnel_id: null, employee_name: 'Typed Name', location_id: location.id,
      injury_date: `${YEAR}-05-07`, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    created.cases.push(wc.id)

    const [linked] = await patch('forge_wc_cases', wc.id, { personnel_id: person.id, incident_id: incident.id, location_id: location2.id })
    assert(linked.personnel_id === person.id && linked.incident_id === incident.id && linked.location_id === location2.id, 'an unlinked case can be linked to an employee, incident and Location')

    const [relinked] = await patch('forge_wc_cases', wc.id, { incident_id: incident2.id, personnel_id: person2.id })
    assert(relinked.incident_id === incident2.id && relinked.personnel_id === person2.id, 'with no OSHA link the incident and employee can change')

    const otherOrg = await insert('organizations', { name: 'WC B1 Other ' + RUN, slug: 'wc-b1-other-' + RUN, status: 'active', created_by: ADMIN_USER })
    created.orgs.push(otherOrg.id)
    const foreignLocation = await insert('locations', { organization_id: otherOrg.id, name: 'Foreign ' + RUN, code: 'FX' + RUN })
    const foreignPerson = await newPerson(otherOrg.id, 'Foreign')
    created.personnel.push(foreignPerson.id)
    const foreignIncident = await newIncident(otherOrg.id, 'Foreign')
    await expectFailure(patch('forge_wc_cases', wc.id, { incident_id: foreignIncident.id }), 'an incident from another company is refused', { code: '23503' })
    await expectFailure(patch('forge_wc_cases', wc.id, { personnel_id: foreignPerson.id }), 'an employee from another company is refused')
    await expectFailure(patch('forge_wc_cases', wc.id, { location_id: foreignLocation.id }), 'a Location from another company is refused')

    // The employee already has a live case for that injury date: relinking to them is refused.
    const dupNumber = await rpc('next_forge_wc_case_number', { p_organization_id: ORG_A, p_year: YEAR })
    const dup = await insert('forge_wc_cases', {
      organization_id: ORG_A, case_number: dupNumber, personnel_id: person.id, employee_name: 'Wcb Worker', location_id: location.id,
      injury_date: `${YEAR}-05-07`, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    created.cases.push(dup.id)
    await expectFailure(patch('forge_wc_cases', wc.id, { personnel_id: person.id }), 'relinking to an employee who already has a case for that injury date is refused', { code: '23505' })

    console.log('OSHA link guard')
    const oshaNumber = await rpc('next_forge_osha_case_number', { p_organization_id: ORG_A, p_location_id: location.id, p_year: YEAR })
    const osha = await insert('forge_osha_cases', {
      organization_id: ORG_A, case_number: oshaNumber, incident_id: incident2.id, personnel_id: person2.id, location_id: location.id,
      employee_name: 'Wcb Other', injury_date: `${YEAR}-05-07`, created_by: ADMIN_USER, updated_by: ADMIN_USER
    })
    await patch('forge_wc_cases', wc.id, { osha_recordable: true })
    await rpc('forge_apply_wc_to_osha_case', {
      p_organization_id: ORG_A, p_wc_case_id: wc.id, p_osha_case_id: osha.id, p_recordable: true, p_privacy: false,
      p_case_outcome: 'other_recordable', p_case_type: 'injury', p_days_away: 0, p_restricted_days: 0, p_actor_user_id: ADMIN_USER
    })

    await expectFailure(patch('forge_wc_cases', wc.id, { incident_id: incident.id }), 'a case linked to a live OSHA case keeps its incident', { code: '23514', pattern: /linked to an OSHA case/ })
    await expectFailure(patch('forge_wc_cases', wc.id, { personnel_id: null }), 'a case linked to a live OSHA case keeps its employee', { code: '23514', pattern: /linked to an OSHA case/ })

    const [moved] = await patch('forge_wc_cases', wc.id, { location_id: location2.id, incident_id: incident2.id })
    assert(moved.location_id === location2.id && moved.incident_id === incident2.id, 'the Location can still change, and re-sending the same incident is not a change')

    const [detached] = await patch('forge_wc_cases', wc.id, { osha_recordable: false, osha_case_id: null, incident_id: incident.id })
    assert(detached.osha_case_id === null && detached.incident_id === incident.id, 'detaching the OSHA case in the same write lets the incident change')

    await patch('forge_wc_cases', wc.id, { incident_id: incident2.id })
    await patch('forge_wc_cases', wc.id, { osha_case_id: osha.id })
    await patch('forge_osha_cases', osha.id, { status: 'voided', void_reason: 'Test' })
    const [afterVoid] = await patch('forge_wc_cases', wc.id, { incident_id: incident.id })
    assert(afterVoid.incident_id === incident.id, 'a voided OSHA case does not hold the incident')

    console.log('Weekly notice dedupe (manual send, then a second click or the scheduled run)')
    const weekOrg = await insert('organizations', { name: 'WC B1 Week ' + RUN, slug: 'wc-b1-week-' + RUN, status: 'active', created_by: ADMIN_USER })
    created.orgs.push(weekOrg.id)
    await request('/rest/v1/organization_memberships', { method: 'POST', body: { organization_id: weekOrg.id, user_id: ADMIN_USER, role: 'admin', is_active: true } })
    await request('/rest/v1/forge_wc_settings', { method: 'POST', body: { organization_id: weekOrg.id, weekly_email_enabled: true, weekly_email_recipient_ids: [ADMIN_USER] } })
    const queue = () =>
      rpc('forge_wc_queue_weekly_status', {
        p_organization_id: weekOrg.id, p_week_of: '2026-11-12', p_title: 'Weekly status', p_body: 'Body',
        p_deliveries: [{ user_id: ADMIN_USER, title: 'T', body: 'B' }]
      })
    const first = await queue()
    assert(first.queued === 1 && first.reason === 'queued', 'the first send queues the week')
    const second = await queue()
    assert(second.queued === 0 && second.reason === 'already_sent', 'a second click does not send the week again')
    const events = await request(`/rest/v1/forge_notification_events?organization_id=eq.${weekOrg.id}&payload->>week_of=eq.2026-11-12&source_module=eq.workers_comp&event_type=eq.weekly_status&select=id`)
    const deliveries = await request(`/rest/v1/forge_notification_deliveries?event_id=eq.${events[0].id}&channel=eq.in_app&select=recipient_user_id`)
    assert(events.length === 1 && deliveries.length === 1, 'one event and one in-app delivery: the "already sent" count the settings page reports')

    console.log('All batch 1 workers\' comp DB checks passed.')
  } finally {
    for (const id of created.cases) await request(`/rest/v1/forge_wc_cases?id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
    for (const id of created.incidents) await request(`/rest/v1/forge_osha_cases?incident_id=eq.${id}`, { method: 'DELETE' }).catch(() => {})
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
