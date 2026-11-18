/**
 * Port slice 12 (agent B): unit tests for src/lib/forgeDocumentNotifyRules.ts (who hears about a submitted,
 * sent back or approved version, review reminder selection and keys, notice text).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s12-documents-cron.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeDocumentNotifyRules.ts'))

const NOW = new Date('2026-11-17T12:00:00Z')

const doc = (patch = {}) => ({
  id: 'd1',
  document_number: 'DOC-000007',
  name: 'Hot Work Program',
  status: 'published',
  archived_at: null,
  review_due_on: '2026-12-01',
  owner_user_id: 'owner',
  ...patch
})

const version = { id: 'v1', version_number: 3, submitted_by: 'sub' }

test('submittedRecipients: approvers in scope, never the submitter, no duplicates', () => {
  assert.deepEqual(rules.submittedRecipients(['a', 'sub', 'b', 'a'], 'sub'), ['a', 'b'])
  assert.deepEqual(rules.submittedRecipients(['sub'], 'sub'), [])
  assert.deepEqual(rules.submittedRecipients(['a'], null), ['a'])
})

test('approvalRecipients: submitter told; audience told to read unless approver or submitter', () => {
  const plan = rules.approvalRecipients({ submitterId: 'sub', approverId: 'app', audienceIds: ['app', 'sub', 'x', 'y', 'x'], requiresAcknowledgment: true })

  assert.equal(plan.submitter, 'sub')
  assert.equal(plan.submitterReads, true)
  assert.deepEqual(plan.toRead, ['x', 'y'])

  const noAck = rules.approvalRecipients({ submitterId: 'sub', approverId: 'app', audienceIds: ['x'], requiresAcknowledgment: false })

  assert.deepEqual(noAck.toRead, [])
  assert.equal(noAck.submitterReads, false)

  // Self-approval (allowed in settings): nobody needs telling it was approved.
  const self = rules.approvalRecipients({ submitterId: 'app', approverId: 'app', audienceIds: ['app', 'x'], requiresAcknowledgment: true })

  assert.equal(self.submitter, null)
  assert.deepEqual(self.toRead, ['x'])

  // Submitter outside the audience: told it was approved, not asked to read.
  assert.equal(rules.approvalRecipients({ submitterId: 'sub', approverId: 'app', audienceIds: ['x'], requiresAcknowledgment: true }).submitterReads, false)
})

test('notice text: submitted, sent back with the reason, approved, to read', () => {
  const submitted = rules.submittedNotice(doc(), version, 'Pat Admin')

  assert.equal(submitted.title, 'Document to approve: Hot Work Program')
  assert.match(submitted.body, /Version 3 of DOC-000007 Hot Work Program was submitted for review by Pat Admin\./)
  assert.equal(submitted.link, '/documents/d1')

  const back = rules.sentBackNotice(doc(), version, '  Section 4 is out of date. ')

  assert.equal(back.title, 'Document sent back: Hot Work Program')
  assert.match(back.body, /Reason: Section 4 is out of date\.$/)

  const approved = rules.approvedNotice(doc(), version, '2026-11-17', true)

  assert.match(approved.body, /approved and published, effective 11\/17\/2026\. Please read it and acknowledge it\.$/)
  assert.doesNotMatch(rules.approvedNotice(doc(), version, '2026-11-17', false).body, /Please read/)

  const toRead = rules.toReadNotice(doc(), version)

  assert.equal(toRead.title, 'New document to read: Hot Work Program')
  assert.equal(toRead.link, '/documents/acknowledgments')
})

test('reviewNoticeFor: due soon inside the warning window, overdue after the date, nothing otherwise', () => {
  const soon = rules.reviewNoticeFor(doc({ review_due_on: '2026-12-01' }), 30, NOW)

  assert.equal(soon.kind, 'review_due_soon')
  assert.equal(soon.noticeKey, 'review_due_soon:2026-12-01')
  assert.equal(soon.days, 14)
  assert.equal(soon.title, 'Document review due soon: Hot Work Program')
  assert.match(soon.body, /is due 12\/01\/2026 \(in 14 days\)/)

  const overdue = rules.reviewNoticeFor(doc({ review_due_on: '2026-11-16' }), 30, NOW)

  assert.equal(overdue.kind, 'review_overdue')
  assert.equal(overdue.noticeKey, 'review_overdue:2026-11-16')
  assert.match(overdue.body, /was due 11\/16\/2026 \(1 day overdue\)/)

  assert.match(rules.reviewNoticeFor(doc({ review_due_on: '2026-11-17' }), 30, NOW).body, /is due today/)
  assert.equal(rules.reviewNoticeFor(doc({ review_due_on: '2026-12-31' }), 30, NOW), null, 'outside the window')
  assert.equal(rules.reviewNoticeFor(doc({ review_due_on: '2026-12-31' }), 60, NOW).kind, 'review_due_soon', 'a wider window')
  assert.equal(rules.reviewNoticeFor(doc({ review_due_on: null }), 30, NOW), null)
  assert.equal(rules.reviewNoticeFor(doc({ status: 'obsolete', review_due_on: '2026-11-01' }), 30, NOW), null)
  assert.equal(rules.reviewNoticeFor(doc({ status: 'in_review', review_due_on: '2026-11-01' }), 30, NOW), null)
  assert.equal(rules.reviewNoticeFor(doc({ archived_at: '2026-11-02', review_due_on: '2026-11-01' }), 30, NOW), null)
})

test('reviewNoticeFor: the key follows the review date, so a moved date is reminded again', () => {
  const before = rules.reviewNoticeFor(doc({ review_due_on: '2026-11-20' }), 30, NOW)
  const after = rules.reviewNoticeFor(doc({ review_due_on: '2026-12-05' }), 30, NOW)

  assert.notEqual(before.noticeKey, after.noticeKey)
})

test('reviewRecipients: owner plus managers in scope, active members only, once each', () => {
  const active = new Set(['owner', 'm1', 'm2'])

  assert.deepEqual(rules.reviewRecipients('owner', ['m1', 'owner', 'm2', 'gone'], active), ['owner', 'm1', 'm2'])
  assert.deepEqual(rules.reviewRecipients('left-company', ['m1'], active), ['m1'])
  assert.deepEqual(rules.reviewRecipients(null, [], active), [])
})
