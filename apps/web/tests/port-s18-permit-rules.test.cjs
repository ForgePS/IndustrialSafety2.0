/**
 * Port slice 18 (high-risk work permits): unit tests for src/lib/forgePermitRules.ts.
 * Run: node --experimental-strip-types --test apps/web/tests/port-s18-permit-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgePermitRules.ts'))

const settings = rules.DEFAULT_PERMIT_SETTINGS
const P = (role, personnel_id, extra = {}) => ({ role, personnel_id, contractor_worker_id: null, ...extra })

test('types, slugs and paths', () => {
  assert.equal(rules.permitTypeFromSlug('working-at-heights'), 'heights')
  assert.equal(rules.permitTypeFromSlug('nope'), null)
  assert.equal(rules.permitPath('hot_work', 'abc'), '/permits/hot-work/abc')
  assert.equal(rules.isPermitType('electrical'), true)
  assert.equal(rules.isPermitType('loto'), false)
})

test('peopleProblem: required roles and separation', () => {
  assert.equal(rules.peopleProblem('confined_space', []), 'Add an entry supervisor.')
  assert.equal(rules.peopleProblem('confined_space', [P('entry_supervisor', 'a'), P('attendant', 'b'), P('entrant', 'c')]), null)
  assert.equal(rules.peopleProblem('confined_space', [P('entry_supervisor', 'a'), P('attendant', 'b'), P('entrant', 'b')]), "The attendant can't also be an entrant.")
  assert.equal(rules.peopleProblem('confined_space', [P('entry_supervisor', 'a'), P('attendant', 'b', { removed_at: '2026-11-23' }), P('entrant', 'c')]), 'Add an attendant.')
  assert.equal(rules.peopleProblem('hot_work', [P('hot_work_operator', 'a'), P('fire_watch', 'a')]), "The fire watch can't also do the hot work.")
  assert.equal(rules.peopleProblem('heights', [P('worker', 'a')]), 'Add a competent person.')
  assert.equal(rules.peopleProblem('electrical', [P('safety_watch', 'a')]), 'Add at least one qualified person.')
  // Contractor workers count too, and two different nulls are not "the same person".
  assert.equal(
    rules.peopleProblem('hot_work', [
      { role: 'hot_work_operator', personnel_id: null, contractor_worker_id: 'w1' },
      { role: 'fire_watch', personnel_id: null, contractor_worker_id: 'w2' }
    ]),
    null
  )
})

test('normalizeDetails and detailsProblem per type', () => {
  const cs = rules.normalizeDetails('confined_space', { rescue_service: '  Site team ', communication: 'Radio', entry_type: 'sideways' })

  assert.deepEqual(cs, { rescue_service: 'Site team', communication: 'Radio' })
  assert.equal(rules.detailsProblem('confined_space', cs), null)
  assert.equal(rules.detailsProblem('confined_space', {}), 'Name the rescue service for this entry.')

  const hw = rules.normalizeDetails('hot_work', { work_type: 'welding' })

  assert.equal(hw.gas_test_required, false)
  assert.equal(rules.detailsProblem('hot_work', hw), null)
  assert.equal(rules.detailsProblem('hot_work', { work_type: 'laser' }), 'Pick the kind of hot work.')

  const wah = rules.normalizeDetails('heights', { working_height_ft: '14', fall_protection: ['personal_fall_arrest', 'personal_fall_arrest'], rescue_plan: 'Lift' })

  assert.deepEqual(wah.fall_protection, ['personal_fall_arrest'])
  assert.equal(wah.working_height_ft, 14)
  assert.equal(rules.detailsProblem('heights', wah), 'Describe the anchorage for the personal fall protection.')
  assert.equal(rules.detailsProblem('heights', { ...wah, anchorage: 'Beam clamp' }), null)
  assert.equal(rules.detailsProblem('heights', { working_height_ft: 10, fall_protection: ['guardrail'], rescue_plan: 'x' }), null)

  const eew = {
    voltage: 480,
    equipment: 'MCC-2',
    justification: 'infeasible',
    justification_detail: 'Process cannot stop',
    limited_approach: '3 ft 6 in',
    restricted_approach: '1 ft',
    arc_flash_boundary: '4 ft',
    ppe_category: '2',
    ppe: 'CAT 2 suit, gloves'
  }

  assert.equal(rules.detailsProblem('electrical', eew), null)
  assert.equal(rules.detailsProblem('electrical', { ...eew, ppe_category: undefined }), 'Enter the incident energy or the PPE category.')
  assert.equal(rules.detailsProblem('electrical', { ...eew, ppe_category: undefined, incident_energy: 6.2 }), null)
  assert.equal(rules.detailsProblem('electrical', { ...eew, ppe_category: '5' }), 'PPE category must be 1 to 4.')
  assert.equal(rules.lowVoltageHint({ voltage: 24 }) !== null, true)
  assert.equal(rules.lowVoltageHint({ voltage: 480 }), null)
})

test('windowProblem enforces order, future end and max hours', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  const at = iso => new Date(iso)

  assert.equal(rules.windowProblem('hot_work', at('2026-11-23T12:00:00Z'), at('2026-11-23T20:00:00Z'), settings, now), null)
  assert.equal(rules.windowProblem('hot_work', at('2026-11-23T12:00:00Z'), at('2026-11-23T11:00:00Z'), settings, now), 'The end time must be after the start time.')
  assert.equal(rules.windowProblem('hot_work', at('2026-11-23T08:00:00Z'), at('2026-11-23T11:00:00Z'), settings, now), 'The valid-until time has passed. Change the times.')
  assert.match(rules.windowProblem('hot_work', at('2026-11-23T12:00:00Z'), at('2026-11-24T01:00:00Z'), settings, now), /at most 12 hours/)
})

test('gasProblems uses the limits, and hot work has its own LEL limit', () => {
  assert.deepEqual(rules.gasProblems('confined_space', { o2_pct: 20.9, lel_pct: 0, h2s_ppm: 0, co_ppm: 0 }, settings), [])
  assert.deepEqual(rules.gasProblems('confined_space', { o2_pct: 19.4, lel_pct: 10, h2s_ppm: 10, co_ppm: 35 }, settings), [
    'Oxygen 19.4% is below 19.5%',
    'LEL 10% is at or above 10%',
    'H2S 10 ppm is at or above 10 ppm',
    'CO 35 ppm is at or above 35 ppm'
  ])
  assert.deepEqual(rules.gasProblems('confined_space', { o2_pct: 23.6 }, settings), ['Oxygen 23.6% is above 23.5%'])
  const strict = { ...settings, hot_work_lel_max: 0 }

  assert.deepEqual(rules.gasProblems('hot_work', { lel_pct: 0 }, strict), [])
  assert.deepEqual(rules.gasProblems('hot_work', { lel_pct: 1 }, strict), ['LEL 1% is at or above 0%'])
  assert.deepEqual(rules.gasProblems('confined_space', { o2_pct: 20.9, lel_pct: 0, other_gas: 'NH3', other_value: 30, other_limit: 25 }, settings), ['NH3 30 is at or above 25'])
})

test('gasTestProblem: latest test, age and after a suspension', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  const cs = { permit_type: 'confined_space', details: {} }

  assert.equal(rules.gasTestProblem({ permit_type: 'heights', details: {} }, [], settings, null, now), null)
  assert.equal(rules.gasTestProblem({ permit_type: 'hot_work', details: { gas_test_required: false } }, [], settings, null, now), null)
  assert.equal(rules.gasTestProblem({ permit_type: 'hot_work', details: { gas_test_required: true } }, [], settings, null, now), 'Record a gas test first.')
  assert.equal(rules.gasTestProblem(cs, [{ tested_at: '2026-11-23T11:30:00Z', passed: true }], settings, null, now), null)
  assert.equal(
    rules.gasTestProblem(cs, [{ tested_at: '2026-11-23T11:30:00Z', passed: true }, { tested_at: '2026-11-23T11:45:00Z', passed: false }], settings, null, now),
    'The last gas test failed. Ventilate and test again.'
  )
  assert.match(rules.gasTestProblem(cs, [{ tested_at: '2026-11-23T10:30:00Z', passed: true }], settings, null, now), /more than 60 minutes old/)
  assert.equal(rules.gasTestProblem(cs, [{ tested_at: '2026-11-23T11:30:00Z', passed: true }], settings, '2026-11-23T11:40:00Z', now), 'Test again after the suspension.')
})

test('checklist: company items override built-ins; answers checked', () => {
  const defs = [
    { check_key: 'a', label: 'Alpha', required: true, allow_na: false, sort_order: 10, organization_id: null },
    { check_key: 'b', label: 'Bravo', required: true, allow_na: true, sort_order: 20, organization_id: null },
    { check_key: 'b', label: 'Bravo (ours)', required: false, allow_na: true, sort_order: 20, organization_id: 'org' },
    { check_key: 'c', label: 'Charlie', required: true, allow_na: true, sort_order: 30, organization_id: 'org' }
  ]

  assert.deepEqual(rules.mergeCheckDefinitions(defs).map(item => item.label), ['Alpha', 'Bravo (ours)', 'Charlie'])
  assert.equal(rules.checklistProblem(defs, []), 'Answer the checklist: Alpha.')
  assert.equal(rules.checklistProblem(defs, [{ check_key: 'a', answer: 'no', note: null }]), 'Not ready: Alpha.')
  assert.equal(rules.checklistProblem(defs, [{ check_key: 'a', answer: 'na', note: 'x' }]), "Alpha can't be marked not applicable.")
  assert.equal(rules.checklistProblem(defs, [{ check_key: 'a', answer: 'yes', note: null }, { check_key: 'c', answer: 'na', note: ' ' }]), 'Add a note for "Charlie".')
  assert.equal(rules.checklistProblem(defs, [{ check_key: 'a', answer: 'yes', note: null }, { check_key: 'c', answer: 'na', note: 'Not used' }]), null)
})

test('permitActions: who may do what, and when', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  const base = { permit_type: 'confined_space', valid_until: '2026-11-23T18:00:00Z', requested_by: 'me', created_by: 'me', work_completed_at: null }
  const requester = { request: true, approve: false, manage: false }
  const approver = { request: true, approve: true, manage: false }

  assert.equal(rules.permitActions({ ...base, status: 'draft' }, requester, 'me', settings, 0, now).submit, true)
  assert.equal(rules.permitActions({ ...base, status: 'requested' }, approver, 'me', settings, 0, now).approve, false)
  assert.equal(rules.permitActions({ ...base, status: 'requested' }, approver, 'me', { ...settings, allow_self_approval: true }, 0, now).approve, true)
  assert.equal(rules.permitActions({ ...base, status: 'requested' }, approver, 'other', settings, 0, now).approve, true)
  assert.equal(rules.permitActions({ ...base, status: 'approved', valid_until: '2026-11-23T11:00:00Z' }, approver, 'other', settings, 0, now).issue, false)
  assert.equal(rules.permitActions({ ...base, status: 'active' }, requester, 'other', settings, 0, now).suspend, true)
  assert.equal(rules.permitActions({ ...base, status: 'suspended' }, requester, 'other', settings, 0, now).resume, false)
  assert.equal(rules.permitActions({ ...base, status: 'active' }, approver, 'other', settings, 1, now).close, false)
  assert.equal(rules.permitActions({ ...base, status: 'active' }, approver, 'other', settings, 0, now).close, true)
  assert.equal(rules.permitActions({ ...base, status: 'active' }, approver, 'other', settings, 0, now).signIn, true)
  assert.equal(rules.permitActions({ ...base, status: 'active', valid_until: '2026-11-23T11:00:00Z' }, approver, 'other', settings, 0, now).signIn, false)
  assert.equal(rules.permitActions({ ...base, status: 'active' }, approver, 'other', settings, 0, now).editChecklist, false)

  const hot = { ...base, permit_type: 'hot_work', status: 'active' }

  assert.equal(rules.permitActions(hot, approver, 'other', settings, 0, now).close, false)
  assert.equal(rules.permitActions(hot, approver, 'other', settings, 0, now).completeWork, true)
  assert.equal(rules.permitActions({ ...hot, work_completed_at: '2026-11-23T11:30:00Z' }, approver, 'other', settings, 0, now).close, false)
  assert.equal(rules.permitActions({ ...hot, work_completed_at: '2026-11-23T10:30:00Z' }, approver, 'other', settings, 0, now).close, true)
  assert.deepEqual(rules.closeBlockers({ ...hot, work_completed_at: null }, settings, 0, now), ['Mark the work complete; the fire watch then runs for 60 minutes.'])
})

test('isExpired and minutesLeft', () => {
  const now = new Date('2026-11-23T12:00:00Z')

  assert.equal(rules.isExpired({ status: 'active', valid_until: '2026-11-23T11:59:00Z' }, now), true)
  assert.equal(rules.isExpired({ status: 'closed', valid_until: '2026-11-23T11:59:00Z' }, now), false)
  assert.equal(rules.minutesLeft({ status: 'active', valid_until: '2026-11-23T12:45:00Z' }, now), 45)
  assert.equal(rules.minutesLeft({ status: 'draft', valid_until: '2026-11-23T12:45:00Z' }, now), null)
})

test('local date-time conversion in a company time zone, across DST', () => {
  assert.equal(rules.localDateTimeToIso('2026-11-23T08:00', 'America/Chicago'), '2026-11-23T14:00:00.000Z')
  assert.equal(rules.localDateTimeToIso('2026-07-01T08:00', 'America/Chicago'), '2026-07-01T13:00:00.000Z')
  assert.equal(rules.localDateTimeToIso('bad', 'America/Chicago'), null)
  assert.equal(rules.isoToLocalDateTime('2026-11-23T14:00:00.000Z', 'America/Chicago'), '2026-11-23T08:00')
  assert.equal(rules.isoToLocalDateTime('2026-07-01T13:00:00Z', 'America/New_York'), '2026-07-01T09:00')
})

test('normalizeSettings fills defaults and turns numeric strings into numbers', () => {
  const s = rules.normalizeSettings({ o2_min: '19.0', fire_watch_minutes: 30, allow_self_approval: true })

  assert.equal(s.o2_min, 19)
  assert.equal(s.fire_watch_minutes, 30)
  assert.equal(s.allow_self_approval, true)
  assert.equal(s.co_max, 35)
  assert.equal(rules.maxHours(s, 'electrical'), 12)
})
