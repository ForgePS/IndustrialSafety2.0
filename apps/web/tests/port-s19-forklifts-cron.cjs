/**
 * Port slice 19 (agent B): forklift operator reminders end to end (plain node against the running app and PostgREST).
 *
 * Creates, all tagged "PW-S19B cron <run>":
 *   - a second location, and a throwaway signed-in user (a member of the company with no role) linked to one person;
 *   - four people and operators, authorized through forge_forklift_authorize and then dated with replica mode:
 *       main location, expires in 10 days                  -> expiring
 *       main location, expired 3 days ago                  -> expired
 *       main location, expires in a year                   -> nothing
 *       second location, expires in 5 days, linked to the throwaway user -> expiring
 * user@ gets a forklifts.authorize allow override at location scope for the run (their scope is the main location
 * only), so main-location notices go to admin and user@, the second location's to admin only (and the operator's
 * own user). Calls /api/forklifts/cron with FORGE_CRON_SECRET and checks one notice-log row per operator and kind,
 * in-app (sent) and email (pending) deliveries, nothing on a second run, a new window once the expiry date changes,
 * and a refused wrong secret.
 *
 * Run from apps/web (dev server running): node tests/port-s19-forklifts-cron.cjs
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

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3010'
const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const SECRET = process.env.FORGE_CRON_SECRET
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || 'supabase_db_forge-industrial-safety-2-0'
const ORG = '20000000-0000-4000-8000-000000000100'
const LOCATION = '20000000-0000-4000-8000-000000000300'
const ADMIN = '20000000-0000-4000-8000-000000000001'
const USER = '20000000-0000-4000-8000-000000000002'
const RUN = Date.now().toString().slice(-7)
const TAG = `PW-S19B cron ${RUN}`

assert.ok(API_URL && SERVICE_ROLE_KEY, 'Supabase URL and service role key are needed (apps/web/.env.local).')
assert.ok(SECRET, 'FORGE_CRON_SECRET is needed in apps/web/.env.local.')

const headers = (prefer = 'return=representation') => ({ apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY, 'Content-Type': 'application/json', Prefer: prefer })

const rest = async (pathname, { method = 'GET', body, prefer } = {}) => {
  const response = await fetch(API_URL + '/rest/v1/' + pathname, { method, headers: headers(prefer), body: body ? JSON.stringify(body) : undefined })
  const text = await response.text()

  if (!response.ok) throw new Error(`${method} ${pathname} → ${response.status} ${text}`)

  return text ? JSON.parse(text) : null
}

const authAdmin = async (pathname, { method = 'GET', body } = {}) => {
  const response = await fetch(API_URL + '/auth/v1/admin/' + pathname, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined })
  const text = await response.text()

  if (!response.ok) throw new Error(`auth ${method} ${pathname} → ${response.status} ${text}`)

  return text ? JSON.parse(text) : null
}

const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: args })

/** supabase_admin may switch the guards off (replica mode): test setup (dating) and clean-up only. */
const psql = sql => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })

const asReplica = sql => psql(`begin; set local session_replication_role = replica; ${sql} commit;`)

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const shift = days => new Date(Date.parse(today + 'T12:00:00Z') + days * 86400_000).toISOString().slice(0, 10)

const cron = async (secret = SECRET) => {
  const response = await fetch(BASE + '/api/forklifts/cron', { method: 'GET', headers: { Authorization: 'Bearer ' + secret } })

  return { status: response.status, body: await response.json().catch(() => null) }
}

const noticeLog = async operator => rest(`forge_forklift_notice_log?operator_id=eq.${operator.id}&select=kind,due_on&order=sent_at`)

const events = async operator => rest(`forge_notification_events?source_module=eq.forklifts&resource_id=eq.${operator.id}&select=id,event_type,title,body,payload&order=created_at`)

const state = { operators: [], personnel: [] }

