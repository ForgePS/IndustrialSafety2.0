/**
 * Port slice 13: scheduled report delivery end to end (plain node against the running app and PostgREST).
 *
 * Seeds saved reports with schedules due a minute ago and calls /api/reporting/cron with the FORGE_CRON_SECRET
 * from .env.local. Checks: a wrong secret is refused; a shared report is sent to the admin (notice in-app sent +
 * email pending, linking to the saved report) and skipped for the employee who can't run it (a denied run is
 * logged, no notice); the schedule's next run moves into the future and a second call sends nothing new; a
 * disabled schedule is left alone; a private report is only sent to its owner; and a schedule whose saved report
 * was archived is skipped.
 *
 * Run from apps/web (dev server on :3001): node tests/port-s13-reporting-cron.cjs
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')

for (const file of ['../.env.local', '../.env']) {
  const envPath = path.join(__dirname, file)

  if (!fs.existsSync(envPath)) continue

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)

    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"(.*)"$/, '$1')
  }
}

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3001'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.FORGE_CRON_SECRET
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-6)

assert.ok(API_URL && SERVICE_ROLE_KEY, 'Supabase URL and service role key are needed (apps/web/.env.local).')
assert.ok(SECRET, 'FORGE_CRON_SECRET is needed in apps/web/.env.local.')

const rest = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  const json = text ? JSON.parse(text) : null

  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status} ${text}`)

  return json
}

const cron = async (secret = SECRET) => {
  const response = await fetch(BASE + '/api/reporting/cron', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } })
  const text = await response.text()

  return { status: response.status, body: text ? JSON.parse(text) : null }
}

const dueAgo = () => new Date(Date.now() - 60_000).toISOString()

const seed = async ({ name, visibility = 'organization', enabled = true, recipients }) => {
  const [saved] = await rest('forge_saved_reports', {
    method: 'POST',
    body: { organization_id: ORG, owner_user_id: ADMIN, report_key: 'incidents.log', name: `S13 cron ${name} ${RUN}`, params: { preset: 'all', groupBy: 'severity' }, visibility }
  })
  const [schedule] = await rest('forge_report_schedules', {
    method: 'POST',
    body: {
      organization_id: ORG,
      saved_report_id: saved.id,
      created_by: ADMIN,
      frequency: 'daily',
      hour: 6,
      weekday: 1,
      monthday: 1,
      timezone: 'America/Chicago',
      enabled,
      next_run_at: dueAgo()
    }
  })

  await rest('forge_report_schedule_recipients', { method: 'POST', body: recipients.map(user_id => ({ schedule_id: schedule.id, organization_id: ORG, user_id })) })

  return { saved, schedule }
}

const eventsFor = saved => rest(`forge_notification_events?resource_id=eq.${saved.id}&source_module=eq.reporting&select=id,payload,forge_notification_deliveries(channel,status,link_path,recipient_user_id)`)
const runsFor = schedule => rest(`forge_report_runs?schedule_id=eq.${schedule.id}&select=user_id,kind,status,row_count`)

async function main() {
  const created = []

  try {
    const denied = await cron('wrong-secret')

    assert.equal(denied.status, 401, 'wrong secret refused')
    console.log('ok - the cron route refuses a wrong secret')

    const shared = await seed({ name: 'shared', recipients: [ADMIN, USER] })
    const off = await seed({ name: 'off', enabled: false, recipients: [ADMIN] })
    const privateOne = await seed({ name: 'private', visibility: 'private', recipients: [ADMIN, USER] })
    const archived = await seed({ name: 'archived', recipients: [ADMIN] })

    created.push(shared.saved.id, off.saved.id, privateOne.saved.id, archived.saved.id)
    await rest('forge_saved_reports?id=eq.' + archived.saved.id, { method: 'PATCH', body: { archived_at: new Date().toISOString() } })

    const first = await cron()

    assert.equal(first.status, 200, JSON.stringify(first.body))

    const outcome = schedule => first.body.outcomes.find(row => row.scheduleId === schedule.id)

    assert.deepEqual({ ...outcome(shared.schedule), error: undefined }, { scheduleId: shared.schedule.id, status: 'sent', sent: 1, skipped: 1, error: undefined })
    assert.equal(outcome(off.schedule), undefined, 'disabled schedule left alone')
    assert.equal(outcome(privateOne.schedule).sent, 1)
    assert.equal(outcome(privateOne.schedule).skipped, 1)
    assert.equal(outcome(archived.schedule).status, 'skipped')
    assert.match(outcome(archived.schedule).error, /deleted/)
    console.log('ok - due schedules run; disabled ones are left alone; archived reports are skipped')

    const [event, ...more] = await eventsFor(shared.saved)

    assert.equal(more.length, 0, 'one notice for the shared report')
    assert.equal(event.payload.recipient_user_id, ADMIN)

    const channels = Object.fromEntries(event.forge_notification_deliveries.map(row => [row.channel, row]))

    assert.equal(channels.in_app.status, 'sent')
    assert.equal(channels.email.status, 'pending')
    assert.equal(channels.in_app.link_path, '/reporting/saved/' + shared.saved.id)
    assert.ok(event.forge_notification_deliveries.every(row => row.recipient_user_id === ADMIN))

    const runs = await runsFor(shared.schedule)

    assert.deepEqual(runs.map(row => row.user_id + ':' + row.status).sort(), [ADMIN + ':succeeded', USER + ':denied'].sort())
    assert.ok(runs.every(row => row.kind === 'scheduled'))
    console.log("ok - the admin gets a notice and an email; the employee who can't run the report is skipped and the denied run is logged")

    const privateEvents = await eventsFor(privateOne.saved)

    assert.deepEqual(
      privateEvents.map(row => row.payload.recipient_user_id),
      [ADMIN]
    )
    assert.equal((await runsFor(privateOne.schedule)).length, 1, 'no run for the other recipient of a private report')
    console.log('ok - a private report is only sent to its owner')

    const [after] = await rest('forge_report_schedules?id=eq.' + shared.schedule.id + '&select=next_run_at,last_status,last_run_at')

    assert.ok(new Date(after.next_run_at) > new Date(), 'next run moved into the future')
    assert.equal(after.last_status, 'sent')
    assert.ok(after.last_run_at)

    const second = await cron()

    assert.equal(second.body.outcomes.find(row => row.scheduleId === shared.schedule.id), undefined)
    assert.equal((await eventsFor(shared.saved)).length, 1, 'no new notice on a second run')
    console.log('ok - the next run moves forward and a second call sends nothing new')
  } finally {
    for (const id of created) {
      await rest('forge_notification_events?resource_id=eq.' + id + '&source_module=eq.reporting', { method: 'DELETE' }).catch(() => {})
      await rest('forge_saved_reports?id=eq.' + id, { method: 'DELETE' }).catch(() => {})
    }
  }

  console.log('\nport-s13 reporting cron checks passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
