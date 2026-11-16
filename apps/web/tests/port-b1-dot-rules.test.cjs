/**
 * Batch 1 DOT parity: unit tests for the new pure rules in src/lib/forgeDotRules.ts
 * (attention cards and filters, roster search / sort / license follow-ups, record due labels).
 * Run: node --experimental-strip-types --test apps/web/tests/port-b1-dot-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeDotRules.ts'))

const TODAY = '2026-11-16'

test('dotDueOverdueLabel: due, due today, overdue N days, closed and blank', () => {
  assert.deepEqual(rules.dotDueOverdueLabel({ status: 'open', due_on: '2026-12-01' }, TODAY), { text: 'Due 12/01/2026', overdue: false })
  assert.deepEqual(rules.dotDueOverdueLabel({ status: 'open', due_on: TODAY }, TODAY), { text: 'Due 11/16/2026', overdue: false })
  assert.deepEqual(rules.dotDueOverdueLabel({ status: 'open', due_on: '2026-11-13' }, TODAY), { text: 'Overdue 3d', overdue: true })
  assert.deepEqual(rules.dotDueOverdueLabel({ status: 'open', due_on: '2025-11-16' }, TODAY), { text: 'Overdue 365d', overdue: true })
  assert.equal(rules.dotDueOverdueLabel({ status: 'closed', due_on: '2026-11-01' }, TODAY), null, 'closed records are never overdue')
  assert.equal(rules.dotDueOverdueLabel({ status: 'open', due_on: null }, TODAY), null)
  assert.equal(rules.dotDueOverdueLabel({ status: 'open', due_on: 'not-a-date' }, TODAY), null)
})

test('isoDayDiff counts whole days across month and DST boundaries', () => {
  assert.equal(rules.isoDayDiff('2026-02-27', '2026-03-02'), 3)
  assert.equal(rules.isoDayDiff('2026-03-07', '2026-03-09'), 2)
  assert.equal(rules.isoDayDiff('2026-11-16', '2026-11-16'), 0)
})

test('attention cards count drivers per kind and link to the filtered lists', () => {
  const files = [
    { issues: [{ kind: 'expired' }, { kind: 'expired' }, { kind: 'missingDocuments' }] },
    { issues: [{ kind: 'expiring' }, { kind: 'missingLicenseCopy' }] },
    { issues: [] }
  ]
  const roster = [{ issues: [{ kind: 'pendingMvr' }, { kind: 'missingMvrConsent' }] }, { issues: [{ kind: 'missingMvrConsent' }] }]
  const cards = rules.buildDotAttentionCards(files, roster)
  const card = kind => cards.find(item => item.kind === kind)

  assert.deepEqual(cards.map(item => item.kind), [...rules.DOT_DQF_ATTENTION_KINDS, ...rules.DOT_ROSTER_ATTENTION_KINDS])
  assert.equal(card('expired').count, 1, 'two expired credentials on one driver count once')
  assert.equal(card('expiring').count, 1)
  assert.equal(card('missingDocuments').count, 1)
  assert.equal(card('missingLicenseExpiry').count, 0)
  assert.equal(card('expired').href, '/dot/drivers?attention=expired')
  assert.equal(card('missingMvrConsent').count, 2)
  assert.equal(card('missingMvrConsent').href, '/dot/company-drivers?attention=missingMvrConsent')
  assert.equal(card('pendingMvr').label, rules.DOT_ISSUE_LABELS.pendingMvr)
})

test('driverMatchesAttentionFilter: no filter matches all, otherwise the kind must be present', () => {
  const file = { issues: [{ kind: 'expiring' }] }
  assert.equal(rules.driverMatchesAttentionFilter(file, null), true)
  assert.equal(rules.driverMatchesAttentionFilter(file, 'expiring'), true)
  assert.equal(rules.driverMatchesAttentionFilter(file, 'expired'), false)
  assert.equal(rules.isDotIssueKind('expired'), true)
  assert.equal(rules.isDotIssueKind('toString'), false)
  assert.equal(rules.isDotIssueKind('nope'), false)
})

test('license follow-ups: expired, expiring within 30 days, no copy; removed drivers excluded', () => {
  const base = { status: 'on_insurance', license_expires_on: '2028-01-01' }
  assert.deepEqual(rules.licenseFollowUps(base, 1, TODAY), [])
  assert.deepEqual(rules.licenseFollowUps(base, 0, TODAY), ['noCopy'])
  assert.deepEqual(rules.licenseFollowUps({ ...base, license_expires_on: '2026-11-15' }, 1, TODAY), ['expired'])
  assert.deepEqual(rules.licenseFollowUps({ ...base, license_expires_on: '2026-12-16' }, 1, TODAY), ['expiring'])
  assert.deepEqual(rules.licenseFollowUps({ ...base, license_expires_on: '2026-12-17' }, 1, TODAY), [])
  assert.deepEqual(rules.licenseFollowUps({ ...base, license_expires_on: '2026-11-01' }, 0, TODAY), ['expired', 'noCopy'])
  assert.deepEqual(rules.licenseFollowUps({ ...base, license_expires_on: null }, 1, TODAY), [], 'a missing expiry is its own issue')
  assert.deepEqual(rules.licenseFollowUps({ status: 'removed', license_expires_on: '2020-01-01' }, 0, TODAY), [])
})

test('roster search matches name, employee # and license #, every word', () => {
  const driver = { driver_name: 'Dana Smith', employee_number: 'E-204', license_number: 'D1234567' }
  assert.equal(rules.companyDriverMatchesQuery(driver, ''), true)
  assert.equal(rules.companyDriverMatchesQuery(driver, 'smith'), true)
  assert.equal(rules.companyDriverMatchesQuery(driver, 'e-204'), true)
  assert.equal(rules.companyDriverMatchesQuery(driver, 'd1234'), true)
  assert.equal(rules.companyDriverMatchesQuery(driver, 'dana d1234'), true)
  assert.equal(rules.companyDriverMatchesQuery(driver, 'dana jones'), false)
  assert.equal(rules.companyDriverMatchesQuery({ driver_name: 'X', employee_number: null, license_number: null }, 'null'), false)
})

test('roster sort: name by last name, status rank, dates with blanks last, ties by name', () => {
  const row = (name, driver) => ({ name, driver: { status: 'on_insurance', next_mvr_due_on: null, mvr_consent_on: null, ...driver } })
  const rows = [
    row('Zed Adams', { status: 'suspended', next_mvr_due_on: '2027-03-01', mvr_consent_on: '2026-01-01' }),
    row('Amy Young', { status: 'pending_mvr', next_mvr_due_on: null }),
    row('Bob Brown', { status: 'on_insurance', next_mvr_due_on: '2027-01-01', mvr_consent_on: '2025-06-01' })
  ]
  const names = list => list.map(item => item.name)

  assert.deepEqual(names(rules.sortCompanyDrivers(rows, 'name')), ['Zed Adams', 'Bob Brown', 'Amy Young'])
  assert.deepEqual(names(rules.sortCompanyDrivers(rows, 'name', 'desc')), ['Amy Young', 'Bob Brown', 'Zed Adams'])
  assert.deepEqual(names(rules.sortCompanyDrivers(rows, 'status')), ['Bob Brown', 'Amy Young', 'Zed Adams'])
  assert.deepEqual(names(rules.sortCompanyDrivers(rows, 'next_mvr')), ['Bob Brown', 'Zed Adams', 'Amy Young'])
  assert.deepEqual(names(rules.sortCompanyDrivers(rows, 'next_mvr', 'desc')), ['Zed Adams', 'Bob Brown', 'Amy Young'], 'blanks stay last')
  assert.deepEqual(names(rules.sortCompanyDrivers(rows, 'consent')), ['Bob Brown', 'Zed Adams', 'Amy Young'])
  assert.notEqual(rules.sortCompanyDrivers(rows, 'name'), rows, 'returns a new array')
})

test('summarizeDotRecords counts by category and open', () => {
  const summary = rules.summarizeDotRecords(
    [
      { category: 'accident', status: 'open' },
      { category: 'accident', status: 'closed' },
      { category: 'company', status: 'open' }
    ],
    ['roadside_inspection', 'accident', 'drug_alcohol', 'company', 'other']
  )
  assert.equal(summary.total, 3)
  assert.equal(summary.open, 2)
  assert.deepEqual(summary.byCategory, { roadside_inspection: 0, accident: 2, drug_alcohol: 0, company: 1, other: 0 })
})
