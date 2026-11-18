/**
 * Port slice 11 (agent C): fleet reminder job end to end (plain node against the running app and PostgREST).
 *
 * Seeds a vehicle with a registration due in 10 days, expired insurance, an annual inspection due in 5 days,
 * an overdue maintenance item, a DVIR with defects waiting 2 days for a mechanic and an expiring vehicle
 * document; calls /api/fleet/cron with the FORGE_CRON_SECRET from .env.local; checks that the seed admin
 * (Company Owner: fleet.edit, organization) got one notice-log row per reminder, one digest event with an
 * in-app and a pending email delivery, and that a second run queues nothing new. A user without fleet.edit /
 * fleet.maintenance gets nothing. Also checks the route refuses a wrong secret.
 *
 * Run from apps/web (dev server on :3001): node tests/port-s11-fleet-cron.cjs
 */
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const { execSync } = require('child_process')

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
const DAY = 86_400_000
const iso = offsetDays => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10)

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
  const response = await fetch(BASE + '/api/fleet/cron', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } })

  return { status: response.status, body: await response.json().catch(() => null) }
}

const psql = sql => execSync('docker exec -i supabase_db_forge-industrial-safety-2-0 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q', { input: sql })

const main = async () => {
  const ids = {}
  let passed = 0
  const check = (name, fn) => {
    fn()
    passed += 1
    console.log('ok -', name)
  }

  try {
    const [vehicle] = await rest('forge_fleet_vehicles', {
      method: 'POST',
      body: {
        organization_id: ORG,
        vehicle_number: 'CRONTEST-' + RUN,
        unit_number: 'CT' + RUN,
        make: 'Test',
        model: 'Cron',
        mileage: 50000,
        registration_renewal_date: iso(10),
        insurance_expires_on: iso(-3),
        annual_inspection_due_on: iso(5),
        dot_regulated: true
      }
    })

    ids.vehicle = vehicle.id

    const [maintenance] = await rest('forge_fleet_maintenance', {
      method: 'POST',
      body: { organization_id: ORG, maintenance_number: 'FM-CRON-' + RUN, vehicle_id: vehicle.id, title: 'Cron oil change', maintenance_type: 'pm', status: 'open', due_on: iso(-2) }
    })

    ids.maintenance = maintenance.id

    const [dvir] = await rest('forge_fleet_dvirs', {
      method: 'POST',
      body: {
        organization_id: ORG,
        dvir_number: 'DVIR-CRON-' + RUN,
        vehicle_id: vehicle.id,
        trip_type: 'pre_trip',
        inspection_date: iso(-2),
        items: [{ id: 'brakes', answer: 'no', notes: 'Soft pedal' }],
        condition_satisfactory: false,
        status: 'open',
        driver_name: 'Cron Test Driver',
        driver_signature: { name: 'Cron Test Driver', signed_at: new Date(Date.now() - 2 * DAY).toISOString() },
        created_at: new Date(Date.now() - 2 * DAY).toISOString()
      }
    })

    ids.dvir = dvir.id

    const [document] = await rest('forge_fleet_documents', {
      method: 'POST',
      body: {
        organization_id: ORG,
        vehicle_id: vehicle.id,
        document_type: 'insurance_card',
        title: 'Cron insurance card',
        expires_on: iso(7),
        file_name: 'card.pdf',
        storage_path: `${ORG}/cron-test-${RUN}.pdf`,
        content_type: 'application/pdf',
        size_bytes: 10
      }
    })

    ids.document = document.id

    const subjects = [vehicle.id, maintenance.id, dvir.id, document.id]
    const logFor = async user => rest(`forge_fleet_notice_log?recipient_user_id=eq.${user}&subject_id=in.(${subjects.join(',')})&select=id,kind,subject_id,due_key,event_id&order=kind`)

    const denied = await cron('wrong-secret')

    check('the route refuses a wrong secret', () => assert.strictEqual(denied.status, 401))

    const first = await cron()

    check('the first run succeeds', () => {
      assert.strictEqual(first.status, 200, JSON.stringify(first.body))
      assert.ok(first.body.ok)
      assert.ok(first.body.results.some(row => row.organizationId === ORG && !row.error && !row.skipped), JSON.stringify(first.body))
    })

    const log = await logFor(ADMIN)

    check('admin gets each reminder once, keyed by the due point', () => {
      assert.deepStrictEqual(
        log.map(row => [row.kind, row.due_key]),
        [
          ['annual_inspection', iso(5)],
          ['document_expiring', iso(7)],
          ['dvir_defect', dvir.id],
          ['insurance', iso(-3)],
          ['maintenance_overdue', `${iso(-2)}|-`],
          ['registration', iso(10)]
        ]
      )
    })

    const eventIds = [...new Set(log.map(row => row.event_id))]

    check('the reminders went out as one digest event', () => {
      assert.strictEqual(eventIds.length, 1)
      assert.ok(eventIds[0])
    })

    const [event] = await rest(`forge_notification_events?id=eq.${eventIds[0]}&select=id,source_module,event_type,title,body,payload`)
    const deliveries = await rest(`forge_notification_deliveries?event_id=eq.${eventIds[0]}&select=channel,status,recipient_user_id,link_path&order=channel`)

    check('the digest has an in-app (sent) and an email (pending) delivery to admin', () => {
      assert.strictEqual(event.source_module, 'fleet')
      assert.strictEqual(event.event_type, 'fleet_reminders')
      assert.match(event.body, new RegExp('CT' + RUN))
      assert.match(event.body, /Cron oil change/)
      assert.deepStrictEqual(
        deliveries.map(row => [row.channel, row.status, row.recipient_user_id]),
        [
          ['email', 'pending', ADMIN],
          ['in_app', 'sent', ADMIN]
        ]
      )
    })

    const userLog = await logFor(USER)

    check('a member without fleet.edit or fleet.maintenance gets nothing', () => assert.strictEqual(userLog.length, 0))

    const second = await cron()
    const again = await logFor(ADMIN)
    const eventsAfter = await rest(`forge_notification_deliveries?recipient_user_id=eq.${ADMIN}&channel=eq.in_app&event_id=eq.${eventIds[0]}&select=id`)

    check('a second run queues nothing new for these reminders', () => {
      assert.strictEqual(second.status, 200)
      assert.strictEqual(again.length, log.length)
      assert.deepStrictEqual(
        again.map(row => row.id),
        log.map(row => row.id)
      )
      assert.strictEqual(eventsAfter.length, 1)
    })

    // Moving the due date makes it a new reminder (new due key); the old one stays logged.
    await rest(`forge_fleet_maintenance?id=eq.${maintenance.id}`, { method: 'PATCH', body: { due_on: iso(-1) } })
    await cron()

    const moved = await logFor(ADMIN)

    check('a moved due date is reminded again, once', () => {
      const rows = moved.filter(row => row.kind === 'maintenance_overdue')

      assert.deepStrictEqual(rows.map(row => row.due_key).sort(), [`${iso(-2)}|-`, `${iso(-1)}|-`].sort())
    })

    console.log(`\n${passed} checks passed`)
  } finally {
    const subjectIds = [ids.vehicle, ids.maintenance, ids.dvir, ids.document].filter(Boolean)

    if (subjectIds.length) {
      const logs = await rest(`forge_fleet_notice_log?subject_id=in.(${subjectIds.join(',')})&select=event_id`).catch(() => [])
      const events = [...new Set(logs.map(row => row.event_id).filter(Boolean))]

      await rest(`forge_fleet_notice_log?subject_id=in.(${subjectIds.join(',')})`, { method: 'DELETE' }).catch(() => {})
      if (events.length) await rest(`forge_notification_events?id=in.(${events.join(',')})`, { method: 'DELETE' }).catch(() => {})
    }

    if (ids.document) await rest(`forge_fleet_documents?id=eq.${ids.document}`, { method: 'DELETE' }).catch(() => {})
    if (ids.maintenance) await rest(`forge_fleet_maintenance?id=eq.${ids.maintenance}`, { method: 'DELETE' }).catch(() => {})

    if (ids.vehicle) {
      // An open DVIR can't be deleted (retention guard), so the test data goes with triggers off.
      try {
        psql(
          `set session_replication_role = replica; delete from public.forge_fleet_dvirs where vehicle_id = '${ids.vehicle}'; delete from public.forge_fleet_vehicles where id = '${ids.vehicle}';`
        )
      } catch (failure) {
        console.error('cleanup: could not remove the test vehicle', failure.message)
      }
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
