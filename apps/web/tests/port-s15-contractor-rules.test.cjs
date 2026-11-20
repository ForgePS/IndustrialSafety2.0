/**
 * Port slice 15: unit tests for src/lib/forgeContractorRules.ts (settings, forms, expiry, company and worker
 * standing, sign-in decisions).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s15-contractor-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeContractorRules.ts'))

const TODAY = '2026-11-19'
const SETTINGS = rules.DEFAULT_SETTINGS
const L1 = '00000000-0000-4000-8000-000000000001'

test('dates: addDays, addMonths clamps the day, expiryState', () => {
  assert.equal(rules.addDays('2026-11-19', 30), '2026-12-19')
  assert.equal(rules.addMonths('2026-01-31', 1), '2026-02-28')
  assert.equal(rules.addMonths('2025-11-19', 12), '2026-11-19')
  assert.equal(rules.expiryState(null, TODAY, 30), 'current')
  assert.equal(rules.expiryState('2026-11-18', TODAY, 30), 'expired')
  assert.equal(rules.expiryState('2026-11-19', TODAY, 30), 'expiring', 'expires today: still good today')
  assert.equal(rules.expiryState('2026-12-19', TODAY, 30), 'expiring')
  assert.equal(rules.expiryState('2026-12-20', TODAY, 30), 'current')
})

test('cleanSettings', () => {
  assert.match(rules.cleanSettings({ requiredDocuments: ['nope'], orientationValidMonths: 12, warningDays: 30 }).error, /document types/)
  assert.match(rules.cleanSettings({ requiredDocuments: [], orientationValidMonths: 0, warningDays: 30 }).error, /1 to 60/)
  assert.match(rules.cleanSettings({ requiredDocuments: [], orientationValidMonths: 12, warningDays: 365 }).error, /180/)
  assert.deepEqual(rules.cleanSettings({ requiredDocuments: ['w9', 'w9'], orientationValidMonths: '24', warningDays: '45' }), { requiredDocuments: ['w9'], orientationValidMonths: 24, warningDays: 45 })
})

test('cleanCompanyInput', () => {
  assert.match(rules.cleanCompanyInput({ name: ' ' }).error, /company name/)
  assert.match(rules.cleanCompanyInput({ name: 'A', contactEmail: 'nope' }).error, /email/)
  assert.match(rules.cleanCompanyInput({ name: 'A', contactPhone: 'call me' }).error, /phone/)
  assert.match(rules.cleanCompanyInput({ name: 'A', emr: '12' }).error, /EMR/)
  assert.match(rules.cleanCompanyInput({ name: 'A', locationIds: ['x'] }).error, /locations/)

  const company = rules.cleanCompanyInput({ name: '  Delta   Electric ', contactEmail: ' Ops@Delta.EXAMPLE ', emr: '0.857', locationIds: [L1, L1] })

  assert.equal(company.name, 'Delta Electric')
  assert.equal(company.contactEmail, 'ops@delta.example')
  assert.equal(company.emr, 0.86)
  assert.deepEqual(company.locationIds, [L1])
  assert.equal(company.trir, null)
})

test('cleanDocumentInput: insurance needs an expiry; coverage only on insurance', () => {
  assert.match(rules.cleanDocumentInput({ docType: 'bogus' }).error, /type/)
  assert.match(rules.cleanDocumentInput({ docType: 'general_liability' }).error, /expiration/)
  assert.match(rules.cleanDocumentInput({ docType: 'other' }).error, /title/)
  assert.match(rules.cleanDocumentInput({ docType: 'w9', effectiveOn: '2026-05-01', expiresOn: '2026-04-01' }).error, /before/)
  assert.match(rules.cleanDocumentInput({ docType: 'workers_comp', expiresOn: '2027-01-01', coverageAmount: 'lots' }).error, /coverage/)

  assert.deepEqual(rules.cleanDocumentInput({ docType: 'general_liability', expiresOn: '2027-01-01', coverageAmount: '$1,000,000' }), {
    docType: 'general_liability',
    title: null,
    coverageAmount: 1000000,
    effectiveOn: null,
    expiresOn: '2027-01-01'
  })
  assert.equal(rules.cleanDocumentInput({ docType: 'w9', coverageAmount: '5' }).coverageAmount, null)
})

test('cleanWorkerInput and cleanQualificationInput', () => {
  assert.match(rules.cleanWorkerInput({ firstName: 'A' }, TODAY).error, /first and last/)
  assert.match(rules.cleanWorkerInput({ firstName: 'A', lastName: 'B', orientationCompletedOn: '2026-12-01' }, TODAY).error, /future/)

  const worker = rules.cleanWorkerInput({ firstName: ' Sam ', lastName: 'Ortiz', badgeNumber: 'c-104', orientationCompletedOn: '2026-02-01' }, TODAY)

  assert.equal(worker.badgeNumber, 'C-104')
  assert.equal(worker.active, true)
  assert.match(rules.cleanQualificationInput({ name: '' }).error, /OSHA 10/)
  assert.match(rules.cleanQualificationInput({ name: 'OSHA 10', issuedOn: '2026-05-01', expiresOn: '2026-01-01' }).error, /before/)
  assert.equal(rules.cleanQualificationInput({ name: 'Forklift', expiresOn: '2027-01-01', required: true }).required, true)
})

test('companyStanding: approval and required documents', () => {
  const docs = [
    { id: 'a', doc_type: 'general_liability', expires_on: '2026-10-01' },
    { id: 'b', doc_type: 'general_liability', expires_on: '2027-06-01' },
    { id: 'c', doc_type: 'workers_comp', expires_on: '2026-12-01' },
    { id: 'd', doc_type: 'auto_liability', expires_on: '2026-11-01' },
    { id: 'e', doc_type: 'workers_comp', expires_on: '2030-01-01', archived_at: '2026-01-01' }
  ]

  const approved = rules.companyStanding({ status: 'approved', documents: docs, settings: SETTINGS, today: TODAY })

  assert.equal(approved.cleared, true, 'the newer general liability certificate counts')
  assert.deepEqual(approved.warnings.map(w => w.code), ['expiring_workers_comp', 'expired_auto_liability'])

  const pending = rules.companyStanding({ status: 'pending', documents: [], settings: SETTINGS, today: TODAY })

  assert.equal(pending.cleared, false)
  assert.deepEqual(pending.problems.map(p => p.code), ['status_pending', 'missing_general_liability', 'missing_workers_comp'])

  const lapsed = rules.companyStanding({ status: 'approved', documents: [{ id: 'x', doc_type: 'general_liability', expires_on: '2026-11-01' }, { id: 'y', doc_type: 'workers_comp', expires_on: null }], settings: SETTINGS, today: TODAY })

  assert.deepEqual(lapsed.problems.map(p => p.code), ['expired_general_liability'])

  // A renewal that hasn't started yet doesn't cover today: the expired policy still decides.
  const renewal = rules.companyStanding({
    status: 'approved',
    documents: [
      { id: 'old', doc_type: 'general_liability', effective_on: '2025-11-01', expires_on: '2026-11-01' },
      { id: 'new', doc_type: 'general_liability', effective_on: '2026-12-01', expires_on: '2027-12-01' },
      { id: 'wc', doc_type: 'workers_comp', effective_on: '2026-12-01', expires_on: '2027-12-01' }
    ],
    settings: SETTINGS,
    today: TODAY
  })

  assert.equal(renewal.cleared, false)
  assert.deepEqual(renewal.problems.map(p => p.code), ['expired_general_liability', 'not_effective_workers_comp'])
  assert.equal(renewal.problems[1].message, "Workers' comp insurance not in effect until 2026-12-01")
  assert.equal(
    rules.companyStanding({ status: 'approved', documents: [{ id: 'a', doc_type: 'general_liability', effective_on: TODAY, expires_on: '2027-12-01' }, { id: 'b', doc_type: 'workers_comp', expires_on: '2027-12-01' }], settings: SETTINGS, today: TODAY }).cleared,
    true,
    'in effect from today counts'
  )
  assert.equal(rules.companyStanding({ status: 'suspended', documents: [], settings: { ...SETTINGS, requiredDocuments: [] }, today: TODAY }).problems[0].message, 'Company is suspended')
})

test('workerStanding: orientation, required qualifications, company problems', () => {
  const company = rules.companyStanding({ status: 'approved', documents: [], settings: { ...SETTINGS, requiredDocuments: [] }, today: TODAY })
  const base = { active: true, orientationCompletedOn: '2026-06-01', qualifications: [], company, settings: SETTINGS, today: TODAY }

  const ok = rules.workerStanding(base)

  assert.equal(ok.cleared, true)
  assert.equal(ok.orientationExpiresOn, '2027-06-01')
  assert.deepEqual(rules.workerStanding({ ...base, orientationCompletedOn: null }).problems.map(p => p.code), ['orientation_missing'])
  assert.deepEqual(rules.workerStanding({ ...base, orientationCompletedOn: '2025-11-01' }).problems.map(p => p.code), ['orientation_expired'])
  assert.deepEqual(rules.workerStanding({ ...base, orientationCompletedOn: '2025-12-01' }).warnings.map(p => p.code), ['orientation_expiring'])

  const quals = rules.workerStanding({
    ...base,
    qualifications: [
      { name: 'OSHA 10', expires_on: '2026-01-01', required: false },
      { name: 'Forklift', expires_on: '2026-01-01', required: true }
    ]
  })

  assert.deepEqual(quals.problems.map(p => p.message), ['Forklift expired 2026-01-01'])
  assert.deepEqual(quals.warnings.map(p => p.message), ['OSHA 10 expired 2026-01-01'])

  const blocked = rules.workerStanding({ ...base, active: false, company: rules.companyStanding({ status: 'pending', documents: [], settings: { ...SETTINGS, requiredDocuments: [] }, today: TODAY }) })

  assert.deepEqual(blocked.problems.map(p => p.code), ['inactive', 'company_status_pending'])
})

test('cleanSignIn and signInDecision', () => {
  assert.match(rules.cleanSignIn({ workerId: 'x', locationId: L1 }).error, /worker/)
  assert.equal(rules.cleanSignIn({ workerId: L1, locationId: L1, hostName: '  Pat  ' }).hostName, 'Pat')
  assert.equal(rules.companyAllowedAt([], L1), true)
  assert.equal(rules.companyAllowedAt(['other'], L1), false)

  const cleared = { cleared: true, problems: [], warnings: [] }
  const notCleared = { cleared: false, problems: [{ code: 'orientation_missing', message: 'Site orientation not done' }], warnings: [] }

  assert.deepEqual(rules.signInDecision({ standing: cleared, allowedHere: true, alreadyOnSite: false, canOverride: false, overrideReason: null }), { ok: true, overridden: false, problems: [] })
  assert.match(rules.signInDecision({ standing: cleared, allowedHere: true, alreadyOnSite: true, canOverride: true, overrideReason: 'x' }).error, /already signed in/)
  assert.match(rules.signInDecision({ standing: notCleared, allowedHere: true, alreadyOnSite: false, canOverride: false, overrideReason: 'please' }).error, /Site orientation not done/)
  assert.match(rules.signInDecision({ standing: cleared, allowedHere: false, alreadyOnSite: false, canOverride: true, overrideReason: null }).error, /reason/)

  const override = rules.signInDecision({ standing: notCleared, allowedHere: false, alreadyOnSite: false, canOverride: true, overrideReason: 'Emergency boiler repair' })

  assert.equal(override.ok, true)
  assert.equal(override.overridden, true)
  assert.deepEqual(override.problems.map(p => p.code), ['orientation_missing', 'location'])
})
