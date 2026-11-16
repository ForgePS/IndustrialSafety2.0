/**
 * Batch 1 parity: unit tests for the Form 300 "Fix before printing" checks (form300PrintIssues in src/lib/forgeOshaRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-b1-osha-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeOshaRules.ts'))

const base = {
  id: 'c1',
  case_number: '2026-001',
  location_id: 'loc-a',
  employee_name: 'Pat Example',
  job_title: 'Mill Operator',
  injury_date: '2026-03-02',
  event_location: 'Packing line 2',
  injury_description: 'Laceration to left hand',
  recordability: 'recordable',
  is_privacy_case: false,
  case_outcome: 'days_away',
  case_type: 'injury',
  days_away: 3,
  restricted_days: 0,
  date_of_death: null,
  status: 'open'
}

test('a complete recordable case has no print issues', () => {
  assert.deepEqual(rules.oshaCasePrintIssues(base), [])
  assert.deepEqual(rules.form300PrintIssues([base]), [])
})

test('blank Form 300 columns B, C, D, E and F are flagged', () => {
  const issues = rules.oshaCasePrintIssues({
    ...base,
    employee_name: ' ',
    job_title: null,
    injury_date: null,
    event_location: '',
    injury_description: null
  })

  assert.ok(issues.some(item => /employee name \(column B\)/.test(item)))
  assert.ok(issues.some(item => /job title \(column C\)/.test(item)))
  assert.ok(issues.some(item => /column D/.test(item)))
  assert.ok(issues.some(item => /where the event occurred \(column E\)/.test(item)))
  assert.ok(issues.some(item => /description .*\(column F\)/.test(item)))
})

test('privacy cases are not flagged for a blank name and their label is masked', () => {
  const row = { ...base, is_privacy_case: true, employee_name: '', job_title: '' }
  const [issue] = rules.form300PrintIssues([row])

  assert.ok(!issue.issues.some(item => /column B/.test(item)))
  assert.match(issue.label, /Privacy Case/)
  assert.doesNotMatch(issue.label, /Pat Example/)
})

test('missing outcome or type is flagged', () => {
  const issues = rules.oshaCasePrintIssues({ ...base, case_outcome: null, case_type: null })

  assert.ok(issues.some(item => /columns G-J/.test(item)))
  assert.ok(issues.some(item => /column M/.test(item)))
})

test('day counts must match the outcome', () => {
  assert.ok(rules.oshaCasePrintIssues({ ...base, days_away: 0 }).some(item => /column K has no days/.test(item)))

  const transfer = { ...base, case_outcome: 'job_transfer_restriction', days_away: 0, restricted_days: 0 }

  assert.ok(rules.oshaCasePrintIssues(transfer).some(item => /column L has no days/.test(item)))
  assert.ok(
    rules.oshaCasePrintIssues({ ...transfer, days_away: 2, restricted_days: 4 }).some(item => /most serious outcome is days away/.test(item))
  )
  assert.ok(
    rules.oshaCasePrintIssues({ ...base, case_outcome: 'other_recordable', days_away: 0, restricted_days: 2 }).some(item => /not other recordable/.test(item))
  )
  assert.ok(rules.oshaCasePrintIssues({ ...base, days_away: 150, restricted_days: 40 }).some(item => /capped at 180/.test(item)))
  assert.ok(rules.oshaCasePrintIssues({ ...base, days_away: -1 }).some(item => /negative/.test(item)))
})

test('death outcome needs a date of death, and a date of death needs a death outcome', () => {
  assert.ok(rules.oshaCasePrintIssues({ ...base, case_outcome: 'death', days_away: 0 }).some(item => /no date of death/.test(item)))
  assert.ok(rules.oshaCasePrintIssues({ ...base, date_of_death: '2026-03-05' }).some(item => /outcome is not death/.test(item)))
  assert.deepEqual(rules.oshaCasePrintIssues({ ...base, case_outcome: 'death', days_away: 0, date_of_death: '2026-03-05' }), [])
})

test('only recordable, non-voided cases are checked', () => {
  const bad = { ...base, job_title: null }

  assert.equal(rules.form300PrintIssues([{ ...bad, recordability: 'pending' }]).length, 0)
  assert.equal(rules.form300PrintIssues([{ ...bad, recordability: 'not_recordable' }]).length, 0)
  assert.equal(rules.form300PrintIssues([{ ...bad, status: 'voided' }]).length, 0)
  assert.equal(rules.form300PrintIssues([{ ...bad, status: 'closed' }]).length, 1)
})

test('duplicate case numbers are flagged per establishment only', () => {
  const second = { ...base, id: 'c2' }
  const issues = rules.form300PrintIssues([base, second])

  assert.equal(issues.length, 2)
  assert.match(issues[0].issues[0], /used more than once/)

  // Case numbers restart at each establishment, so the same number at two Locations is fine.
  assert.deepEqual(rules.form300PrintIssues([base, { ...second, location_id: 'loc-b' }]), [])
})

test('issues carry the case id and a label for linking', () => {
  const [issue] = rules.form300PrintIssues([{ ...base, event_location: null }])

  assert.equal(issue.caseId, 'c1')
  assert.equal(issue.label, 'Case 2026-001 - Pat Example')
})
