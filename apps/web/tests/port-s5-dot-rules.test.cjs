/**
 * Port slice 5: unit tests for DOT Compliance rules (src/lib/forgeDotRules.ts).
 * Run: node --experimental-strip-types --test apps/web/tests/port-s5-dot-rules.test.cjs
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const rules = require(path.join(__dirname, '../src/lib/forgeDotRules.ts'))

const TODAY = '2026-11-15'
const person = { employment_type: 'full_time', employment_status: 'active', archived_at: null }
const blankFile = {
  license_class: 'cdl',
  license_number: 'D123',
  license_expires_on: null,
  driver_restrictions: null,
  medical_certificate_expires_on: null,
  national_registry_number: null,
  registry_verified: false,
  diabetic_eye_exam_expires_on: null,
  mvr_expires_on: null,
  archived_at: null
}
const worksheet = (overrides = {}) =>
  rules.dqfWorksheet({
    file: { ...blankFile, ...(overrides.file || {}) },
    person: { ...person, ...(overrides.person || {}) },
    documents: overrides.documents || [],
    fileCounts: overrides.fileCounts || {},
    hiddenDocuments: overrides.hiddenDocuments || rules.DOT_DEFAULT_HIDDEN_DOCUMENTS,
    todayIso: TODAY
  })
const item = (items, key) => items.find(entry => entry.key === key)

test('the document catalog matches 1.0: 24 keys, three hidden by default, three optional', () => {
  assert.equal(rules.DOT_DOCUMENT_KEYS.length, 24)
  assert.equal(new Set(rules.DOT_DOCUMENT_KEYS).size, 24)
  assert.deepEqual([...rules.DOT_DEFAULT_HIDDEN_DOCUMENTS].sort(), ['cdl_affidavit_ar', 'cdl_affidavit_ms', 'employment_eligibility_i9'])
  assert.deepEqual(
    rules.DOT_DOCUMENTS.filter(doc => doc.optional).map(doc => doc.key).sort(),
    ['dqf_review', 'reasonable_suspicion', 'refusal_to_test']
  )
})

test('date helpers: add days, add years with 29 February, US format', () => {
  assert.equal(rules.addDaysIso('2026-12-20', 30), '2027-01-19')
  assert.equal(rules.addYearsIso('2028-02-29', 1), '2029-02-28')
  assert.equal(rules.nextMvrDue('2026-11-15'), '2027-11-15')
  assert.equal(rules.formatUsDate('2026-03-04'), '03/04/2026')
  assert.equal(rules.formatUsDate(null), '')
})

test('expiry state uses a 30-day warning window', () => {
  assert.equal(rules.expiryState(null, TODAY), 'none')
  assert.equal(rules.expiryState('2026-11-14', TODAY), 'expired')
  assert.equal(rules.expiryState('2026-11-15', TODAY), 'expiring')
  assert.equal(rules.expiryState('2026-12-15', TODAY), 'expiring')
  assert.equal(rules.expiryState('2026-12-16', TODAY), 'ok')
})

test('applicability: seasonal skips the MEC, non-CDL skips the CDL number, diabetic restrictions need the eye exam', () => {
  assert.equal(rules.medicalCertificateRequired({ employment_type: 'seasonal' }), false)
  assert.equal(rules.medicalCertificateRequired({ employment_type: 'full_time' }), true)
  assert.equal(rules.cdlNumberRequired({ license_class: 'non_cdl' }), false)
  assert.equal(rules.cdlNumberRequired({ license_class: 'cdl' }), true)
  assert.equal(rules.diabeticEyeExamRequired({ driver_restrictions: 'Insulin-treated DIABETES waiver' }), true)
  assert.equal(rules.diabeticEyeExamRequired({ driver_restrictions: 'Corrective lenses' }), false)
})

test('the license needs both an expiration and a copy', () => {
  assert.equal(item(worksheet({ file: { license_expires_on: '2028-01-01' } }), 'license').status, 'missing')
  assert.equal(item(worksheet({ fileCounts: { license: 1 } }), 'license').status, 'missing')
  assert.equal(item(worksheet({ file: { license_expires_on: '2028-01-01' }, fileCounts: { license: 1 } }), 'license').status, 'on_file')
  assert.equal(item(worksheet({ file: { license_expires_on: '2026-01-01' }, fileCounts: { license: 1 } }), 'license').status, 'expired')
})

test('an MVR copy without a date says the expiration is not set', () => {
  const mvr = item(worksheet({ fileCounts: { mvr: 1 } }), 'mvr')
  assert.equal(mvr.status, 'missing')
  assert.equal(mvr.text, 'Expiration not set')
})

test('a seasonal driver shows the MEC as N/A; the diabetic exam is optional unless restricted', () => {
  assert.equal(item(worksheet({ person: { employment_type: 'seasonal' } }), 'medical_certificate').text, 'N/A (seasonal)')
  assert.equal(item(worksheet(), 'diabetic_eye_exam').status, 'optional')
  assert.equal(item(worksheet({ file: { driver_restrictions: 'diabetic' } }), 'diabetic_eye_exam').status, 'missing')
})

test('documents count as on file by date, by yes, by upload, and by the registry or review shortcuts', () => {
  const items = worksheet({
    documents: [
      { document_type: 'application', placed_on: '2026-01-02' },
      { document_type: 'mvr_consent', placed_on: null, on_file: 'yes' },
      { document_type: 'dqf_review', placed_on: null, text_values: { notes: 'Reviewed, fine' } }
    ],
    fileCounts: { road_test: 1 },
    file: { registry_verified: true }
  })
  assert.equal(item(items, 'application').text, 'Placed 01/02/2026')
  assert.equal(item(items, 'mvr_consent').status, 'on_file')
  assert.equal(item(items, 'road_test').status, 'on_file')
  assert.equal(item(items, 'registry_verification').status, 'on_file')
  assert.equal(item(items, 'dqf_review').status, 'on_file')
  assert.equal(item(items, 'refusal_to_test').status, 'optional')
  assert.equal(item(items, 'employment_eligibility_i9').status, 'na')
  assert.equal(item(items, 'previous_employer_request').status, 'missing')
})

test('hidden documents can be turned back on per organization', () => {
  assert.equal(item(worksheet({ hiddenDocuments: [] }), 'employment_eligibility_i9').status, 'missing')
})

test('issues: the license is reported once, not again as a missing document', () => {
  const issues = rules.dqfIssues({
    file: blankFile, person, documents: [], fileCounts: {}, hiddenDocuments: rules.DOT_DEFAULT_HIDDEN_DOCUMENTS, todayIso: TODAY
  })
  const kinds = issues.map(issue => issue.kind)
  assert.ok(kinds.includes('missingLicenseExpiry'))
  assert.ok(kinds.includes('missingLicenseCopy'))
  assert.equal(issues.filter(issue => issue.kind === 'missingDocuments' && issue.slot === 'license').length, 0)
  // Sorted most urgent first: missing documents come last.
  assert.equal(kinds[kinds.length - 1], 'missingDocuments')
})

test('issues: expired comes first; an archived file or terminated driver has none', () => {
  const input = {
    file: { ...blankFile, medical_certificate_expires_on: '2026-01-01' }, person, documents: [], fileCounts: {}, hiddenDocuments: [], todayIso: TODAY
  }
  assert.equal(rules.dqfIssues(input)[0].kind, 'expired')
  assert.deepEqual(rules.dqfIssues({ ...input, file: { ...input.file, archived_at: '2026-11-01T00:00:00Z' } }), [])
  assert.deepEqual(rules.dqfIssues({ ...input, person: { ...person, employment_status: 'terminated' } }), [])
})

test('company drivers: consent by date or upload, pending MVR, sample due, removed drivers ignored', () => {
  const driver = {
    status: 'pending_mvr', license_expires_on: '2030-01-01', mvr_consent_on: null, last_mvr_on: null, initial_mvr_on: null, sample_year: 2026, sample_completed_at: null
  }
  const kinds = rules.companyDriverIssues(driver, { consentUploads: 0, todayIso: TODAY, year: 2026 }).map(issue => issue.kind)
  assert.deepEqual(kinds, ['pendingMvr', 'missingMvrConsent', 'sampleDue'])
  assert.equal(rules.mvrConsentOnFile(driver, 1), true)
  assert.equal(rules.mvrConsentOnFile({ mvr_consent_on: '2026-01-01' }, 0), true)
  assert.deepEqual(rules.companyDriverIssues({ ...driver, status: 'removed' }, { consentUploads: 0, todayIso: TODAY, year: 2026 }), [])
  const done = rules.companyDriverIssues({ ...driver, status: 'on_insurance', mvr_consent_on: '2026-01-01', sample_completed_at: '2026-11-01' }, { consentUploads: 0, todayIso: TODAY, year: 2026 })
  assert.deepEqual(done, [])
})

test('annual MVR sample: 10% rounded up, at least one, none when nobody is eligible', () => {
  assert.equal(rules.mvrSampleSize(0), 0)
  assert.equal(rules.mvrSampleSize(1), 1)
  assert.equal(rules.mvrSampleSize(10), 1)
  assert.equal(rules.mvrSampleSize(11), 2)
  assert.equal(rules.mvrSampleSize(40, 25), 10)
  assert.equal(rules.mvrSampleEligible({ status: 'on_insurance' }), true)
  assert.equal(rules.mvrSampleEligible({ status: 'suspended' }), false)
})

test('report severity: expired is critical, expiring is a warning, missing alone does not raise it', () => {
  const row = (file, counts = {}) =>
    rules.buildReportRow({ name: 'A', employeeNumber: '1', location: 'X' }, worksheet({ file, fileCounts: counts }), rules.DOT_DEFAULT_HIDDEN_DOCUMENTS)
  assert.equal(row({}).severity, 'ok')
  assert.equal(row({ license_expires_on: '2026-12-01' }, { license: 1 }).severity, 'warning')
  assert.equal(row({ license_expires_on: '2026-01-01' }, { license: 1 }).severity, 'critical')
  const totals = rules.reportTotals([row({}), row({ license_expires_on: '2026-01-01' }, { license: 1 })])
  assert.equal(totals.drivers, 2)
  assert.equal(totals.critical, 1)
  assert.equal(totals.expired, 1)
  assert.match(rules.reportStatsLine(totals), /^2 drivers · 1 critical/)
})

test('report columns drop hidden documents', () => {
  const keys = rules.reportColumns(rules.DOT_DEFAULT_HIDDEN_DOCUMENTS).map(column => column.key)
  assert.equal(keys.length, 4 + 21)
  assert.ok(!keys.includes('employment_eligibility_i9'))
})

test('CSV neutralizes formulas, quotes commas and uses CRLF', () => {
  const row = rules.buildReportRow({ name: '=HYPERLINK("x")', employeeNumber: '1', location: 'Little Rock, AR' }, worksheet(), rules.DOT_DEFAULT_HIDDEN_DOCUMENTS)
  const csv = rules.reportCsv([row], rules.DOT_DEFAULT_HIDDEN_DOCUMENTS)
  const lines = csv.split('\r\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[2], '')
  assert.ok(lines[1].startsWith(`"'=HYPERLINK(""x"")",1,"Little Rock, AR",ok,`))
  assert.ok(lines[0].startsWith('Driver,Employee #,Location,Severity,'))
})

test('uploads: magic bytes must match the declared type', () => {
  const bytes = text => new Uint8Array([...text].map(char => char.charCodeAt(0)))
  assert.equal(rules.looksLikeDotFile(bytes('%PDF-1.7'), 'application/pdf'), true)
  assert.equal(rules.looksLikeDotFile(bytes('%PDF-1.7'), 'image/png'), false)
  assert.equal(rules.looksLikeDotFile(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), true)
  assert.equal(rules.looksLikeDotFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png'), true)
  assert.equal(rules.looksLikeDotFile(bytes('RIFF\0\0\0\0WEBP'), 'image/webp'), true)
  assert.equal(rules.looksLikeDotFile(bytes('\0\0\0\x18ftypheic'), 'image/heic'), true)
  assert.equal(rules.looksLikeDotFile(bytes('MZ'), 'application/x-msdownload'), false)
  assert.equal(rules.DOT_FILE_MAX_BYTES, 12 * 1024 * 1024)
})
