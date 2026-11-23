/**
 * Port slice 18 (agent B): work permit reminders end to end (plain node against the running app and PostgREST).
 *
 * Seeds, through the workflow functions (admin requests, user approves), five permits tagged "PW-S18B":
 *   - heights, approved, ending in 30 minutes                      -> expiring
 *   - heights, approved, past its end time (backdated)             -> expired
 *   - hot work, issued, work complete 2 h ago (fire watch over)     -> fire_watch_done
 *   - confined space, issued, entrant inside, last test 2 h old     -> gas_retest_due
 *   - hot work, issued, nothing due                                 -> nothing
 * user@ gets a permits.approve allow override for the run, so each notice goes to the requester (admin) and the
 * approver in scope (user). Calls /api/permits/cron with FORGE_CRON_SECRET from .env.local and checks one
 * notice-log row per permit and kind, in-app (sent) and email (pending) deliveries to both, nothing on a second run,
 * a new gas_retest_due once a newer test goes stale, and a refused wrong secret.
 *
 * Run from apps/web (dev server on :3001): node tests/port-s18-permits-cron.cjs
 */
const fs = require('fs')
const path = require('path')
const assert = require('node:assert/strict')
const { execFileSync } = require('child_process')

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
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-7)
const TAG = `PW-S18B cron ${RUN}`

