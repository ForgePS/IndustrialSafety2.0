/**
 * Port slice 11 (piece B): unit tests for the DVIR helpers (src/lib/forgeFleetDvirRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s11-dvirs.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeFleetDvirRules.ts'))
const fleet = require(path.join(__dirname, '../src/lib/forgeFleetRules.ts'))

const SIGNATURE = 'data:image/png;base64,' + 'A'.repeat(400)

test('markSectionOk answers only the unanswered items of that section with Yes', () => {
  const start = { brakes: { answer: 'no', notes: 'Soft pedal' }, horn: { answer: 'na', notes: '' }, 'trailer-brakes': { answer: null, notes: 'x' } }
  const next = rules.markSectionOk(start, 'truck')

  assert.deepEqual(next.brakes, { answer: 'no', notes: 'Soft pedal' })
  assert.deepEqual(next.horn, { answer: 'na', notes: '' })
  assert.equal(next.engine.answer, 'yes')
  assert.equal(next['trailer-brakes'].answer, null, 'other sections are untouched')
  assert.equal(rules.unansweredCount(next, 'truck'), 0)
  assert.equal(rules.unansweredCount(next, 'safety'), 5)
  assert.equal(start.engine, undefined, 'the input is not mutated')

  const all = ['truck', 'safety', 'trailer'].reduce((acc, section) => rules.markSectionOk(acc, section), {})

  assert.equal(rules.unansweredCount(all), 0)
  assert.equal(Object.keys(all).length, fleet.DVIR_ITEMS.length)
})

test('odometerDecision applies only readings at or above the current mileage', () => {
  assert.equal(rules.odometerDecision(null, 1000), 'none')
  assert.equal(rules.odometerDecision(1050, 1000), 'apply')
  assert.equal(rules.odometerDecision(1000, 1000), 'apply')
  assert.equal(rules.odometerDecision(500, null), 'apply')
  assert.equal(rules.odometerDecision(900, 1000), 'lower')
})

test('dvirOutOfServiceReason names the DVIR and the defects, trailer items marked', () => {
  assert.equal(
    rules.dvirOutOfServiceReason('DVIR-2026-000004', [
      { label: 'Brakes', section: 'truck' },
      { label: 'Tires', section: 'trailer' }
    ]),
    'DVIR DVIR-2026-000004: Brakes, Trailer tires'
  )

  const long = rules.dvirOutOfServiceReason('DVIR-1', Array.from({ length: 80 }, () => ({ label: 'Lights — Turn Indicators', section: 'truck' })))

  assert.equal(long.length, 500)
  assert.ok(long.endsWith('...'))
  assert.equal(rules.repairTitle('DVIR-2026-000004'), 'Repair DVIR defects (DVIR-2026-000004)')
})

test('dvirSignature records who signed and when', () => {
  const now = new Date('2026-11-17T15:00:00Z')

  assert.deepEqual(rules.dvirSignature({ image: SIGNATURE, name: '  Pat Driver ', userId: null, personnelId: 'p1', now }), {
    image: SIGNATURE,
    signedAt: '2026-11-17T15:00:00.000Z',
    signedByName: 'Pat Driver',
    signedByUserId: null,
    signedByPersonnelId: 'p1',
    method: 'drawn'
  })
})

test('validateMechanicCertification needs an open DVIR, an action, a name and a signature', () => {
  const ok = { status: 'open', action: 'corrected', mechanicName: 'Max', signature: SIGNATURE }

  assert.deepEqual(rules.validateMechanicCertification(ok), { ok: true })
  assert.equal(rules.validateMechanicCertification({ ...ok, status: 'needs_review' }).ok, false)
  assert.equal(rules.validateMechanicCertification({ ...ok, status: 'closed' }).ok, false)
  assert.equal(rules.validateMechanicCertification({ ...ok, action: 'fixed' }).ok, false)
  assert.equal(rules.validateMechanicCertification({ ...ok, mechanicName: '  ' }).ok, false)
  assert.equal(rules.validateMechanicCertification({ ...ok, signature: 'data:image/png;base64,AA' }).ok, false)
  assert.equal(rules.validateMechanicCertification({ ...ok, action: 'not_needed' }).ok, true)
})

test('validateDriverReview needs a certified DVIR waiting for review', () => {
  const ok = { status: 'needs_review', reviewName: 'Next Driver', signature: SIGNATURE }

  assert.deepEqual(rules.validateDriverReview(ok), { ok: true })
  assert.equal(rules.validateDriverReview({ ...ok, status: 'open' }).ok, false, 'no review before the mechanic signs')
  assert.equal(rules.validateDriverReview({ ...ok, status: 'closed' }).ok, false)
  assert.equal(rules.validateDriverReview({ ...ok, reviewName: '' }).ok, false)
  assert.equal(rules.validateDriverReview({ ...ok, signature: null }).ok, false)
})

test('parseIsoDate accepts real calendar dates only', () => {
  assert.equal(rules.parseIsoDate('2026-11-17'), '2026-11-17')
  assert.equal(rules.parseIsoDate(' 2026-02-28 '), '2026-02-28')
  assert.equal(rules.parseIsoDate('2026-02-30'), null)
  assert.equal(rules.parseIsoDate('17/11/2026'), null)
  assert.equal(rules.parseIsoDate(undefined), null)
})
