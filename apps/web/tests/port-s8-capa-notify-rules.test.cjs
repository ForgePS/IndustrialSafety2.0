/**
 * Port slice 8: unit tests for the CAPA notification rules (src/lib/forgeCapaNotifyRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s8-capa-notify-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeCapaNotifyRules.ts'))

const TODAY = '2026-11-17'
const ORG = 'org-1'
const USER = 'user-1'

// Noon Chicago time on a date, so the local date is unambiguous.
const dueOn = iso => iso + 'T18:00:00.000Z'

const capa = (overrides = {}) => ({
  id: 'capa-1',
  organization_id: ORG,
  action_number: 'CA-0001',
  title: 'Guard the conveyor',
  status: 'open',
  due_at: dueOn('2026-11-19'),
  assigned_user_id: USER,
  archived_at: null,
  ...overrides
})

test('local dates follow the time zone', () => {
  assert.equal(rules.localDateIso('2026-11-18T03:00:00Z'), '2026-11-17', '9 pm Chicago is still the 17th')
  assert.equal(rules.localDateIso('2026-11-18T03:00:00Z', 'UTC'), '2026-11-18')
  assert.equal(rules.daysBetweenIso('2026-11-17', '2026-11-20'), 3)
  assert.equal(rules.daysBetweenIso('2026-11-17', '2026-11-16'), -1)
})

test('reminder kind: due soon inside 3 days, overdue after the due date', () => {
  assert.equal(rules.capaReminderKind(capa({ due_at: dueOn('2026-11-17') }), TODAY), 'due_soon', 'due today')
  assert.equal(rules.capaReminderKind(capa({ due_at: dueOn('2026-11-20') }), TODAY), 'due_soon', '3 days out')
  assert.equal(rules.capaReminderKind(capa({ due_at: dueOn('2026-11-21') }), TODAY), null, '4 days out')
  assert.equal(rules.capaReminderKind(capa({ due_at: dueOn('2026-11-16') }), TODAY), 'overdue')
  assert.equal(rules.capaReminderKind(capa({ due_at: null }), TODAY), null)
  assert.equal(rules.capaReminderKind(capa({ due_at: dueOn('2026-11-21') }), TODAY, 5), 'due_soon', 'custom window')
})

test('reminders only for open or in-progress, unarchived CAPAs with an assignee', () => {
  for (const status of ['pending_verification', 'verified', 'closed', 'canceled']) {
    assert.equal(rules.capaReminderKind(capa({ status, due_at: dueOn('2026-11-01') }), TODAY), null, status)
  }

  assert.equal(rules.capaReminderKind(capa({ status: 'in_progress', due_at: dueOn('2026-11-01') }), TODAY), 'overdue')
  assert.equal(rules.capaReminderKind(capa({ archived_at: '2026-11-10T00:00:00Z' }), TODAY), null)
  assert.deepEqual(rules.capaRemindersDue([capa({ assigned_user_id: null })], TODAY), [])
})

test('reminders carry a link, text and a dedupe key per due date and recipient', () => {
  const notices = rules.capaRemindersDue(
    [capa({ id: 'a', due_at: dueOn('2026-11-10') }), capa({ id: 'b', due_at: dueOn('2026-11-19') }), capa({ id: 'c', due_at: dueOn('2026-12-30') })],
    TODAY
  )

  assert.equal(notices.length, 2)
  const [overdue, soon] = notices

  assert.equal(overdue.kind, 'overdue')
  assert.equal(overdue.linkPath, '/corrective-actions/a')
  assert.equal(overdue.dedupeKey, 'capa:overdue:a:2026-11-10:' + USER)
  assert.equal(overdue.title, 'Corrective Action overdue')
  assert.match(overdue.body, /CA-0001 "Guard the conveyor" was due 11\/10\/2026/)
  assert.equal(soon.kind, 'due_soon')
  assert.equal(soon.dedupeKey, 'capa:due_soon:b:2026-11-19:' + USER)

  // Same CAPA on a later day: same key, so the sweep never repeats it.
  const again = rules.capaRemindersDue([capa({ id: 'b', due_at: dueOn('2026-11-19') })], '2026-11-18')
  assert.equal(again[0].dedupeKey, soon.dedupeKey)

  // Moving the due date earns a fresh reminder.
  const moved = rules.capaRemindersDue([capa({ id: 'b', due_at: dueOn('2026-11-20') })], TODAY)
  assert.notEqual(moved[0].dedupeKey, soon.dedupeKey)
})

test('assigned notice: skips self-assignment and missing logins, keyed by row version', () => {
  assert.equal(rules.capaAssignedNotice(capa({ assigned_user_id: null }), 'actor'), null)
  assert.equal(rules.capaAssignedNotice(capa(), USER), null, 'actor is the assignee')
  assert.equal(rules.capaAssignedNotice(capa({ status: 'closed' }), 'actor'), null)

  const notice = rules.capaAssignedNotice(capa({ row_version: 4 }), 'actor')
  assert.equal(notice.kind, 'assigned')
  assert.equal(notice.userId, USER)
  assert.equal(notice.dedupeKey, 'capa:assigned:capa-1:v4:' + USER)
  assert.equal(notice.linkPath, '/corrective-actions/capa-1')
  assert.match(notice.body, /due 11\/19\/2026/)
  assert.notEqual(rules.capaAssignedNotice(capa({ row_version: 5 }), 'actor').dedupeKey, notice.dedupeKey)
})

test('needs-verification notices go to each verifier except the submitter, once per submission', () => {
  const row = capa({ status: 'pending_verification', completed_at: '2026-11-17T15:00:00Z' })
  const notices = rules.capaNeedsVerificationNotices(row, ['v1', 'v2', 'submitter', 'v1'], 'submitter')

  assert.deepEqual(notices.map(n => n.userId), ['v1', 'v2'])
  assert.equal(notices[0].kind, 'needs_verification')
  assert.equal(notices[0].dedupeKey, 'capa:needs_verification:capa-1:2026-11-17T15:00:00Z:v1')
  assert.equal(notices[0].linkPath, '/corrective-actions/capa-1')
  assert.deepEqual(rules.capaNeedsVerificationNotices(capa(), ['v1'], null), [], 'not pending verification')

  const resubmitted = rules.capaNeedsVerificationNotices({ ...row, completed_at: '2026-11-18T15:00:00Z' }, ['v1'], null)
  assert.notEqual(resubmitted[0].dedupeKey, notices[0].dedupeKey)
})
