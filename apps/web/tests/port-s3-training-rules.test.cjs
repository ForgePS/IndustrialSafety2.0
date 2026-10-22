/**
 * Port slice 3: unit tests for training rules (src/lib/forgeTrainingRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s3-training-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeTrainingRules.ts'))

const today = '2026-10-21'
const passed = (completedAt, expiresAt) => ({ completed_at: completedAt + 'T12:00:00Z', expires_at: expiresAt, approval_status: 'approved', result: 'passed' })

test('a current completion is current, and expiring within 30 days', () => {
  assert.equal(rules.matrixStatus({ completions: [passed('2026-01-01', '2027-01-01')], assignments: [], required: true, todayIso: today }).status, 'current')
  assert.equal(rules.matrixStatus({ completions: [passed('2025-11-01', '2026-11-15')], assignments: [], required: true, todayIso: today }).status, 'expiring')
  assert.equal(rules.matrixStatus({ completions: [passed('2025-01-01', null)], assignments: [], required: true, todayIso: today }).status, 'current')
})

test('an expired completion shows expired unless retraining is assigned', () => {
  const expired = [passed('2024-01-01', '2025-01-01')]
  assert.equal(rules.matrixStatus({ completions: expired, assignments: [], required: true, todayIso: today }).status, 'expired')
  assert.equal(rules.matrixStatus({ completions: expired, assignments: [{ status: 'assigned', due_date: '2026-12-01' }], required: true, todayIso: today }).status, 'assigned')
  assert.equal(rules.matrixStatus({ completions: expired, assignments: [{ status: 'assigned', due_date: '2026-10-01' }], required: true, todayIso: today }).status, 'overdue')
})

test('the newest valid completion wins; pending, rejected and failed results do not count', () => {
  const completions = [
    passed('2024-01-01', '2025-01-01'),
    passed('2026-02-01', '2027-02-01'),
    { completed_at: '2026-09-01T00:00:00Z', expires_at: '2027-09-01', approval_status: 'pending', result: 'passed' },
    { completed_at: '2026-09-02T00:00:00Z', expires_at: '2027-09-02', approval_status: 'approved', result: 'failed' }
  ]
  const result = rules.matrixStatus({ completions, assignments: [], required: true, todayIso: today })
  assert.equal(result.status, 'current')
  assert.equal(result.expiresAt, '2027-02-01')
})

test('nothing on record is missing when required, blank when not', () => {
  assert.equal(rules.matrixStatus({ completions: [], assignments: [], required: true, todayIso: today }).status, 'missing')
  assert.equal(rules.matrixStatus({ completions: [], assignments: [], required: false, todayIso: today }).status, 'not_required')
  assert.equal(rules.matrixStatus({ completions: [], assignments: [{ status: 'completed', due_date: null }], required: true, todayIso: today }).status, 'missing')
})

test('content is complete when every required section is done', () => {
  const sections = [{ id: 'a', is_required: true }, { id: 'b', is_required: false }, { id: 'c', is_required: true }]
  assert.equal(rules.contentComplete(sections, ['a']), false)
  assert.equal(rules.contentComplete(sections, ['a', 'c']), true)
  assert.equal(rules.contentComplete([], []), true)
})

test('paper results paste from a spreadsheet or comma list', () => {
  const parsed = rules.parsePaperResults('EMP-0042\t85%\t2026-10-20\n 17, 70 \n\nabc, 101\n, 90\n55; 80; 10/20/2026')
  assert.deepEqual(parsed.rows, [
    { line: 1, employeeNumber: 'EMP-0042', percent: 85, date: '2026-10-20' },
    { line: 2, employeeNumber: '17', percent: 70, date: null }
  ])
  assert.deepEqual(parsed.errors, [
    'Line 4: percent must be a whole number from 0 to 100.',
    'Line 5: missing employee number.',
    'Line 6: date must be YYYY-MM-DD.'
  ])
})
