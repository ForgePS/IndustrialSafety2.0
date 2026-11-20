/**
 * Port slice 14: unit tests for src/lib/forgeEmergencyRules.ts (plans and drills, alert messages, notices,
 * audiences and scope, roll call, responses).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s14-emergency-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeEmergencyRules.ts'))

const L1 = '00000000-0000-4000-8000-000000000001'
const L2 = '00000000-0000-4000-8000-000000000002'
const D1 = '00000000-0000-4000-8000-0000000000d1'
const P = n => '00000000-0000-4000-8000-0000000001' + String(n).padStart(2, '0')
const U = n => '00000000-0000-4000-8000-0000000002' + String(n).padStart(2, '0')

test('cleanPlanInput: kinds, required fields, drill-only fields', () => {
  assert.match(rules.cleanPlanInput({ kind: 'nope', title: 'x' }).error, /kind/)
  assert.match(rules.cleanPlanInput({ kind: 'plan', title: '  ' }).error, /title/)
  assert.match(rules.cleanPlanInput({ kind: 'scenario', title: 'Fire' }).error, /kind of emergency/)
  assert.match(rules.cleanPlanInput({ kind: 'drill', title: 'Fire drill' }).error, /drill date/)
  assert.match(rules.cleanPlanInput({ kind: 'drill', title: 'Fire drill', eventDate: '2026-02-30' }).error, /valid drill date/)
  assert.match(rules.cleanPlanInput({ kind: 'drill', title: 'D', eventDate: '2026-11-01', status: 'completed' }).error, /after-action/)
  assert.match(rules.cleanPlanInput({ kind: 'drill', title: 'D', eventDate: '2026-11-01', participants: '2.5' }).error, /whole number/)
  assert.match(rules.cleanPlanInput({ kind: 'plan', title: 'P', status: 'scheduled' }).error, /status/)

  const plan = rules.cleanPlanInput({ kind: 'plan', title: '  Main   plant EAP ', reviewDueOn: '2027-01-01', eventDate: '2026-01-01', participants: 4, planId: L1 })

  assert.equal(plan.title, 'Main plant EAP')
  assert.equal(plan.status, 'draft')
  assert.equal(plan.reviewDueOn, '2027-01-01')
  assert.equal(plan.eventDate, null, 'plans have no drill date')
  assert.equal(plan.participants, null)
  assert.equal(plan.planId, null, 'plans do not link to a plan')

  const drill = rules.cleanPlanInput({
    kind: 'drill',
    title: 'Q4 evacuation',
    eventDate: '2026-11-01',
    status: 'completed',
    afterAction: 'Assembly took 6 minutes.',
    participants: '42',
    durationMinutes: '15',
    scenarioType: 'evacuation',
    planId: L1,
    reviewDueOn: '2027-01-01'
  })

  assert.equal(drill.status, 'completed')
  assert.equal(drill.participants, 42)
  assert.equal(drill.durationMinutes, 15)
  assert.equal(drill.planId, L1)
  assert.equal(drill.reviewDueOn, null)
})

test('reviewState', () => {
  assert.equal(rules.reviewState(null, '2026-11-19'), 'none')
  assert.equal(rules.reviewState('2026-11-18', '2026-11-19'), 'overdue')
  assert.equal(rules.reviewState('2026-12-19', '2026-11-19'), 'due_soon')
  assert.equal(rules.reviewState('2026-12-20', '2026-11-19'), 'ok')
})

test('cleanAlertInput: type, severity, lengths; response asked by default', () => {
  const base = { alertType: 'evacuation', severity: 'extreme', headline: ' Evacuate   Building A ', message: 'Leave now by the nearest exit.' }

  assert.match(rules.cleanAlertInput({ ...base, alertType: 'zombies' }).error, /type/)
  assert.match(rules.cleanAlertInput({ ...base, severity: 'meh' }).error, /severity/)
  assert.match(rules.cleanAlertInput({ ...base, headline: '' }).error, /headline/)
  assert.match(rules.cleanAlertInput({ ...base, headline: 'x'.repeat(121) }).error, /120/)
  assert.match(rules.cleanAlertInput({ ...base, message: 'x'.repeat(1001) }).error, /1,000/)

  const alert = rules.cleanAlertInput(base)

  assert.equal(alert.headline, 'Evacuate Building A')
  assert.equal(alert.requiresResponse, true)
  assert.equal(alert.isDrill, false)
  assert.equal(alert.instructions, null)
  assert.equal(rules.cleanAlertInput({ ...base, requiresResponse: false, isDrill: true }).requiresResponse, false)
  assert.equal(rules.alertNumber(new Date('2026-11-19T10:00:00Z'), '3f9a1c'), 'EA-20261119-3F9A1C')
})

test('alertNotice: drill marker, update and all-clear wording', () => {
  const alert = { alertType: 'shelter_in_place', severity: 'severe', headline: 'Tornado warning', message: 'Go to the shelter.', instructions: 'Stay away from windows.', isDrill: true, requiresResponse: true }

  const issued = rules.alertNotice(alert, 'issued')

  assert.equal(issued.title, '[DRILL] SHELTER IN PLACE: Tornado warning')
  assert.match(issued.body, /Go to the shelter\.\n\nStay away from windows\.\n\nOpen the alert and tell us if you're safe\./)
  assert.equal(rules.alertNotice({ ...alert, isDrill: false }, 'update').title, 'UPDATE SHELTER IN PLACE: Tornado warning')
  assert.doesNotMatch(rules.alertNotice(alert, 'update').body, /tell us/)
  assert.equal(rules.alertNotice({ ...alert, isDrill: false }, 'all_clear').title, 'ALL CLEAR: Tornado warning')
})

test('cleanAudience and audienceWithinScope', () => {
  assert.deepEqual(rules.cleanAudience({}), { scope: 'company', locationIds: [], departmentIds: [], personnelIds: [] })
  assert.match(rules.cleanAudience({ scope: 'targeted' }).error, /at least one/)

  const targeted = rules.cleanAudience({ scope: 'company', locationIds: [L1, L1, 'bad'], departmentIds: [D1] })

  assert.equal(targeted.scope, 'targeted')
  assert.deepEqual(targeted.locationIds, [L1])

  assert.equal(rules.audienceWithinScope(rules.cleanAudience({}), null), null, 'organization scope can alert everyone')
  assert.match(rules.audienceWithinScope(rules.cleanAudience({}), [L1]), /whole company/)
  assert.equal(rules.audienceWithinScope(rules.cleanAudience({ locationIds: [L1] }), [L1]), null)
  assert.match(rules.audienceWithinScope(rules.cleanAudience({ locationIds: [L2] }), [L1]), /own locations/)
  assert.match(rules.audienceWithinScope(rules.cleanAudience({ locationIds: [L1], departmentIds: [D1] }), [L1]), /Departments/)
})

test('resolveAudience: OR targeting, exclusions, one per account, company adds members', () => {
  const person = (n, patch = {}) => ({ id: P(n), name: 'Person ' + n, userId: U(n), locationId: L1, departmentId: null, status: 'active', archived: false, ...patch })
  const personnel = [
    person(1),
    person(2, { locationId: L2, departmentId: D1 }),
    person(3, { locationId: L2 }),
    person(4, { userId: null }),
    person(5, { status: 'terminated' }),
    person(6, { userId: U(9) }),
    person(7, { userId: U(1), locationId: L2, departmentId: D1 })
  ]
  const members = [1, 2, 3, 5, 8].map(n => ({ userId: U(n), name: 'Member ' + n }))

  const byLocation = rules.resolveAudience({ audience: rules.cleanAudience({ locationIds: [L1] }), personnel, members })

  assert.deepEqual(byLocation.recipients.map(r => r.userId), [U(1)])
  assert.deepEqual(byLocation.byReason, { no_account: 1, not_active: 1, not_member: 1 })

  const mixed = rules.resolveAudience({ audience: rules.cleanAudience({ departmentIds: [D1], personnelIds: [P(3)] }), personnel, members })

  assert.deepEqual(mixed.recipients.map(r => r.userId).sort(), [U(1), U(2), U(3)].sort(), 'department OR picked person, account counted once')

  const company = rules.resolveAudience({ audience: rules.cleanAudience({}), personnel, members })

  assert.deepEqual(company.recipients.map(r => r.userId).sort(), [U(1), U(2), U(3), U(8)].sort(), 'members without an employee record are included')
  assert.equal(company.tooMany, false)
})

test('rollCall: order, counts and accounted percent', () => {
  const recipients = ['Cara', 'Abe', 'Bea', 'Dan'].map((name, index) => ({ userId: U(index + 1), personnelId: null, name, locationId: null, departmentId: null }))
  const result = rules.rollCall(recipients, [
    { userId: U(1), status: 'safe', note: null, respondedAt: '2026-11-19T10:00:00Z' },
    { userId: U(4), status: 'need_help', note: 'Stuck in dock 3', respondedAt: '2026-11-19T10:01:00Z' }
  ])

  assert.deepEqual(result.rows.map(row => row.name + ':' + row.status), ['Dan:need_help', 'Abe:no_response', 'Bea:no_response', 'Cara:safe'])
  assert.deepEqual(result.counts, { total: 4, safe: 1, need_help: 1, no_response: 2 })
  assert.equal(result.accountedPercent, 50)
  assert.equal(rules.rollCall([], []).accountedPercent, 0)
})

test('cleanResponse', () => {
  assert.match(rules.cleanResponse({ status: 'maybe' }).error, /safe/)
  assert.match(rules.cleanResponse({ status: 'safe', note: 'x'.repeat(501) }).error, /500/)
  assert.deepEqual(rules.cleanResponse({ status: 'need_help', note: '  Dock 3 ' }), { status: 'need_help', note: 'Dock 3' })
})
