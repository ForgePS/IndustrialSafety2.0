/**
 * Port slice 8: database checks for the CAPA reminder sweep (src/lib/forgeCapaNotify.ts, route
 * /api/corrective-actions/cron). Seeds an overdue and a due-soon CAPA, runs the cron twice through the dev server
 * (http://localhost:3001, or BASE_URL) and checks the notices were queued once. Cleans up its rows and any CAPA
 * reminder notices the sweep queued for other CAPAs during the run.
 * Run: node apps/web/tests/port-s8-capa-notify-db.cjs
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
const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
const CRON_SECRET = process.env.FORGE_CRON_SECRET
const ORG = '20000000-0000-4000-8000-000000000100'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const RUN = Date.now().toString(36)

async function request(pathname, options = {}) {
  const response = await fetch(API_URL + pathname, {
    method: options.method || 'GET',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
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
  if (!response.ok) throw new Error(String((data && data.message) || response.status))
  return data
}

function assert(condition, message) {
  if (!condition) throw new Error('FAIL: ' + message)
  console.log('  ok - ' + message)
}

const daysFromNow = days => new Date(Date.now() + days * 86_400_000).toISOString()

async function runCron() {
  const response = await fetch(BASE_URL + '/api/corrective-actions/cron', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + CRON_SECRET }
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, body }
}

const created = []
const startedAt = new Date(Date.now() - 1000).toISOString()

async function eventsFor(capaId) {
  return request(
    `/rest/v1/forge_notification_events?source_module=eq.corrective_actions&resource_id=eq.${capaId}` +
      '&select=id,event_type,payload,forge_notification_deliveries(channel,status,recipient_user_id,link_path)'
  )
}

async function main() {
  let reachable = true
  try {
    const unauthorized = await fetch(BASE_URL + '/api/corrective-actions/cron', { method: 'POST' })
    console.log('cron auth')
    assert(unauthorized.status === 401, 'cron without the bearer secret is rejected')
  } catch {
    reachable = false
  }

  if (!reachable) {
    console.log('SKIP: dev server not reachable at ' + BASE_URL + '; the sweep was not exercised.')
    return
  }
  if (!CRON_SECRET) throw new Error('FORGE_CRON_SECRET is not set in apps/web/.env.local')

  console.log('seed')
  const rows = await request('/rest/v1/forge_corrective_actions', {
    method: 'POST',
    body: [
      { organization_id: ORG, action_number: `CA-S8N-${RUN}-1`, title: 'S8 notify overdue', status: 'open', due_at: daysFromNow(-2), assigned_user_id: ADMIN, created_by: ADMIN },
      { organization_id: ORG, action_number: `CA-S8N-${RUN}-2`, title: 'S8 notify due soon', status: 'in_progress', due_at: daysFromNow(1), assigned_user_id: ADMIN, created_by: ADMIN },
      { organization_id: ORG, action_number: `CA-S8N-${RUN}-3`, title: 'S8 notify far out', status: 'open', due_at: daysFromNow(20), assigned_user_id: ADMIN, created_by: ADMIN },
      { organization_id: ORG, action_number: `CA-S8N-${RUN}-4`, title: 'S8 notify closed', status: 'closed', due_at: daysFromNow(-2), assigned_user_id: ADMIN, created_by: ADMIN }
    ]
  })
  created.push(...rows.map(row => row.id))
  const [overdue, soon, far, closed] = rows
  assert(rows.length === 4, 'seeded four CAPAs')

  console.log('first sweep')
  const first = await runCron()
  assert(first.status === 200 && first.body?.ok, 'cron returns ok (' + JSON.stringify(first.body) + ')')
  assert(first.body.reminders.queued >= 2, 'at least the two seeded reminders were queued')

  const overdueEvents = await eventsFor(overdue.id)
  assert(overdueEvents.length === 1 && overdueEvents[0].event_type === 'overdue', 'overdue CAPA has one overdue notice')
  const deliveries = overdueEvents[0].forge_notification_deliveries
  assert(deliveries.length === 2, 'notice has two deliveries')
  const inApp = deliveries.find(d => d.channel === 'in_app')
  const email = deliveries.find(d => d.channel === 'email')
  assert(inApp && inApp.status === 'sent' && inApp.recipient_user_id === ADMIN, 'in-app delivery to the assignee, marked sent')
  assert(email && email.status === 'pending', 'email delivery queued for the outbox')
  assert(inApp.link_path === '/corrective-actions/' + overdue.id, 'links to the CAPA')
  assert(String(overdueEvents[0].payload.dedupe_key).startsWith('capa:overdue:' + overdue.id + ':'), 'event carries the dedupe key')

  const soonEvents = await eventsFor(soon.id)
  assert(soonEvents.length === 1 && soonEvents[0].event_type === 'due_soon', 'due-soon CAPA has one due-soon notice')
  assert((await eventsFor(far.id)).length === 0, 'CAPA due in 20 days gets nothing')
  assert((await eventsFor(closed.id)).length === 0, 'closed CAPA gets nothing')

  console.log('second sweep')
  const second = await runCron()
  assert(second.status === 200 && second.body?.ok, 'second cron run ok')
  assert(second.body.reminders.queued === 0, 'second run queues nothing new')
  assert(second.body.reminders.duplicate >= 2, 'second run reports the seeded notices as duplicates')
  assert((await eventsFor(overdue.id)).length === 1, 'overdue notice not duplicated')
  assert((await eventsFor(soon.id)).length === 1, 'due-soon notice not duplicated')
}

async function cleanup() {
  if (created.length) {
    await request(`/rest/v1/forge_notification_events?source_module=eq.corrective_actions&resource_id=in.(${created.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' })
    await request(`/rest/v1/forge_corrective_actions?id=in.(${created.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' })
  }
  // Reminders the sweep queued for pre-existing CAPAs during this run (none existed before this feature).
  await request(
    `/rest/v1/forge_notification_events?source_module=eq.corrective_actions&event_type=in.(due_soon,overdue)&actor_user_id=is.null&created_at=gte.${encodeURIComponent(startedAt)}`,
    { method: 'DELETE', prefer: 'return=minimal' }
  )
}

main()
  .then(cleanup)
  .then(() => console.log('port-s8-capa-notify-db: passed'))
  .catch(async error => {
    console.error(error.message)
    try {
      await cleanup()
    } catch (cleanupError) {
      console.error('cleanup failed: ' + cleanupError.message)
    }
    process.exit(1)
  })
