/**
 * Port slice 8 (piece A): unit tests for the inspection finding → CAPA rules (src/lib/forgeInspectionCapaRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s8-inspection-capa.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeInspectionCapaRules.ts'))

test('finding severity maps onto the CAPA scale, unknown keys fall back to moderate', () => {
  assert.equal(rules.capaSeverityForFinding('low'), 'low')
  assert.equal(rules.capaSeverityForFinding('moderate'), 'moderate')
  assert.equal(rules.capaSeverityForFinding('high'), 'high')
  assert.equal(rules.capaSeverityForFinding('critical'), 'critical')
  assert.equal(rules.capaSeverityForFinding('Medium'), 'moderate')
  assert.equal(rules.capaSeverityForFinding('minor'), 'low')
  assert.equal(rules.capaSeverityForFinding('major'), 'high')
  assert.equal(rules.capaSeverityForFinding(' severe '), 'critical')
  assert.equal(rules.capaSeverityForFinding('tenant_custom'), 'moderate')
  assert.equal(rules.capaSeverityForFinding(null), 'moderate')
})

test('only open findings need a CAPA', () => {
  for (const status of ['open', 'in_progress', 'pending_verification', null]) assert.equal(rules.findingNeedsCapa({ status }), true, String(status))
  for (const status of ['closed', 'canceled']) assert.equal(rules.findingNeedsCapa({ status }), false, status)
})

test('due date: finding date at end of day, else the 90-day 1.0 window', () => {
  assert.equal(rules.capaDueAtForFinding('2026-12-01'), '2026-12-01T23:59:00.000Z')

  const now = new Date('2026-11-17T10:00:00.000Z')

  assert.equal(rules.DEFAULT_FINDING_CAPA_DUE_DAYS, 90)
  assert.equal(rules.capaDueAtForFinding(null, now), '2027-02-15T10:00:00.000Z')
  assert.equal(rules.capaDueAtForFinding('', now), '2027-02-15T10:00:00.000Z')
  assert.equal(rules.capaDueAtForFinding('not a date', now), '2027-02-15T10:00:00.000Z')
})

test('title, reference and description carry the finding and the inspection', () => {
  assert.equal(rules.findingCapaTitle('Guard missing'), 'Inspection finding: Guard missing')
  assert.equal(rules.findingCapaTitle('x'.repeat(400)).length, 200)
  assert.equal(rules.findingCapaReference('INS-0042', 'Guard missing'), 'INS-0042 / Guard missing')
  assert.equal(rules.findingCapaReference(null, 'Guard missing'), 'Guard missing')

  const description = rules.findingCapaDescription({ title: 'Guard missing', description: 'Belt guard removed', corrective_action: 'Refit guard' }, 'INS-0042')

  assert.match(description, /^Belt guard removed/)
  assert.match(description, /Proposed corrective action \(from the inspection\): Refit guard/)
  assert.match(description, /Raised on inspection INS-0042\./)
  assert.equal(rules.findingCapaDescription({ title: 'Guard missing' }), 'Guard missing')
  assert.equal(rules.INSPECTION_FINDING_CAPA_SOURCE, 'inspection_finding')
})
