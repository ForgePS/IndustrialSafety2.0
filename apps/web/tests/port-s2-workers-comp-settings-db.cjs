/**
 * Port slice 2 completion: workers' comp settings database checks.
 * Run: node apps/web/tests/port-s2-workers-comp-settings-db.cjs
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
const ADMIN_USER = '20000000-0000-4000-8000-000000000001'
const MEMBER_USER = '20000000-0000-4000-8000-000000000002'
const OUTSIDER = '30000000-0000-4000-8000-000000000999'
const WEEK = '2026-10-22'
const RUN = Date.now().toString().slice(-7)

async function request(pathname, options = {}) {
  const token = options.token || SERVICE_ROLE_KEY
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: options.token ? ANON_KEY : SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const error = new Error((data && data.message) || String(response.status))
    error.code = data && data.code
    throw error
  }
  return data
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

async function expectFailure(promise, message, code) {
  try {
    await promise
  } catch (error) {
    if (code && error.code !== code) throw new Error(`FAIL: ${message} (expected ${code}, got ${error.code}: ${error.message})`)
    console.log('  ok - ' + message)
    return
  }
  throw new Error('FAIL: ' + message + ' (unexpectedly succeeded)')
}

async function main() {
  console.log('Port slice 2 completion: workers\' comp settings DB checks')
  const [org] = await request('/rest/v1/organizations', {
    method: 'POST',
    body: { name: 'WC Settings ' + RUN, slug: 'wc-settings-' + RUN, status: 'active', created_by: ADMIN_USER }
  })

  try {
    const [settings] = await request('/rest/v1/forge_wc_settings', { method: 'POST', body: { organization_id: org.id } })
    assert(
      settings.weekly_email_enabled === false && settings.weekly_email_weekday === 5 && settings.weekly_email_hour === 7 && settings.time_zone === 'America/Chicago',
      'defaults match 1.0: off, Fridays 7:00 AM Central'
    )

    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, { method: 'PATCH', body: { weekly_email_enabled: true } }),
      'the notice cannot be turned on without recipients',
      '23514'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, { method: 'PATCH', body: { weekly_email_weekday: 7 } }),
      'weekday must be 0-6',
      '23514'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, { method: 'PATCH', body: { weekly_email_hour: 24 } }),
      'hour must be 0-23',
      '23514'
    )
    await expectFailure(
      request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, {
        method: 'PATCH',
        body: { weekly_email_recipient_ids: Array.from({ length: 51 }, (_, index) => `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`) }
      }),
      'no more than 50 recipients',
      '23514'
    )

    const queue = (body, options = {}) =>
      request('/rest/v1/rpc/forge_wc_queue_weekly_status', {
        method: 'POST',
        token: options.token,
        body: { p_organization_id: org.id, p_week_of: WEEK, p_title: 'Weekly status', p_body: 'Event body', p_deliveries: body }
      })

    const disabled = await queue([{ user_id: ADMIN_USER, title: 'T', body: 'B' }])
    assert(disabled.queued === 0 && disabled.reason === 'disabled', 'nothing is queued while the notice is off')

    // The admin is an active member of the test org; the demo employee is not.
    await request('/rest/v1/organization_memberships', { method: 'POST', body: { organization_id: org.id, user_id: ADMIN_USER, role: 'admin', is_active: true } })

    const [enabled] = await request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}`, {
      method: 'PATCH',
      body: { weekly_email_enabled: true, weekly_email_recipient_ids: [ADMIN_USER, MEMBER_USER] }
    })
    assert(enabled.weekly_email_enabled && enabled.updated_at !== settings.updated_at, 'enabling with a recipient works and updates the timestamp')

    await expectFailure(queue([{ user_id: MEMBER_USER, title: 'T', body: 'B' }]), 'a recipient who is not an active member is refused', '42501')
    await expectFailure(queue([{ user_id: OUTSIDER, title: 'T', body: 'B' }]), 'a user who is not on the saved list is refused', '42501')
    await expectFailure(queue({ user_id: ADMIN_USER }), 'deliveries must be an array', '22023')

    const refusedEvents = await request(`/rest/v1/forge_notification_events?organization_id=eq.${org.id}&select=id`)
    const [afterRefusal] = await request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}&select=last_weekly_email_week`)
    assert(refusedEvents.length === 0 && afterRefusal.last_weekly_email_week === null, 'a refused queue leaves no event and does not mark the week')

    const queued = await queue([{ user_id: ADMIN_USER, title: 'Workers\' comp weekly status: 1 open case', body: 'Scoped body for the admin' }])
    assert(queued.queued === 1 && queued.reason === 'queued' && queued.event_id, 'the notice is queued for the recipient')

    const [event] = await request(`/rest/v1/forge_notification_events?id=eq.${queued.event_id}&select=*`)
    assert(event.source_module === 'workers_comp' && event.event_type === 'weekly_status' && event.visibility === 'customer' && event.payload.week_of === WEEK, 'the event is a customer-visible workers\' comp weekly status')

    const deliveries = await request(`/rest/v1/forge_notification_deliveries?event_id=eq.${queued.event_id}&select=*&order=channel`)
    const inApp = deliveries.find(item => item.channel === 'in_app')
    const mail = deliveries.find(item => item.channel === 'email')
    assert(deliveries.length === 2 && deliveries.every(item => item.recipient_user_id === ADMIN_USER && item.link_path === '/workers-comp/weekly'), 'one in-app and one email delivery go to the recipient, linked to the weekly page')
    assert(inApp.status === 'sent' && inApp.sent_at && mail.status === 'pending', 'the in-app notice is delivered now and the email waits in the outbox')
    assert(mail.title === 'Workers\' comp weekly status: 1 open case' && mail.body === 'Scoped body for the admin', 'each delivery carries the recipient\'s own scoped content')

    const [marked] = await request(`/rest/v1/forge_wc_settings?organization_id=eq.${org.id}&select=last_weekly_email_week`)
    assert(marked.last_weekly_email_week === WEEK, 'the week is marked sent')

    const repeat = await queue([{ user_id: ADMIN_USER, title: 'T', body: 'B' }])
    const allEvents = await request(`/rest/v1/forge_notification_events?organization_id=eq.${org.id}&select=id`)
    assert(repeat.queued === 0 && repeat.reason === 'already_sent' && allEvents.length === 1, 'the same week is never queued twice')

    const tokenResponse = await fetch(API_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@forge2.local', password: 'ForgeDev2!' })
    })
    const { access_token: token } = await tokenResponse.json()
    await expectFailure(request('/rest/v1/forge_wc_settings?select=*', { token }), 'members cannot read workers\' comp settings')
    await expectFailure(queue([{ user_id: ADMIN_USER, title: 'T', body: 'B' }], { token }), 'members cannot call the queue function')

    console.log('All workers\' comp settings DB checks passed.')
  } finally {
    await request(`/rest/v1/organizations?id=eq.${org.id}`, { method: 'DELETE' }).catch(() => {})
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