assert.ok(API_URL && SERVICE_ROLE_KEY, 'Supabase URL and service role key are needed (apps/web/.env.local).')
assert.ok(SECRET, 'FORGE_CRON_SECRET is needed in apps/web/.env.local.')

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()

  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status} ${text}`)

  return text ? JSON.parse(text) : null
}

const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: args })

/** supabase_admin may switch the guards off (replica mode): test setup (backdating) and clean-up only. */
const psql = sql => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })

const asReplica = sql => psql(`begin; set local session_replication_role = replica; ${sql} commit;`)

const at = minutes => new Date(Date.now() + minutes * 60_000).toISOString()

const step = (fn, permit, actor, extra = {}) => rpc('forge_permit_' + fn, { p_organization_id: ORG, p_permit_id: permit.id, p_actor_user_id: actor, ...extra })

const DETAILS = {
  heights: { working_height_ft: 12, fall_protection: ['guardrail'], rescue_plan: 'Lift rescue from below' },
  hot_work: { work_type: 'welding', gas_test_required: false },
  confined_space: { rescue_service: 'Plant rescue team', communication: 'Radio', entry_type: 'vertical' }
}

const ROLES = { heights: ['worker', 'competent_person'], hot_work: ['hot_work_operator', 'fire_watch'], confined_space: ['entry_supervisor', 'attendant', 'entrant'] }

const gasTest = (permit, actor) =>
  step('record_gas_test', permit, actor, {
    p_o2: 20.9,
    p_lel: 0,
    p_h2s: 0,
    p_co: 0,
    p_other_gas: null,
    p_other_value: null,
    p_other_limit: null,
    p_instrument: 'Four-gas meter',
    p_bump_tested: true,
    p_test_point: 'Top',
    p_note: null
  })

const answerChecklist = async permit => {
  const defs = await rest(`forge_permit_check_definitions?permit_type=eq.${permit.permit_type}&organization_id=is.null&archived_at=is.null&select=check_key,allow_na`)

  await rest('forge_permit_checks', {
    method: 'POST',
    body: defs.map(def => ({ organization_id: ORG, permit_id: permit.id, check_key: def.check_key, answer: 'yes', note: null, answered_by: ADMIN }))
  })
}

/** A permit requested by admin and approved by user; issued too when asked. */
const seedPermit = async (type, label, { until = 360, space = null, issue = false } = {}) => {
  const number = await rpc('next_forge_permit_number', { p_organization_id: ORG, p_type: type })

  const [permit] = await rest('forge_permits', {
    method: 'POST',
    body: {
      organization_id: ORG,
      permit_number: number,
      permit_type: type,
      location_id: LOCATION,
      space_id: space,
      title: `${TAG} ${label}`,
      work_description: 'Cron test work',
      valid_from: at(-5),
      valid_until: at(until),
      details: DETAILS[type],
      created_by: ADMIN
    }
  })

  const roleRows = ROLES[type].map((role, index) => ({ organization_id: ORG, permit_id: permit.id, role, personnel_id: state.people[index], added_by: ADMIN }))
  const people = await rest('forge_permit_people', { method: 'POST', body: roleRows })

  await answerChecklist(permit)
  await step('submit', permit, ADMIN)
  await step('approve', permit, USER, { p_note: null })

  if (issue) {
    if (type === 'confined_space') await gasTest(permit, USER)
    await step('issue', permit, USER)
  }

  return { ...permit, people }
}

const cron = async (secret = SECRET) => {
  const response = await fetch(BASE + '/api/permits/cron', { method: 'GET', headers: { Authorization: 'Bearer ' + secret } })

  return { status: response.status, body: await response.json().catch(() => null) }
}

const noticeLog = async permit => rest(`forge_permit_notice_log?permit_id=eq.${permit.id}&select=kind,window_key&order=sent_at`)

const events = async permit => rest(`forge_notification_events?source_module=eq.permits&resource_id=eq.${permit.id}&select=id,event_type,title,body,payload&order=created_at`)

const state = { people: [], permits: [] }

const main = async () => {
  let passed = 0
  const ok = label => {
    passed += 1
    console.log('ok - ' + label)
  }

  const people = await rest(`forge_personnel?organization_id=eq.${ORG}&location_id=eq.${LOCATION}&archived_at=is.null&employment_status=eq.active&select=id&order=id&limit=3`)

  assert.equal(people.length, 3, 'the seed has three active people at the main location')
  state.people = people.map(row => row.id)

  const [approve] = await rest('forge_permission_registry?permission_key=eq.permits.approve&select=id')

  state.approveId = approve.id
  const hadOverride = (await rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${approve.id}&select=user_id`)).length > 0

  if (!hadOverride) {
    await rest('forge_user_permission_overrides', { method: 'POST', body: { organization_id: ORG, user_id: USER, permission_id: approve.id, override_state: 'allow', scope: 'organization' } })
  }

  try {
    const unauthorized = await cron('wrong-secret')

    assert.equal(unauthorized.status, 401, 'a wrong secret is refused')
    ok('the cron refuses a wrong secret')

    const [space] = await rest('forge_confined_spaces', { method: 'POST', body: { organization_id: ORG, location_id: LOCATION, name: `${TAG} Tank`, hazards: ['toxic'] } })

    state.space = space

    const expiring = await seedPermit('heights', 'expiring', { until: 30 })
    const expired = await seedPermit('heights', 'expired', { until: 120 })
    const fireWatch = await seedPermit('hot_work', 'fire watch', { issue: true })
    const confined = await seedPermit('confined_space', 'gas retest', { space: space.id, issue: true })
    const quiet = await seedPermit('hot_work', 'quiet', { issue: true })

    state.permits.push(expiring, expired, fireWatch, confined, quiet)

    await step('complete_work', fireWatch, ADMIN)
    const entrant = confined.people.find(row => row.role === 'entrant')

    await step('sign_in', confined, ADMIN, { p_person_id: entrant.id })

    // Backdate what the clock would have done.
    asReplica(`
      update public.forge_permits set valid_from = now() - interval '3 hours', valid_until = now() - interval '10 minutes' where id = '${expired.id}';
      update public.forge_permits set work_completed_at = now() - interval '2 hours' where id = '${fireWatch.id}';
      update public.forge_permit_gas_tests set tested_at = now() - interval '2 hours' where permit_id = '${confined.id}';
    `)

    const first = await cron()

    assert.equal(first.status, 200, 'cron runs: ' + JSON.stringify(first.body))
    const orgResult = first.body.results.find(row => row.organizationId === ORG)

    assert.ok(orgResult && !orgResult.error, 'org processed: ' + JSON.stringify(orgResult))
    ok('the cron runs for the company')

    const expect = [
      [expiring, 'expiring', new Date((await rest(`forge_permits?id=eq.${expiring.id}&select=valid_until`))[0].valid_until).toISOString()],
      [expired, 'expired', null],
      [fireWatch, 'fire_watch_done', null],
      [confined, 'gas_retest_due', null]
    ]

    for (const [permit, kind, windowKey] of expect) {
      const log = await noticeLog(permit)

      assert.deepEqual(
        log.map(row => row.kind),
        [kind],
        `${permit.title}: one ${kind} notice`
      )
      if (windowKey) assert.equal(log[0].window_key, windowKey, 'expiring window is the end time')

      const sent = await events(permit)
      const notices = sent.filter(row => row.event_type === 'permit_' + kind)
      const recipients = notices.map(row => row.payload.recipient_user_id).sort()

      // Other seeded approvers at the location (e.g. a location administrator) are told too.
      assert.ok(recipients.includes(ADMIN) && recipients.includes(USER), `${kind}: requester and approver in scope are told`)
      assert.equal(new Set(recipients).size, recipients.length, `${kind}: one notice per person`)
      assert.ok(notices.every(row => row.title.includes(permit.permit_number)), `${kind}: title names the permit`)

      const deliveries = await rest(`forge_notification_deliveries?event_id=in.(${notices.map(row => row.id).join(',')})&select=channel,status,link_path`)

      assert.equal(deliveries.filter(row => row.channel === 'in_app' && row.status === 'sent').length, notices.length, `${kind}: in-app sent`)
      assert.equal(deliveries.filter(row => row.channel === 'email' && row.status === 'pending').length, notices.length, `${kind}: email pending`)
      assert.ok(
        deliveries.every(row => row.link_path.endsWith('/' + permit.id)),
        `${kind}: links to the permit`
      )
      ok(`${kind} notice to the requester and the approver`)
    }

    const fireLog = await noticeLog(fireWatch)
    const fireRow = (await rest(`forge_permits?id=eq.${fireWatch.id}&select=work_completed_at`))[0]

    assert.equal(fireLog[0].window_key, new Date(fireRow.work_completed_at).toISOString(), 'fire watch window is the work-complete time')
    const gasLog = await noticeLog(confined)
    const [latestTest] = await rest(`forge_permit_gas_tests?permit_id=eq.${confined.id}&select=id&order=tested_at.desc`)

    assert.equal(gasLog[0].window_key, latestTest.id, 'gas retest window is the latest test')
    const gasBody = (await events(confined)).find(row => row.event_type === 'permit_gas_retest_due').body

    assert.match(gasBody, /1 person is inside the space/)
    ok('window keys: end time, work-complete time, latest test')

    assert.equal((await noticeLog(quiet)).length, 0, 'nothing due on the quiet permit')
    assert.equal((await events(quiet)).filter(row => row.event_type.startsWith('permit_') && !['permit_submitted', 'permit_approved', 'permit_issued'].includes(row.event_type)).length, 0)
    ok('nothing for a permit with nothing due')

    const countAll = async () => {
      let logs = 0
      let notices = 0

      for (const permit of state.permits) {
        logs += (await noticeLog(permit)).length
        notices += (await events(permit)).length
      }

      return { logs, notices }
    }

    const before = await countAll()
    const second = await cron()

    assert.equal(second.status, 200)
    assert.deepEqual(await countAll(), before, 'a second run sends nothing new')
    ok('second run is deduped')

    // A newer test that also goes stale is a new window.
    await gasTest(confined, USER)
    asReplica(`update public.forge_permit_gas_tests set tested_at = now() - interval '90 minutes' where permit_id = '${confined.id}' and tested_at > now() - interval '30 minutes';`)
    await cron()
    const gasLogs = await noticeLog(confined)

    assert.deepEqual(
      gasLogs.map(row => row.kind),
      ['gas_retest_due', 'gas_retest_due'],
      'a new stale test gets a new reminder'
    )
    ok('a new stale gas test is a new reminder window')

    // Signed out: no more gas reminders even when stale.
    await step('sign_out', confined, ADMIN, { p_person_id: entrant.id })
    await gasTest(confined, USER)
    asReplica(`update public.forge_permit_gas_tests set tested_at = now() - interval '80 minutes' where permit_id = '${confined.id}' and tested_at > now() - interval '30 minutes';`)
    await cron()
    assert.equal((await noticeLog(confined)).length, 2, 'nobody inside: no gas reminder')
    ok('no gas reminder once everyone is out')
  } finally {
    if (!hadOverride) await rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${state.approveId}`, { method: 'DELETE' }).catch(() => {})

    const ids = state.permits.map(permit => permit.id)

    if (ids.length) await rest(`forge_notification_events?source_module=eq.permits&resource_id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})

    asReplica(`
      create temp table s18b_ids on commit drop as select id from public.forge_permits where organization_id = '${ORG}' and title like '${TAG}%';
      delete from public.forge_permit_entries where permit_id in (select id from s18b_ids);
      delete from public.forge_permit_gas_tests where permit_id in (select id from s18b_ids);
      delete from public.forge_permit_checks where permit_id in (select id from s18b_ids);
      delete from public.forge_permit_people where permit_id in (select id from s18b_ids);
      delete from public.forge_permit_links where permit_id in (select id from s18b_ids);
      delete from public.forge_permit_notice_log where permit_id in (select id from s18b_ids);
      delete from public.forge_permit_activity where permit_id in (select id from s18b_ids);
      delete from public.forge_permits where id in (select id from s18b_ids);
      delete from public.forge_confined_spaces where organization_id = '${ORG}' and name like '${TAG}%';
    `)
  }

  console.log(`\nport-s18 permit cron checks passed (${passed})`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
