/**
 * Port slice 16: unit tests for src/lib/forgeProcessSafetyRules.ts (management of change, approvals, pre-startup
 * safety review, actions and blockers, process hazard analyses, notices).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s16-process-safety-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeProcessSafetyRules.ts'))

const TODAY = '2026-11-20'
const L1 = '00000000-0000-4000-8000-000000000001'
const U1 = '00000000-0000-4000-8000-0000000000a1'
const U2 = '00000000-0000-4000-8000-0000000000a2'
const P1 = '00000000-0000-4000-8000-0000000000b1'

const baseMoc = { title: ' Raise  reactor R-2 setpoint ', changeType: 'process', locationId: L1, description: 'Raise to 180 C', reason: 'Throughput', riskLevel: 'high' }

test('dates: addYears handles 29 February', () => {
  assert.equal(rules.addYears('2024-02-29', 5), '2029-02-28')
  assert.equal(rules.addYears('2026-11-20', 5), '2031-11-20')
  assert.equal(rules.addDays('2026-12-31', 1), '2027-01-01')
})

test('cleanMocInput', () => {
  assert.match(rules.cleanMocInput({ ...baseMoc, title: '' }, TODAY).error, /title/)
  assert.match(rules.cleanMocInput({ ...baseMoc, changeType: 'nope' }, TODAY).error, /type of change/)
  assert.match(rules.cleanMocInput({ ...baseMoc, locationId: 'x' }, TODAY).error, /location/)
  assert.match(rules.cleanMocInput({ ...baseMoc, reason: '' }, TODAY).error, /why/)
  assert.match(rules.cleanMocInput({ ...baseMoc, riskLevel: 'extreme' }, TODAY).error, /risk/)
  assert.match(rules.cleanMocInput({ ...baseMoc, impacts: ['psi', 'bogus'] }, TODAY).error, /impacts/)
  assert.match(rules.cleanMocInput({ ...baseMoc, isTemporary: true }, TODAY).error, /reversed/)
  assert.match(rules.cleanMocInput({ ...baseMoc, isTemporary: true, temporaryUntil: '2026-11-19' }, TODAY).error, /past/)

  const moc = rules.cleanMocInput({ ...baseMoc, impacts: ['training', 'psi', 'psi'], isTemporary: true, temporaryUntil: '2027-01-31', requiresPssr: false }, TODAY)

  assert.equal(moc.title, 'Raise reactor R-2 setpoint')
  assert.deepEqual(moc.impacts, ['psi', 'training'], 'listed in a fixed order, no duplicates')
  assert.equal(moc.temporaryUntil, '2027-01-31')
  assert.equal(moc.requiresPssr, true, 'physical changes always need a PSSR')
  assert.equal(rules.cleanMocInput({ ...baseMoc, changeType: 'organizational', requiresPssr: false }, TODAY).requiresPssr, false)
  assert.equal(rules.cleanMocInput({ ...baseMoc, temporaryUntil: '2027-01-31' }, TODAY).temporaryUntil, null, 'only temporary changes keep the date')
})

test('cleanApprovers and approvalOutcome', () => {
  assert.match(rules.cleanApprovers([], []).error, /at least one/)
  assert.match(rules.cleanApprovers([{ userId: 'x' }], []).error, /Pick/)
  assert.match(rules.cleanApprovers([{ userId: U1 }], [U1]).error, /owns or raised/)
  assert.match(rules.cleanApprovers(Array.from({ length: 11 }, (_, i) => ({ userId: U1.slice(0, -2) + String(i).padStart(2, '0') })), []).error, /at most 10/)
  assert.deepEqual(rules.cleanApprovers([{ userId: U1, role: ' Operations ' }, { userId: U1 }, { userId: U2 }], []), [
    { userId: U1, role: 'Operations' },
    { userId: U2, role: null }
  ])

  assert.equal(rules.approvalOutcome([]), 'in_review')
  assert.equal(rules.approvalOutcome(['approved', 'pending']), 'in_review')
  assert.equal(rules.approvalOutcome(['approved', 'approved']), 'approved')
  assert.equal(rules.approvalOutcome(['approved', 'rejected', 'pending']), 'rejected')
  assert.match(rules.cleanDecision({ decision: 'rejected' }).error, /why/)
  assert.deepEqual(rules.cleanDecision({ decision: 'approved', comment: ' ok ' }), { decision: 'approved', comment: 'ok' })
})

test('cleanPssr', () => {
  const all = Object.fromEntries(rules.PSSR_ITEMS.map(item => [item.key, { answer: 'yes' }]))

  assert.match(rules.cleanPssr({}).error, /Answer/)
  assert.match(rules.cleanPssr({ ...all, training_done: { answer: 'no' } }).error, /Not ready.*trained/)
  assert.match(rules.cleanPssr({ ...all, mi_ready: { answer: 'na' } }).error, /Explain/)

  const done = rules.cleanPssr({ ...all, mi_ready: { answer: 'na', note: 'No new equipment' } })

  assert.equal(done.mi_ready.note, 'No new equipment')
  assert.equal(Object.keys(done).length, rules.PSSR_ITEMS.length)
})

test('cleanActionInput', () => {
  assert.match(rules.cleanActionInput({ title: '' }, 'moc').error, /what needs/)
  assert.match(rules.cleanActionInput({ title: 'Update P&ID', ownerPersonnelId: 'x' }, 'moc').error, /owns/)
  assert.match(rules.cleanActionInput({ title: 'Update P&ID', ownerPersonnelId: P1, dueOn: '2026-02-30' }, 'moc').error, /due date/)
  assert.match(rules.cleanActionInput({ title: 'Update P&ID', ownerPersonnelId: P1, dueOn: '2026-12-01' }, 'moc').error, /before startup/)
  assert.equal(rules.cleanActionInput({ title: 'Update P&ID', ownerPersonnelId: P1, dueOn: '2026-12-01', phase: 'before_startup' }, 'moc').phase, 'before_startup')
  assert.equal(rules.cleanActionInput({ title: 'Add a high-temp alarm', ownerPersonnelId: P1, dueOn: '2026-12-01', phase: 'before_startup' }, 'pha').phase, null, 'PHA recommendations have no phase')
})

test('mocBlockers and steps', () => {
  const actions = [
    { title: 'Update P&ID', phase: 'before_startup', capaStatus: 'open', capaNumber: 'CA-1' },
    { title: 'Train operators', phase: 'before_startup', capaStatus: 'pending_verification' },
    { title: 'Review in 30 days', phase: 'after_startup', capaStatus: 'in_progress' },
    { title: 'Dropped', phase: 'before_startup', capaStatus: 'canceled' }
  ]
  const blocked = rules.mocBlockers({ requiresPssr: true, pssrCompletedAt: null, actions })

  assert.deepEqual(blocked.implement, ['The pre-startup safety review is not done', 'Pre-startup action open: CA-1 Update P&ID (not done)', 'Pre-startup action open: Dropped (canceled)'])
  assert.equal(blocked.pssr.length, 2)
  assert.equal(blocked.close.length, 3)

  const clear = rules.mocBlockers({ requiresPssr: true, pssrCompletedAt: '2026-11-20T10:00:00Z', actions: actions.map(action => ({ ...action, capaStatus: 'closed' })) })

  assert.deepEqual(clear, { pssr: [], implement: [], close: [] })
  assert.deepEqual(rules.mocBlockers({ requiresPssr: false, pssrCompletedAt: null, actions: [] }).implement, [])

  assert.equal(rules.stepAllowed('submit', 'rejected'), true)
  assert.equal(rules.stepAllowed('edit', 'approved'), false)
  assert.equal(rules.stepAllowed('close', 'approved'), false)
  assert.equal(rules.stepAllowed('cancel', 'implemented'), false)
  assert.equal(rules.temporaryOverdue({ is_temporary: true, temporary_until: '2026-11-19', status: 'implemented' }, TODAY), true)
  assert.equal(rules.temporaryOverdue({ is_temporary: true, temporary_until: '2026-11-19', status: 'closed' }, TODAY), false)
})

test('cleanPhaInput and revalidationState', () => {
  const base = { title: 'Unit 2 HAZOP', processUnit: 'Unit 2 reactor', locationId: L1, method: 'hazop', status: 'completed', completedOn: '2026-06-01' }

  assert.match(rules.cleanPhaInput({ ...base, processUnit: '' }, TODAY).error, /process/)
  assert.match(rules.cleanPhaInput({ ...base, method: 'guess' }, TODAY).error, /method/)
  assert.match(rules.cleanPhaInput({ ...base, completedOn: null }, TODAY).error, /completion date/)
  assert.match(rules.cleanPhaInput({ ...base, status: 'planned' }, TODAY).error, /Only a completed/)
  assert.match(rules.cleanPhaInput({ ...base, completedOn: '2026-12-01' }, TODAY).error, /future/)
  assert.match(rules.cleanPhaInput({ ...base, startedOn: '2026-07-01' }, TODAY).error, /before it started/)
  assert.match(rules.cleanPhaInput({ ...base, revalidateBy: '2031-06-02' }, TODAY).error, /within 5 years/)

  assert.equal(rules.cleanPhaInput(base, TODAY).revalidateBy, '2031-06-01', 'defaults to five years')
  assert.equal(rules.cleanPhaInput({ ...base, revalidateBy: '2029-06-01' }, TODAY).revalidateBy, '2029-06-01', 'earlier is allowed')
  assert.equal(rules.cleanPhaInput({ ...base, status: 'planned', completedOn: null, revalidateBy: '2030-01-01' }, TODAY).revalidateBy, null)

  assert.equal(rules.revalidationState(null, TODAY), 'none')
  assert.equal(rules.revalidationState('2026-11-19', TODAY), 'overdue')
  assert.equal(rules.revalidationState('2027-05-01', TODAY), 'due_soon')
  assert.equal(rules.revalidationState('2028-01-01', TODAY), 'ok')
})

test('mocNotice', () => {
  const moc = { moc_number: 'MOC-2026-0001', title: 'Raise setpoint' }

  assert.equal(rules.mocNotice(moc, 'review_requested').title, 'Approval needed: MOC-2026-0001: Raise setpoint')
  assert.equal(rules.mocNotice(moc, 'rejected', { by: 'Pat', comment: 'Needs a HAZOP' }).body, 'Pat rejected this change: Needs a HAZOP')
  assert.match(rules.mocNotice(moc, 'approved').body, /pre-startup safety review/)
})
