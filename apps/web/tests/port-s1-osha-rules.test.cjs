/**
 * Port slice 1: unit tests for the pure OSHA rules (src/lib/forgeOshaRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s1-osha-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeOshaRules.ts'))

const base = {
  recordability: 'recordable',
  is_privacy_case: false,
  case_outcome: 'days_away',
  case_type: 'injury',
  days_away: 3,
  restricted_days: 0,
  date_of_death: null,
  not_recordable_reason: null
}

test('a complete recordable days-away case is valid', () => {
  assert.equal(rules.validateOshaClassification(base), null)
})

test('recordable cases need an outcome and a case type', () => {
  assert.match(rules.validateOshaClassification({ ...base, case_outcome: null }), /case outcome/)
  assert.match(rules.validateOshaClassification({ ...base, case_type: null }), /column M/)
})

test('days away and restricted days are capped at 180 together', () => {
  assert.equal(rules.validateOshaClassification({ ...base, days_away: 120, restricted_days: 60 }), null)
  assert.match(rules.validateOshaClassification({ ...base, days_away: 120, restricted_days: 61 }), /180/)
})

test('day counts must be non-negative whole numbers', () => {
  assert.match(rules.validateOshaClassification({ ...base, days_away: -1 }), /whole number/)
  assert.match(rules.validateOshaClassification({ ...base, days_away: 1.5 }), /whole number/)
})

test('outcomes must match their day counts', () => {
  assert.match(rules.validateOshaClassification({ ...base, days_away: 0 }), /at least one day away/)
  assert.match(
    rules.validateOshaClassification({ ...base, case_outcome: 'job_transfer_restriction', days_away: 0, restricted_days: 0 }),
    /restricted day/
  )
})

test('privacy cases must be recordable', () => {
  assert.equal(rules.validateOshaClassification({ ...base, is_privacy_case: true }), null)
  assert.match(
    rules.validateOshaClassification({ ...base, recordability: 'pending', case_outcome: null, is_privacy_case: true }),
    /privacy/
  )
})

test('not-recordable decisions need a reason and no outcome', () => {
  const notRecordable = { ...base, recordability: 'not_recordable', case_outcome: null, days_away: 0 }
  assert.match(rules.validateOshaClassification(notRecordable), /Explain why/)
  assert.equal(rules.validateOshaClassification({ ...notRecordable, not_recordable_reason: 'First aid only (1904.7(b)(5)).' }), null)
  assert.match(rules.validateOshaClassification({ ...notRecordable, case_outcome: 'other_recordable', not_recordable_reason: 'x' }), /Clear the case outcome/)
})

test('date of death only applies to death cases', () => {
  assert.match(rules.validateOshaClassification({ ...base, date_of_death: '2026-01-02' }), /death cases/)
  assert.equal(rules.validateOshaClassification({ ...base, case_outcome: 'death', days_away: 0, date_of_death: '2026-01-02' }), null)
})

test('TRIR and DART use a 200,000-hour base, rounded to two decimals', () => {
  assert.deepEqual(rules.oshaRates({ recordableCases: 3, daysAwayCases: 1, transferCases: 1, hoursWorked: 412000 }), { trir: 1.46, dart: 0.97 })
  assert.deepEqual(rules.oshaRates({ recordableCases: 1, daysAwayCases: 1, transferCases: 0, hoursWorked: 200000 }), { trir: 1, dart: 1 })
})

test('rates are not computed without hours', () => {
  assert.deepEqual(rules.oshaRates({ recordableCases: 2, daysAwayCases: 1, transferCases: 0, hoursWorked: null }), { trir: null, dart: null })
  assert.equal(rules.oshaRate(2, 0), null)
})

test('the Form 300 log masks privacy-case names', () => {
  assert.equal(rules.form300EmployeeName({ employee_name: 'Pat Example', is_privacy_case: true }), 'Privacy Case')
  assert.equal(rules.form300EmployeeName({ employee_name: 'Pat Example', is_privacy_case: false }), 'Pat Example')
})

test('injury dates use the establishment time zone, not UTC', () => {
  // 04:30 UTC on March 3 is 10:30 PM on March 2 in Chicago (CST).
  assert.deepEqual(rules.zonedDateTimeParts('2026-03-03T04:30:00Z', 'America/Chicago'), { date: '2026-03-02', time: '22:30' })
  assert.deepEqual(rules.zonedDateTimeParts('2026-07-01T17:05:00Z', 'America/Chicago'), { date: '2026-07-01', time: '12:05' })
})

test('fillBlanks never overwrites entered values', () => {
  const existing = { job_title: 'Operator', employee_city: '', employee_state: null, what_happened: '  ' }
  const seed = { job_title: 'Other', employee_city: 'Testville', employee_state: 'AR', what_happened: 'Slipped', physician_name: '' }
  assert.deepEqual(rules.fillBlanks(existing, seed), { employee_city: 'Testville', employee_state: 'AR', what_happened: 'Slipped' })
})
