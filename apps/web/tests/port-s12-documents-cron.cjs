/**
 * Port slice 12 (agent B): document review reminders end to end (plain node against the running app and
 * PostgREST), plus the workflow rules the database enforces.
 *
 * Seeds published documents (submitted by admin, approved by user through the RPCs) with a review due in 10
 * days (owner: user), overdue by 3 days, due in 200 days, and a draft with a review date; calls
 * /api/documents/cron with the FORGE_CRON_SECRET from .env.local; checks one notice-log row per due document
 * and kind, notices to the managers in scope and the owner (in-app sent + email pending), nothing for the
 * far-off and draft documents, nothing new on a second run, and a new reminder once the date moves to overdue.
 * Also checks the route refuses a wrong secret, that the submitter can't approve their own version, and that
 * only one version can be in review.
 *
 * Run from apps/web (dev server on :3001): node tests/port-s12-documents-cron.cjs
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

const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: args })

const rpcError = async (name, args) => {
  try {
    await rpc(name, args)
  } catch (failure) {
    return failure.message
  }

  return null
}

const cron = async (secret = SECRET) => {
  const response = await fetch(BASE + '/api/documents/cron', { method: 'POST', headers: { Authorization: 'Bearer ' + secret } })

  return { status: response.status, body: await response.json().catch(() => null) }
}

const psql = sql => execSync('docker exec -i supabase_db_forge-industrial-safety-2-0 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q', { input: sql })

const createDocument = async (label, patch = {}) => {
  const number = await rpc('next_forge_document_number', { p_organization_id: ORG })
  const [doc] = await rest('forge_documents', {
    method: 'POST',
    body: { organization_id: ORG, document_number: number, name: `Cron test ${label} ${RUN}`, review_interval_months: 12, created_by: ADMIN, ...patch }
  })

  return doc
}

const addVersion = async (doc, versionNumber) => {
  const [version] = await rest('forge_document_versions', {
    method: 'POST',
    body: {
      organization_id: ORG,
      document_id: doc.id,
      version_number: versionNumber,
      file_name: `cron-${versionNumber}.pdf`,
      content_type: 'application/pdf',
      size_bytes: 100,
      storage_path: `${ORG}/${doc.id}/cron-test-${RUN}-${versionNumber}.pdf`,
      created_by: ADMIN
    }
  })

  return version
}

const publish = async (doc, dueOn) => {
  const version = await addVersion(doc, 1)

  await rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: version.id, p_actor_user_id: ADMIN })
  await rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: version.id, p_actor_user_id: USER, p_effective_on: null, p_note: null })
  await rest(`forge_documents?id=eq.${doc.id}`, { method: 'PATCH', body: { review_due_on: dueOn } })

  return version
}

const main = async () => {
  const docIds = []
  let passed = 0
  const check = (name, fn) => {
    fn()
    passed += 1
    console.log('ok -', name)
  }

  try {
    // Workflow rules the database enforces (the server actions show these messages as they are).
    const rules = await createDocument('rules')

    docIds.push(rules.id)
    const v1 = await addVersion(rules, 1)
    const v2 = await addVersion(rules, 2)

    await rpc('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN })

    const second = await rpcError('forge_document_submit_version', { p_organization_id: ORG, p_version_id: v2.id, p_actor_user_id: ADMIN })
    const self = await rpcError('forge_document_approve_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: ADMIN, p_effective_on: null, p_note: null })
    const noReason = await rpcError('forge_document_reject_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: USER, p_reason: '  ' })

    check('only one version can be in review', () => assert.match(second || '', /Another version of this document is already in review/))
    check('the submitter cannot approve their own version', () => assert.match(self || '', /Someone other than the person who submitted this version must approve it/))
    check('sending back needs a reason', () => assert.match(noReason || '', /Give a reason/))

    await rpc('forge_document_approve_version', { p_organization_id: ORG, p_version_id: v1.id, p_actor_user_id: USER, p_effective_on: iso(0), p_note: null })

    const [approved] = await rest(`forge_documents?id=eq.${rules.id}&select=status,current_version_id,review_due_on`)

    check('approval publishes and sets the next review date from the interval', () => {
      assert.strictEqual(approved.status, 'published')
      assert.strictEqual(approved.current_version_id, v1.id)
      const expected = new Date(Date.now())

      expected.setUTCMonth(expected.getUTCMonth() + 12)
      assert.strictEqual(approved.review_due_on.slice(0, 7), expected.toISOString().slice(0, 7))
    })

    // Review reminders.
    const soon = await createDocument('soon', { owner_user_id: USER })
    const overdue = await createDocument('overdue')
    const later = await createDocument('later')
    const draft = await createDocument('draft')

    docIds.push(soon.id, overdue.id, later.id, draft.id)
    await publish(soon, iso(10))
    await publish(overdue, iso(-3))
    await publish(later, iso(200))
    await rest(`forge_documents?id=eq.${draft.id}`, { method: 'PATCH', body: { review_due_on: iso(5) } })

    const ours = [soon.id, overdue.id, later.id, draft.id]
    const logs = async () => rest(`forge_document_notice_log?document_id=in.(${ours.join(',')})&select=id,document_id,notice_key,event_id&order=created_at`)
    const events = async documentId =>
      rest(`forge_notification_events?source_module=eq.documents&resource_id=eq.${documentId}&event_type=like.review_*&select=id,event_type,title,body,payload&order=created_at`)

    const denied = await cron('wrong-secret')

    check('the route refuses a wrong secret', () => assert.strictEqual(denied.status, 401))

    const first = await cron()

    check('the first run succeeds', () => {
      assert.strictEqual(first.status, 200, JSON.stringify(first.body))
      assert.ok(first.body.ok)
      assert.ok(first.body.results.some(row => row.organizationId === ORG && !row.error && !row.skipped), JSON.stringify(first.body))
    })

    const log = await logs()

    check('one reminder per due document and kind, keyed by the review date', () => {
      assert.deepStrictEqual(log.map(row => [row.document_id, row.notice_key]).sort(), [
        [overdue.id, `review_overdue:${iso(-3)}`],
        [soon.id, `review_due_soon:${iso(10)}`]
      ].sort())
      assert.ok(log.every(row => row.event_id))
    })

    const soonEvents = await events(soon.id)
    const overdueEvents = await events(overdue.id)
    const recipients = list => list.map(event => event.payload.recipient_user_id)

    check('due soon: the managers in scope and the owner are told', () => {
      assert.ok(recipients(soonEvents).includes(ADMIN), 'admin (manager)')
      assert.ok(recipients(soonEvents).includes(USER), 'user (owner)')
      assert.strictEqual(new Set(recipients(soonEvents)).size, soonEvents.length, 'once each')
      assert.strictEqual(soonEvents[0].event_type, 'review_due_soon')
      assert.match(soonEvents[0].title, /Document review due soon: Cron test soon/)
      assert.match(soonEvents[0].body, /\(in 10 days\)/)
    })

    check('overdue: managers told, a member without documents.manage who is not the owner is not', () => {
      assert.ok(recipients(overdueEvents).includes(ADMIN))
      assert.ok(!recipients(overdueEvents).includes(USER))
      assert.strictEqual(overdueEvents[0].event_type, 'review_overdue')
      assert.match(overdueEvents[0].body, /3 days overdue/)
    })

    const deliveries = await rest(`forge_notification_deliveries?event_id=eq.${soonEvents.find(event => event.payload.recipient_user_id === USER).id}&select=channel,status,recipient_user_id,link_path&order=channel`)

    check('each reminder has an in-app (sent) and an email (pending) delivery linking to the document', () => {
      assert.deepStrictEqual(
        deliveries.map(row => [row.channel, row.status, row.recipient_user_id, row.link_path]),
        [
          ['email', 'pending', USER, '/documents/' + soon.id],
          ['in_app', 'sent', USER, '/documents/' + soon.id]
        ]
      )
    })

    const laterEvents = await events(later.id)
    const draftEvents = await events(draft.id)

    check('far-off and draft documents get no reminder', () => {
      assert.strictEqual(laterEvents.length, 0)
      assert.strictEqual(draftEvents.length, 0)
    })

    const again = await cron()
    const logAgain = await logs()
    const soonAgain = await events(soon.id)

    check('a second run queues nothing new', () => {
      assert.strictEqual(again.status, 200)
      assert.deepStrictEqual(
        logAgain.map(row => row.id),
        log.map(row => row.id)
      )
      assert.strictEqual(soonAgain.length, soonEvents.length)
    })

    // The date moving (here: now overdue) makes it a new reminder; the old one stays logged.
    await rest(`forge_documents?id=eq.${soon.id}`, { method: 'PATCH', body: { review_due_on: iso(-1) } })
    await cron()

    const moved = (await logs()).filter(row => row.document_id === soon.id).map(row => row.notice_key)

    check('a moved review date is reminded again, once', () => assert.deepStrictEqual(moved.sort(), [`review_due_soon:${iso(10)}`, `review_overdue:${iso(-1)}`].sort()))

    // Confirming the review moves the date out of the window: no more reminders.
    const next = await rpc('forge_document_confirm_review', { p_organization_id: ORG, p_document_id: overdue.id, p_actor_user_id: ADMIN, p_note: 'Checked' })

    check('confirm review moves the date on by the interval', () => assert.ok(next > iso(300), next))

    console.log(`\n${passed} checks passed`)
  } finally {
    if (docIds.length) {
      const list = docIds.map(id => `'${id}'`).join(',')

      try {
        // Submitted versions can't be deleted (guard trigger), so the test data goes with triggers off. That
        // also turns off the foreign key cascades, so every child table is cleared by hand.
        psql(
          `delete from public.forge_notification_events where source_module = 'documents' and resource_id in (${list});
           set session_replication_role = replica;
           delete from public.forge_document_notice_log where document_id in (${list});
           delete from public.forge_document_activity where document_id in (${list});
           delete from public.forge_document_acknowledgments where document_id in (${list});
           delete from public.forge_document_distributions where document_id in (${list});
           delete from public.forge_document_versions where document_id in (${list});
           delete from public.forge_documents where id in (${list});`
        )
      } catch (failure) {
        console.error('cleanup: could not remove the test documents', failure.message)
      }
    }
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