const main = async () => {
  let passed = 0
  const ok = label => {
    passed += 1
    console.log('ok - ' + label)
  }

  const [authorize] = await rest('forge_permission_registry?permission_key=eq.forklifts.authorize&select=id')

  state.authorizeId = authorize.id
  const hadOverride = (await rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${authorize.id}&select=user_id`)).length > 0

  try {
    const unauthorized = await cron('wrong-secret')

    assert.equal(unauthorized.status, 401, 'a wrong secret is refused')
    ok('the cron refuses a wrong secret')

    if (!hadOverride) {
      await rest('forge_user_permission_overrides', { method: 'POST', body: { organization_id: ORG, user_id: USER, permission_id: authorize.id, override_state: 'allow', scope: 'location' } })
    }

    const [location] = await rest('locations', { method: 'POST', body: { organization_id: ORG, name: `${TAG} Annex`, code: `S19${RUN.slice(-4)}`, is_active: true } })

    state.location = location

    const created = await authAdmin('users', { method: 'POST', body: { email: `s19b-cron-${RUN}@forge2.local`, password: `Cron-${RUN}-pw!`, email_confirm: true } })

    state.ownUser = created.id || created.user?.id
    await rest('organization_memberships', { method: 'POST', body: { organization_id: ORG, user_id: state.ownUser, is_active: true } })

    const people = await rest('forge_personnel', {
      method: 'POST',
      body: [
        { organization_id: ORG, first_name: 'Expiring', last_name: TAG, employment_status: 'active', location_id: LOCATION, auth_user_id: null },
        { organization_id: ORG, first_name: 'Expired', last_name: TAG, employment_status: 'active', location_id: LOCATION, auth_user_id: null },
        { organization_id: ORG, first_name: 'Quiet', last_name: TAG, employment_status: 'active', location_id: LOCATION, auth_user_id: null },
        { organization_id: ORG, first_name: 'Annex', last_name: TAG, employment_status: 'active', location_id: location.id, auth_user_id: state.ownUser }
      ]
    })

    state.personnel = people.map(row => row.id)
    const byName = name => people.find(row => row.first_name === name)

    const authorizeOne = async (person, expiresOn) => {
      const id = await rpc('forge_forklift_authorize', {
        p_organization_id: ORG,
        p_actor_user_id: ADMIN,
        p_personnel_id: person.id,
        p_truck_classes: ['I'],
        p_training_completed_on: shift(-10),
        p_evaluated_on: shift(-5),
        p_evaluator_name: 'Cron evaluator',
        p_evaluator_personnel_id: null,
        p_evaluation_notes: null,
        p_restrictions: null
      })

      asReplica(`update public.forge_forklift_operators set expires_on = '${expiresOn}' where id = '${id}';`)
      const operator = { id, name: `${person.first_name} ${TAG}`, expiresOn }

      state.operators.push(operator)

      return operator
    }

    const expiring = await authorizeOne(byName('Expiring'), shift(10))
    const expired = await authorizeOne(byName('Expired'), shift(-3))
    const quiet = await authorizeOne(byName('Quiet'), shift(365))
    const annex = await authorizeOne(byName('Annex'), shift(5))

    const first = await cron()

    assert.equal(first.status, 200, 'cron runs: ' + JSON.stringify(first.body))
    const orgResult = first.body.results.find(row => row.organizationId === ORG)

    assert.ok(orgResult && !orgResult.error, 'org processed: ' + JSON.stringify(orgResult))
    ok('the cron runs for the company')

    const check = async (operator, kind, { includes, excludes }) => {
      const log = await noticeLog(operator)

      assert.deepEqual(
        log.map(row => [row.kind, row.due_on]),
        [[kind, operator.expiresOn]],
        `${operator.name}: one ${kind} notice for its expiry date`
      )

      const notices = (await events(operator)).filter(row => row.event_type === 'forklift_operator_' + kind)
      const recipients = notices.map(row => row.payload.recipient_user_id)

      for (const userId of includes) assert.ok(recipients.includes(userId), `${operator.name}: ${userId} is told`)
      for (const userId of excludes) assert.ok(!recipients.includes(userId), `${operator.name}: ${userId} is not told`)
      assert.equal(new Set(recipients).size, recipients.length, `${operator.name}: one notice per person`)

      const deliveries = await rest(`forge_notification_deliveries?event_id=in.(${notices.map(row => row.id).join(',')})&select=channel,status,link_path`)

      assert.equal(deliveries.filter(row => row.channel === 'in_app' && row.status === 'sent').length, notices.length, `${kind}: in-app sent`)
      assert.equal(deliveries.filter(row => row.channel === 'email' && row.status === 'pending').length, notices.length, `${kind}: email pending`)
      assert.ok(
        deliveries.every(row => row.link_path === `/forklifts/operators/${operator.id}`),
        `${kind}: links to the operator`
      )

      return notices
    }

    const expiringNotices = await check(expiring, 'expiring', { includes: [ADMIN, USER], excludes: [state.ownUser] })

    assert.ok(expiringNotices.every(row => row.title.includes(expiring.name)), 'the title names the operator')
    ok('expiring: the authorizers at the location are told')

    await check(expired, 'expired', { includes: [ADMIN, USER], excludes: [] })
    ok('expired: the authorizers at the location are told')

    const annexNotices = await check(annex, 'expiring', { includes: [ADMIN, state.ownUser], excludes: [USER] })

    assert.match(annexNotices.find(row => row.payload.recipient_user_id === state.ownUser).title, /Your forklift re-evaluation is due/)
    ok('another location: only authorizers whose scope covers it, plus the operator themself')

    assert.equal((await noticeLog(quiet)).length, 0, 'nothing for an operator not yet due')
    assert.equal((await events(quiet)).length, 0)
    ok('nothing for an operator not yet due')

    const countAll = async () => {
      let logs = 0
      let notices = 0

      for (const operator of state.operators) {
        logs += (await noticeLog(operator)).length
        notices += (await events(operator)).length
      }

      return { logs, notices }
    }

    const before = await countAll()
    const second = await cron()

    assert.equal(second.status, 200)
    assert.deepEqual(await countAll(), before, 'a second run sends nothing new')
    ok('second run is deduped')

    // A new expiry date (for example after a new evaluation that is due again) is a new window.
    asReplica(`update public.forge_forklift_operators set expires_on = '${shift(12)}' where id = '${expiring.id}';`)
    expiring.expiresOn = shift(12)
    await cron()
    assert.deepEqual(
      (await noticeLog(expiring)).map(row => row.due_on),
      [shift(10), shift(12)],
      'a new expiry date gets a new reminder'
    )
    ok('a new expiry date is a new reminder window')

    // Suspended operators are not reminded.
    asReplica(`update public.forge_forklift_operators set status = 'suspended', suspend_reason = 'test', suspended_at = now(), expires_on = '${shift(8)}' where id = '${expiring.id}';`)
    await cron()
    assert.equal((await noticeLog(expiring)).length, 2, 'no reminder for a suspended operator')
    ok('no reminder for a suspended operator')
  } finally {
    if (!hadOverride) await rest(`forge_user_permission_overrides?organization_id=eq.${ORG}&user_id=eq.${USER}&permission_id=eq.${state.authorizeId}`, { method: 'DELETE' }).catch(() => {})

    const ids = state.operators.map(operator => operator.id)

    if (ids.length) await rest(`forge_notification_events?source_module=eq.forklifts&resource_id=in.(${ids.join(',')})`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})

    asReplica(`
      create temp table s19c_people on commit drop as select id from public.forge_personnel where organization_id = '${ORG}' and last_name = '${TAG}';
      create temp table s19c_ops on commit drop as select id from public.forge_forklift_operators where personnel_id in (select id from s19c_people);
      delete from public.forge_forklift_notice_log where operator_id in (select id from s19c_ops);
      delete from public.forge_forklift_incident_links where operator_id in (select id from s19c_ops);
      delete from public.forge_forklift_activity where operator_id in (select id from s19c_ops);
      delete from public.forge_forklift_operators where id in (select id from s19c_ops);
      delete from public.forge_personnel_employment_events where personnel_id in (select id from s19c_people);
      delete from public.forge_personnel where id in (select id from s19c_people);
      delete from public.locations where organization_id = '${ORG}' and name = '${TAG} Annex';
    `)

    if (state.ownUser) {
      await rest(`organization_memberships?organization_id=eq.${ORG}&user_id=eq.${state.ownUser}`, { method: 'DELETE', prefer: 'return=minimal' }).catch(() => {})
      await authAdmin('users/' + state.ownUser, { method: 'DELETE' }).catch(() => {})
    }
  }

  console.log(`\nport-s19 forklift cron checks passed (${passed})`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
