/**
 * Port slice 19 (forklifts): unit tests for src/lib/forgeForkliftRules.ts.
 * Run: node --experimental-strip-types --test apps/web/tests/port-s19-forklift-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeForkliftRules.ts'))

const settings = rules.DEFAULT_FORKLIFT_SETTINGS
const LOC = '20000000-0000-4000-8000-000000000300'
const PERSON = '60000000-0000-4000-8000-000000003002'

const item = (id, extra = {}) => ({ id, organization_id: null, section: 'visual', label: id, power_sources: null, critical: true, allow_na: false, sort_order: 10, ...extra })

test('truck classes, types and power sources', () => {
  assert.equal(rules.isTruckClass('VII'), true)
  assert.equal(rules.isTruckClass('VIII'), false)
  assert.equal(rules.isPowerSource('lpg'), true)
  assert.equal(rules.TYPICAL_CLASS.reach, 'II')
  assert.equal(rules.powerClassProblem('I', 'lpg'), 'Class I trucks are electric.')
  assert.equal(rules.powerClassProblem('V', 'electric'), 'Class V trucks have an internal combustion engine.')
  assert.equal(rules.powerClassProblem('VII', 'diesel'), null)
  assert.equal(rules.powerClassProblem('VI', 'electric'), null)
})

test('truckProblems', () => {
  const good = { name: 'FL-1', location_id: LOC, truck_class: 'IV', truck_type: 'sit_down_counterbalance', power_source: 'lpg', rated_capacity_lb: '5000' }

  assert.deepEqual(rules.truckProblems(good, { today: '2026-11-24' }), [])
  assert.deepEqual(rules.truckProblems({ ...good, name: ' ' }, { today: '2026-11-24' }), ['Give the forklift a name or unit number.'])
  assert.deepEqual(rules.truckProblems({ truck_class: 'I', truck_type: 'reach', power_source: 'electric' }, { newAsset: false }), [], 'existing equipment needs no name or location')
  assert.ok(rules.truckProblems({ ...good, power_source: 'electric' }, { today: '2026-11-24' }).includes('Class IV trucks have an internal combustion engine.'))
  assert.ok(rules.truckProblems({ ...good, rated_capacity_lb: 50 }, { today: '2026-11-24' }).includes('Rated capacity must be between 100 and 200,000 lb.'))
  assert.ok(rules.truckProblems({ ...good, nameplate_verified_on: '2026-12-01' }, { today: '2026-11-24' }).includes("The nameplate check date can't be in the future."))
  assert.ok(rules.truckProblems({ ...good, truck_type: 'hovercraft' }, { today: '2026-11-24' }).includes('Choose the type of truck.'))
})

test('truckSummary and nameplateWarning', () => {
  assert.equal(rules.truckSummary({ truck_class: 'I', truck_type: 'sit_down_counterbalance', power_source: 'electric', rated_capacity_lb: 5000 }), 'Class I · Sit-down counterbalance · Electric (battery) · 5,000 lb')
  assert.match(rules.nameplateWarning({ attachments: 'Clamp', nameplate_verified_on: null }), /1910\.178\(a\)\(4\)/)
  assert.equal(rules.nameplateWarning({ attachments: 'Clamp', nameplate_verified_on: '2026-01-01' }), null)
  assert.equal(rules.nameplateWarning({ attachments: '  ', nameplate_verified_on: null }), null)
})

test('applicableItems: power source, archived, order', () => {
  const items = [
    item('horn', { section: 'operational', sort_order: 10 }),
    item('battery', { power_sources: ['electric'], sort_order: 80 }),
    item('lpg', { power_sources: ['lpg', 'dual_fuel'], sort_order: 90 }),
    item('tires', { sort_order: 20 }),
    item('old', { archived_at: '2026-01-01' })
  ]

  assert.deepEqual(rules.applicableItems(items, 'electric').map(row => row.id), ['tires', 'battery', 'horn'])
  assert.deepEqual(rules.applicableItems(items, 'dual_fuel').map(row => row.id), ['tires', 'lpg', 'horn'])
})

test('checkAnswersProblem matches the database messages', () => {
  const items = [item('Horn'), item('Extinguisher', { allow_na: true, critical: false })]
  const ok = [
    { item_id: 'Horn', answer: 'ok' },
    { item_id: 'Extinguisher', answer: 'na' }
  ]

  assert.equal(rules.checkAnswersProblem(items, ok), null)
  assert.equal(rules.checkAnswersProblem(items, ok.slice(1)), 'Answer every item: "Horn" is missing.')
  assert.equal(rules.checkAnswersProblem(items, [{ item_id: 'Horn', answer: '' }, ok[1]]), 'Answer every item: "Horn" is missing.')
  assert.equal(rules.checkAnswersProblem(items, [...ok, ok[0]]), '"Horn" is answered more than once.')
  assert.equal(rules.checkAnswersProblem(items, [{ item_id: 'Horn', answer: 'na' }, ok[1]]), '"Horn" can\'t be marked N/A.')
  assert.equal(rules.checkAnswersProblem(items, [{ item_id: 'Horn', answer: 'defect', note: ' ' }, ok[1]]), 'Describe the defect for "Horn".')
  assert.equal(rules.checkAnswersProblem(items, [...ok, { item_id: 'Ghost', answer: 'ok' }]), 'The checklist changed. Reload the page and answer it again.')
})

test('checkOutcome: critical defects take the truck out of service unless settings say not', () => {
  const items = [item('Horn'), item('Decals', { critical: false })]

  assert.deepEqual(rules.checkOutcome(items, [{ item_id: 'Horn', answer: 'ok' }, { item_id: 'Decals', answer: 'ok' }]), { result: 'pass', defects: 0, criticalDefects: 0, outOfService: false })
  assert.deepEqual(rules.checkOutcome(items, [{ item_id: 'Horn', answer: 'ok' }, { item_id: 'Decals', answer: 'defect', note: 'x' }]), { result: 'fail', defects: 1, criticalDefects: 0, outOfService: false })
  assert.equal(rules.checkOutcome(items, [{ item_id: 'Horn', answer: 'defect', note: 'x' }]).outOfService, true)
  assert.equal(rules.checkOutcome(items, [{ item_id: 'Horn', answer: 'defect', note: 'x' }], false).outOfService, false)
})

test('checkedToday uses the company time zone', () => {
  // 03:00 UTC on Nov 24 is still Nov 23 in Chicago.
  const now = new Date('2026-11-24T15:00:00Z')

  assert.equal(rules.checkedToday('2026-11-24T03:00:00Z', 'America/Chicago', now), false)
  assert.equal(rules.checkedToday('2026-11-24T07:00:00Z', 'America/Chicago', now), true)
  assert.equal(rules.checkedToday(null, 'America/Chicago', now), false)
  assert.equal(rules.todayIn('America/Chicago', new Date('2026-11-24T03:00:00Z')), '2026-11-23')
})

test('dates: addMonths clamps to the month end like Postgres, daysBetween', () => {
  assert.equal(rules.addMonths('2026-11-24', 36), '2029-11-24')
  assert.equal(rules.addMonths('2028-02-29', 12), '2029-02-28')
  assert.equal(rules.addMonths('2026-08-31', 6), '2027-02-28')
  assert.equal(rules.daysBetween('2026-11-24', '2026-12-24'), 30)
  assert.equal(rules.daysBetween('2026-11-24', '2026-11-20'), -4)
  assert.equal(rules.formatDate('2026-03-01'), 'March 1, 2026')
})

test('settingsProblems', () => {
  assert.deepEqual(rules.settingsProblems(settings), [])
  assert.equal(rules.settingsProblems({ ...settings, evaluation_months: 48 }).length, 1)
  assert.equal(rules.settingsProblems({ ...settings, expiry_notice_days: 0 }).length, 1)
  assert.deepEqual(rules.normalizeSettings(null), settings)
  assert.equal(rules.normalizeSettings({ evaluation_months: 24, require_training: false }).evaluation_months, 24)
  assert.equal(rules.normalizeSettings({ require_training: false }).require_training, false)
})

test('authorizationProblems matches the database rules', () => {
  const today = '2026-11-24'
  const good = { personnel_id: PERSON, truck_classes: ['I'], training_completed_on: '2026-11-01', evaluated_on: '2026-11-02', evaluator_name: 'Pat' }

  assert.deepEqual(rules.authorizationProblems(good, settings, today), [])
  assert.deepEqual(rules.authorizationProblems({ ...good, truck_classes: [] }, settings, today), ['Choose the truck classes this operator is authorized for.'])
  assert.deepEqual(rules.authorizationProblems({ ...good, evaluated_on: '2026-11-25' }, settings, today), ["Training and evaluation dates can't be in the future."])
  assert.deepEqual(rules.authorizationProblems({ ...good, evaluated_on: '2026-10-01' }, settings, today), ["The evaluation can't be before the training."])
  assert.deepEqual(rules.authorizationProblems({ ...good, training_completed_on: '2023-01-01', evaluated_on: '2023-11-01' }, settings, today), [
    'That evaluation is more than 36 months old. Evaluate the operator again.'
  ])
  assert.deepEqual(rules.authorizationProblems({ ...good, training_completed_on: '2023-01-01', evaluated_on: '2023-11-24' }, settings, today), [], 'exactly 36 months still counts today')
  assert.deepEqual(rules.authorizationProblems({ ...good, evaluator_personnel_id: PERSON }, settings, today), ["Operators can't evaluate themselves."])
  assert.deepEqual(rules.authorizationProblems({ ...good, evaluator_name: '' }, settings, today), ['Name the person who evaluated the operator.'])
})

test('operatorStanding, in the database order', () => {
  const today = '2026-11-24'
  const op = { status: 'authorized', truck_classes: ['I', 'IV'], expires_on: '2028-01-01', refresher_required: false }

  assert.equal(rules.operatorStanding(null, { today }), 'none')
  assert.equal(rules.operatorStanding(op, { today }), 'authorized')
  assert.equal(rules.operatorStanding({ ...op, expires_on: '2026-12-10' }, { today }), 'expiring')
  assert.equal(rules.operatorStanding({ ...op, expires_on: '2026-12-30' }, { today, noticeDays: 30 }), 'authorized')
  assert.equal(rules.operatorStanding({ ...op, expires_on: '2026-11-24' }, { today }), 'expiring', 'the expiry day itself still counts')
  assert.equal(rules.operatorStanding({ ...op, expires_on: '2026-11-23' }, { today }), 'expired')
  assert.equal(rules.operatorStanding({ ...op, expires_on: '2026-11-23', refresher_required: true }, { today }), 'refresher')
  assert.equal(rules.operatorStanding({ ...op, status: 'suspended', refresher_required: true }, { today }), 'suspended')
  assert.equal(rules.operatorStanding({ ...op, status: 'revoked' }, { today }), 'revoked')
  assert.equal(rules.operatorStanding(op, { today, trainingCurrent: false }), 'training')
  assert.equal(rules.canOperate('expiring'), true)
  assert.equal(rules.canOperate('training'), false)
  assert.equal(rules.standingTone('authorized'), 'default')
  assert.equal(rules.standingTone('expired'), 'destructive')
})

test('operatorProblemFor and operatorActions', () => {
  const today = '2026-11-24'
  const op = { status: 'authorized', truck_classes: ['I'], expires_on: '2028-01-01', refresher_required: false }

  assert.equal(rules.operatorProblemFor('Ana', op, 'I', { today }), null)
  assert.equal(rules.operatorProblemFor('Ana', op, 'IV', { today }), 'Ana is not authorized for Class IV trucks.')
  assert.equal(rules.operatorProblemFor('Ana', null, 'I', { today }), 'Ana is not an authorized forklift operator.')
  assert.equal(rules.operatorProblemFor('Ana', { ...op, expires_on: '2026-11-01' }, 'I', { today }), "Ana's forklift evaluation expired on November 1, 2026.")
  assert.equal(rules.operatorProblemFor('Ana', op, 'I', { today, trainingCurrent: false, courseTitle: 'PIT Operator' }), 'Ana has no current PIT Operator training.')

  assert.deepEqual(rules.operatorActions(op), ['suspend', 'require_refresher', 'revoke'])
  assert.deepEqual(rules.operatorActions({ ...op, status: 'suspended', refresher_required: true }), ['reinstate', 'revoke'])
  assert.deepEqual(rules.operatorActions({ ...op, status: 'revoked' }), [])
  assert.equal(Object.keys(rules.REFRESHER_REASONS).length, 6)
})
