/**
 * Port slice 2: unit tests for the pure workers' comp rules (src/lib/forgeWorkersCompRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s2-workers-comp-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeWorkersCompRules.ts'))

test('thursdayWeekOf matches 1.0: Sun-Wed look ahead, Thu-Sat use this week', () => {
  // 2026-10-18 is a Sunday; 2026-10-22 is a Thursday.
  assert.equal(rules.thursdayWeekOf('2026-10-18'), '2026-10-22')
  assert.equal(rules.thursdayWeekOf('2026-10-21'), '2026-10-22')
  assert.equal(rules.thursdayWeekOf('2026-10-22'), '2026-10-22')
  assert.equal(rules.thursdayWeekOf('2026-10-24'), '2026-10-22')
  assert.equal(rules.thursdayWeekOf('2026-12-29'), '2026-12-31')
})

test('weekly update status', () => {
  assert.equal(rules.weeklyUpdateStatus('2026-10-22', true, '2026-10-30'), 'complete')
  assert.equal(rules.weeklyUpdateStatus('2026-10-22', false, '2026-10-21'), 'due')
  assert.equal(rules.weeklyUpdateStatus('2026-10-22', false, '2026-10-22'), 'overdue')
})

test('day counts skip the day of injury and run through today for open periods', () => {
  const periods = [
    { work_status: 'off_work', start_date: '2026-03-02', end_date: '2026-03-05' },
    { work_status: 'restricted', start_date: '2026-03-06', end_date: null },
    { work_status: 'full_duty', start_date: '2026-02-01', end_date: '2026-02-10' }
  ]

  // Injury on 3/2: away 3/3-3/5 = 3 days; restricted 3/6-3/10 = 5 days.
  assert.deepEqual(rules.calculateWorkDays(periods, '2026-03-02', '2026-03-10'), { daysAway: 3, restrictedDays: 5 })
})

test('periods ending before the first countable day add nothing', () => {
  assert.deepEqual(
    rules.calculateWorkDays([{ work_status: 'off_work', start_date: '2026-03-02', end_date: '2026-03-02' }], '2026-03-02', '2026-03-10'),
    { daysAway: 0, restrictedDays: 0 }
  )
})

test('future-dated period ends are clipped to today', () => {
  assert.deepEqual(
    rules.calculateWorkDays([{ work_status: 'off_work', start_date: '2026-03-03', end_date: '2026-04-30' }], '2026-03-02', '2026-03-04'),
    { daysAway: 2, restrictedDays: 0 }
  )
})

test('current work status prefers the period covering today', () => {
  const periods = [
    { work_status: 'off_work', start_date: '2026-03-03', end_date: '2026-03-05' },
    { work_status: 'restricted', start_date: '2026-03-06', end_date: null }
  ]
  assert.equal(rules.currentWorkStatus(periods, '2026-03-04'), 'off_work')
  assert.equal(rules.currentWorkStatus(periods, '2026-03-20'), 'restricted')
  assert.equal(rules.currentWorkStatus([], '2026-03-20'), null)
})

test('OSHA day cap counts days away first', () => {
  assert.deepEqual(rules.capOshaDays(150, 60), { daysAway: 150, restrictedDays: 30 })
  assert.deepEqual(rules.capOshaDays(200, 10), { daysAway: 180, restrictedDays: 0 })
  assert.deepEqual(rules.capOshaDays(5, 7), { daysAway: 5, restrictedDays: 7 })
})

test('OSHA outcome derivation matches 1.0', () => {
  assert.equal(rules.deriveOshaOutcome({ override: 'other_recordable', severity: 'fatality', daysAway: 9, restrictedDays: 0 }), 'other_recordable')
  assert.equal(rules.deriveOshaOutcome({ severity: 'fatality', daysAway: 0, restrictedDays: 0 }), 'death')
  assert.equal(rules.deriveOshaOutcome({ severity: 'moderate', daysAway: 2, restrictedDays: 4 }), 'days_away')
  assert.equal(rules.deriveOshaOutcome({ severity: 'moderate', daysAway: 0, restrictedDays: 4 }), 'job_transfer_restriction')
  assert.equal(rules.deriveOshaOutcome({ severity: 'lost_time', daysAway: 0, restrictedDays: 0 }), 'days_away')
  assert.equal(rules.deriveOshaOutcome({ severity: 'restricted', daysAway: 0, restrictedDays: 0 }), 'job_transfer_restriction')
  assert.equal(rules.deriveOshaOutcome({ severity: 'moderate', daysAway: 0, restrictedDays: 0 }), 'other_recordable')
})

const baseCase = {
  id: 'c1',
  case_number: 'WC-2026-0001',
  employee_name: 'Pat Example',
  status: 'active',
  stage: 'intake',
  severity: 'lost_time',
  claim_number: null,
  is_self_pay: false,
  carrier_name: 'Example Mutual',
  reported_date: '2026-03-02',
  created_at: '2026-03-02T15:00:00Z',
  next_action_label: null,
  next_action_due: null,
  next_action_priority: null,
  days_away: 3,
  current_work_status: 'off_work'
}

test('next actions follow the 1.0 due-date rules', () => {
  const actions = rules.buildWcNextActions([baseCase], '2026-03-08')
  const byKey = Object.fromEntries(actions.map(action => [action.id.split(':')[1], action]))

  assert.equal(byKey['claim-number'].dueDate, '2026-03-05')
  assert.equal(byKey['claim-number'].overdue, true)
  assert.equal(byKey['claim-number'].daysOverdue, 3)
  assert.equal(byKey.classification.dueDate, '2026-03-07')
  assert.equal(byKey.classification.priority, 'high')
  assert.equal(byKey['lost-time'].dueDate, '2026-03-09')
  assert.equal(byKey['lost-time'].overdue, false)
  // Overdue items come first.
  assert.equal(actions[0].overdue, true)
})

test('self-pay cases do not need a claim number, and closed cases owe nothing', () => {
  const selfPay = rules.buildWcNextActions([{ ...baseCase, is_self_pay: true }], '2026-03-08')
  assert.equal(selfPay.some(action => action.id.endsWith('claim-number')), false)
  assert.deepEqual(rules.buildWcNextActions([{ ...baseCase, status: 'closed' }], '2026-03-08'), [])
})

test('a manual follow-up replaces the automatic ones before treatment', () => {
  const actions = rules.buildWcNextActions([{ ...baseCase, next_action_label: 'Call adjuster', next_action_due: '2026-03-12', next_action_priority: 'low' }], '2026-03-08')
  assert.equal(actions.length, 1)
  assert.equal(actions[0].title, 'Call adjuster')
  assert.equal(actions[0].priority, 'low')
})

test('only the author or a configurer can edit authored notes', () => {
  assert.equal(rules.canEditAuthoredNote({ userId: 'u1', createdBy: 'u1', canConfigure: false }), true)
  assert.equal(rules.canEditAuthoredNote({ userId: 'u2', createdBy: 'u1', canConfigure: false }), false)
  assert.equal(rules.canEditAuthoredNote({ userId: 'u2', createdBy: 'u1', canConfigure: true }), true)
  assert.equal(rules.canEditAuthoredNote({ userId: 'u2', createdBy: null, canConfigure: false }), false)
})
