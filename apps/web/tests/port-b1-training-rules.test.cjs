/**
 * Batch 1 training parity: unit tests for the management rules (src/lib/forgeTrainingManageRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-b1-training-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeTrainingManageRules.ts'))

const TODAY = '2026-11-16'

test('only open assignments can be managed', () => {
  for (const status of ['assigned', 'in_progress', 'overdue', 'exempt']) assert.equal(rules.assignmentManageable(status), true, status)
  assert.equal(rules.assignmentManageable('completed'), false)
  assert.equal(rules.assignmentManageable('canceled'), false)
})

test('assignment edits validate the due date and notes', () => {
  assert.deepEqual(rules.parseAssignmentEdit({ dueDate: '2026-12-01', notes: '  bring PPE ' }), { value: { due_date: '2026-12-01', notes: 'bring PPE' } })
  assert.deepEqual(rules.parseAssignmentEdit({ dueDate: '', notes: '' }), { value: { due_date: null, notes: null } })
  assert.ok('error' in rules.parseAssignmentEdit({ dueDate: '2026-02-30' }))
  assert.ok('error' in rules.parseAssignmentEdit({ dueDate: '12/01/2026' }))
  assert.ok('error' in rules.parseAssignmentEdit({ notes: 'x'.repeat(2001) }))
})

test('reasons: required for archive, optional for cancel, capped', () => {
  assert.ok('error' in rules.parseReason('  ', true))
  assert.deepEqual(rules.parseReason('', false), { value: null })
  assert.deepEqual(rules.parseReason(' duplicate ', true), { value: 'duplicate' })
  assert.ok('error' in rules.parseReason('x'.repeat(501), false))
})

test('record edits: manual records change score and date, keeping the time when the date is unchanged', () => {
  const before = { completed_at: '2026-10-01T15:30:00.000Z', score: '80.00', source: 'manual', archived_at: null }

  const same = rules.parseRecordEdit(before, { score: '90', instructor: ' Pat ', completedDate: '2026-10-01', expiresAt: '2027-10-01', notes: '' }, TODAY)
  assert.deepEqual(same, { value: { score: 90, instructor: 'Pat', completed_at: '2026-10-01T15:30:00.000Z', expires_at: '2027-10-01', notes: null } })

  const moved = rules.parseRecordEdit(before, { score: '', completedDate: '2026-09-15', expiresAt: '' }, TODAY)
  assert.equal(moved.value.completed_at, '2026-09-15T12:00:00.000Z')
  assert.equal(moved.value.score, null)
  assert.equal(moved.value.expires_at, null)
})

test('record edits refuse bad values, future dates, early expiry and archived records', () => {
  const before = { completed_at: '2026-10-01T15:30:00.000Z', score: null, source: 'manual', archived_at: null }

  assert.ok('error' in rules.parseRecordEdit(before, { score: '101', completedDate: '2026-10-01' }, TODAY))
  assert.ok('error' in rules.parseRecordEdit(before, { score: 'abc', completedDate: '2026-10-01' }, TODAY))
  assert.ok('error' in rules.parseRecordEdit(before, { completedDate: '' }, TODAY))
  assert.ok('error' in rules.parseRecordEdit(before, { completedDate: '2026-12-01' }, TODAY))
  assert.ok('error' in rules.parseRecordEdit(before, { completedDate: '2026-10-01', expiresAt: '2026-09-30' }, TODAY))
  assert.ok('error' in rules.parseRecordEdit({ ...before, archived_at: '2026-11-01T00:00:00Z' }, { completedDate: '2026-10-01' }, TODAY))
})

test('graded records keep their score and date but can change expiry, instructor and notes', () => {
  const before = { completed_at: '2026-10-01T15:30:00.000Z', score: 85, source: 'online', archived_at: null }

  assert.ok('error' in rules.parseRecordEdit(before, { score: '95', completedDate: '2026-10-01' }, TODAY))
  assert.ok('error' in rules.parseRecordEdit(before, { score: '85', completedDate: '2026-09-01' }, TODAY))

  const ok = rules.parseRecordEdit(before, { score: '85', completedDate: '2026-10-01', expiresAt: '2027-04-01', instructor: 'Lee', notes: 'Card checked' }, TODAY)
  assert.deepEqual(ok.value, { score: 85, instructor: 'Lee', completed_at: '2026-10-01T15:30:00.000Z', expires_at: '2027-04-01', notes: 'Card checked' })
})

test('assignment filters come from the URL and default to open work', () => {
  const id = '11111111-1111-4111-8111-111111111111'

  assert.deepEqual(rules.assignmentFiltersFrom({}), { status: 'open', courseId: '', groupId: '', q: '' })
  assert.deepEqual(rules.assignmentFiltersFrom({ status: 'overdue', course: id, group: 'nope', q: ' smith ' }), { status: 'overdue', courseId: id, groupId: '', q: 'smith' })
  assert.equal(rules.assignmentFiltersFrom({ status: 'bogus' }).status, 'open')
  assert.equal(rules.assignmentFiltersFrom({ status: ['canceled', 'all'] }).status, 'canceled')
})

test('status filters, tile counts and text, course and group filters', () => {
  const row = (id, status, due, extra = {}) => ({ id, status, due_date: due, course_id: 'c1', personnel_id: 'p1', courseTitle: 'Lockout', personName: 'Sam Smith', employeeNumber: 'E1', ...extra })
  const items = [
    row('a', 'assigned', '2026-12-01'),
    row('b', 'assigned', '2026-11-01'),
    row('c', 'in_progress', null, { course_id: 'c2', courseTitle: 'Forklift' }),
    row('d', 'completed', '2026-10-01', { personnel_id: 'p2', personName: 'Ann Lee', employeeNumber: 'E2' }),
    row('e', 'canceled', '2026-10-01'),
    row('f', 'overdue', '2026-12-31')
  ]
  const ids = (filters, members) => rules.filterAssignments(items, { status: 'open', courseId: '', groupId: '', q: '', ...filters }, TODAY, members).map(item => item.id)

  assert.deepEqual(rules.assignmentCounts(items, TODAY), { open: 4, overdue: 1, completed: 1, canceled: 1 })
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'f'])
  assert.deepEqual(ids({ status: 'overdue' }), ['b'])
  assert.deepEqual(ids({ status: 'assigned' }), ['a', 'b', 'f'])
  assert.deepEqual(ids({ status: 'canceled' }), ['e'])
  assert.deepEqual(ids({ status: 'all' }), ['a', 'b', 'c', 'd', 'e', 'f'])
  assert.deepEqual(ids({ courseId: 'c2' }), ['c'])
  assert.deepEqual(ids({ status: 'all', q: 'e2' }), ['d'])
  assert.deepEqual(ids({ status: 'all', q: 'fork' }), ['c'])
  assert.deepEqual(ids({ status: 'all', groupId: 'g' }, new Set(['p2'])), ['d'])
  assert.equal(rules.assignmentOverdue({ status: 'canceled', due_date: '2026-01-01' }, TODAY), false)
})
