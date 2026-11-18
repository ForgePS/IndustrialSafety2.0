/**
 * Pure DOT Compliance rules: the driver qualification file (DQF) document list, credential
 * applicability, expiry states, the worksheet, attention issues, the compliance report and the
 * company-driver MVR roster. Shared by pages, server actions, the CSV export and tests.
 *
 * Ported from Industrial 1.0 (legacy/forge-platform/apps/industrial-web/src/lib/dot-dqf-*.ts,
 * company-vehicle-drivers.ts, company-driver-mvr-requirements.ts and platform-api mvr-sample.ts).
 * 1.0 kept every DQF field in one JSON payload; 2.0 stores credentials as columns and each
 * document as a row, so these rules work on plain objects.
 */

/** 1.0's "expiring soon" window. */
export const DOT_WARNING_DAYS = 30

export const DOT_FILE_MAX_BYTES = 12 * 1024 * 1024
export const DOT_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
export const DOT_FILES_PER_SLOT = 10

// ---------------------------------------------------------------------------
// Document catalog
// ---------------------------------------------------------------------------

export type DotDocumentDef = {
  key: string
  label: string
  group: 'hiring' | 'medical' | 'drug_alcohol' | 'ongoing'

  /** Shown but never counted as missing (1.0 OPTIONAL_DQF_DOCUMENT_KEYS). */
  optional?: boolean

  /** Hidden for a new organization until turned on in DOT settings (1.0 disabled these for everyone). */
  defaultHidden?: boolean

  /** Extra text fields kept with the document. */
  textFields?: Array<{ key: string; label: string }>
  cite?: string
}

/** In 1.0's worksheet order. The "date" of a document is the date it was placed in the file. */
export const DOT_DOCUMENTS: DotDocumentDef[] = [
  { key: 'application', label: "Driver's Application for Employment", group: 'hiring', cite: '49 CFR 391.21' },
  { key: 'employment_eligibility_i9', label: 'Employment Eligibility (I-9)', group: 'hiring', defaultHidden: true },
  { key: 'previous_employer_request', label: 'Previous Employer Record Request', group: 'hiring', cite: '49 CFR 391.23' },
  { key: 'previous_employer_safety', label: 'Previous Employer Safety Performance History', group: 'hiring', cite: '49 CFR 391.23' },
  {
    key: 'road_test',
    label: 'Certificate of Road Test',
    group: 'hiring',
    cite: '49 CFR 391.31',
    textFields: [
      { key: 'driver_signature', label: 'Driver signature (name)' },
      { key: 'examiner', label: 'Examiner (name)' }
    ]
  },
  { key: 'mvr_consent', label: 'MVR Consent / Acknowledgement', group: 'hiring' },
  { key: 'cdl_affidavit_ar', label: 'CDL Self-Certification Affidavit (Arkansas)', group: 'hiring', defaultHidden: true },
  { key: 'cdl_affidavit_ms', label: 'CDL Self-Certification Affidavit (Mississippi)', group: 'hiring', defaultHidden: true },
  { key: 'mer_form', label: 'Medical Examination Report (MER) Form', group: 'medical', cite: '49 CFR 391.43' },
  {
    key: 'registry_verification',
    label: "Medical Examiner's National Registry Verification",
    group: 'medical',
    cite: '49 CFR 391.51',
    textFields: [{ key: 'examiner_registration_number', label: 'Examiner registration number' }]
  },
  { key: 'pre_employment_drug_consent', label: 'Pre-Employment Drug Screen Consent', group: 'drug_alcohol' },
  { key: 'pre_employment_drug_completed', label: 'Pre-Employment Drug Screen Completed', group: 'drug_alcohol' },
  { key: 'clearinghouse_consent', label: 'FMCSA Clearinghouse Query Consent', group: 'drug_alcohol', cite: '49 CFR 382.701' },
  { key: 'clearinghouse_completed', label: 'FMCSA Clearinghouse Query Completed', group: 'drug_alcohol', cite: '49 CFR 382.701' },
  { key: 'drug_alcohol_consent', label: 'Drug and Alcohol Test Consent', group: 'drug_alcohol' },
  { key: 'previous_da_statement', label: 'Previous Pre-Employment Drug & Alcohol Statement', group: 'drug_alcohol' },
  { key: 'da_records_request', label: 'Drug & Alcohol Records Request', group: 'drug_alcohol' },
  { key: 'da_certified_receipt', label: 'Drug & Alcohol Policy Certified Receipt', group: 'drug_alcohol' },
  { key: 'drug_alcohol_log', label: 'Drug & Alcohol Record Log', group: 'drug_alcohol' },
  { key: 'refusal_to_test', label: 'Documentation of Refusal to Test', group: 'drug_alcohol', optional: true },
  { key: 'reasonable_suspicion', label: 'Observed Behavior for Reasonable Suspicion', group: 'drug_alcohol', optional: true },
  { key: 'actual_knowledge', label: 'Documentation of Actual Knowledge of Violation', group: 'drug_alcohol' },
  { key: 'on_duty_hours', label: "Driver's Statement of On-Duty Hours", group: 'ongoing' },
  {
    key: 'dqf_review',
    label: 'Annual DQF Review',
    group: 'ongoing',
    optional: true,
    cite: '49 CFR 391.25',
    textFields: [
      { key: 'evaluator', label: 'Reviewed by' },
      { key: 'notes', label: 'Review notes' }
    ]
  }
]

export const DOT_DOCUMENT_KEYS = DOT_DOCUMENTS.map(item => item.key)
export const DOT_DEFAULT_HIDDEN_DOCUMENTS = DOT_DOCUMENTS.filter(item => item.defaultHidden).map(item => item.key)

export const DOT_DOCUMENT_GROUP_LABELS: Record<DotDocumentDef['group'], string> = {
  hiring: 'Hiring and qualification',
  medical: 'Medical',
  drug_alcohol: 'Drug and alcohol',
  ongoing: 'Ongoing'
}

/** Upload slots that are not documents: the credentials kept on the file itself. */
export const DOT_CREDENTIAL_SLOTS = ['license', 'medical_certificate', 'mvr', 'diabetic_eye_exam'] as const
export type DotCredentialSlot = (typeof DOT_CREDENTIAL_SLOTS)[number]

export const DOT_CREDENTIAL_LABELS: Record<DotCredentialSlot, string> = {
  license: "Driver's License",
  medical_certificate: 'Medical Examiner’s Certificate',
  mvr: 'MVR (Annual)',
  diabetic_eye_exam: 'Diabetic Eye Exam'
}

export const DOT_SLOT_KEYS = [...DOT_CREDENTIAL_SLOTS, ...DOT_DOCUMENT_KEYS]

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type DotDriverFile = {
  license_class: 'cdl' | 'non_cdl' | string | null
  license_number: string | null
  license_expires_on: string | null
  license_on_file?: string | null
  driver_restrictions: string | null
  medical_certificate_expires_on: string | null
  national_registry_number?: string | null
  registry_verified?: boolean | null
  diabetic_eye_exam_expires_on: string | null
  mvr_expires_on: string | null
  mvr_completed_on?: string | null
  archived_at?: string | null
}

export type DotDriverPerson = {
  employment_type?: string | null
  employment_status?: string | null
  archived_at?: string | null
}

export type DotDocumentRow = {
  document_type: string
  placed_on: string | null
  on_file?: string | null
  text_values?: Record<string, unknown> | null
}

/** Count of uploaded (not removed) files per slot. */
export type DotFileCounts = Record<string, number>

// ---------------------------------------------------------------------------
// Dates and applicability
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const addDaysIso = (iso: string, days: number) => {
  const date = new Date(iso + 'T00:00:00Z')

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

export const addYearsIso = (iso: string, years: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y + years, m - 1, d))

  // 29 Feb + 1 year rolls back to 28 Feb, not forward to 1 Mar.
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0)

  return date.toISOString().slice(0, 10)
}

export const formatUsDate = (iso: string | null | undefined) => {
  if (!iso || !ISO_DATE.test(iso.slice(0, 10))) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')

  return `${m}/${d}/${y}`
}

export type ExpiryState = 'none' | 'expired' | 'expiring' | 'ok'

/** 1.0 dot-dqf-attention: before today is expired, within 30 days is expiring. */
export const expiryState = (iso: string | null | undefined, todayIso: string, warningDays = DOT_WARNING_DAYS): ExpiryState => {
  if (!iso || !ISO_DATE.test(iso.slice(0, 10))) return 'none'
  const date = iso.slice(0, 10)

  if (date < todayIso) return 'expired'
  if (date <= addDaysIso(todayIso, warningDays)) return 'expiring'

  return 'ok'
}

/** Seasonal drivers are exempt from the medical certificate (1.0 dot-dqf-mec-rules). */
export const medicalCertificateRequired = (person: DotDriverPerson) => String(person.employment_type || '').toLowerCase() !== 'seasonal'

/** Non-CDL drivers still need a license copy and expiry, but not a CDL number. */
export const cdlNumberRequired = (file: Pick<DotDriverFile, 'license_class'>) => file.license_class !== 'non_cdl'

/** Required when the driver's restrictions mention diabetes (insulin-treated drivers). */
export const diabeticEyeExamRequired = (file: Pick<DotDriverFile, 'driver_restrictions'>) => /diabet/i.test(file.driver_restrictions || '')

/** A DQF is only checked while the driver is active (1.0 skipped terminated, inactive and archived). */
export const driverIsActive = (file: Pick<DotDriverFile, 'archived_at'>, person: DotDriverPerson) =>
  !file.archived_at && !person.archived_at && !['terminated', 'inactive'].includes(String(person.employment_status || '').toLowerCase())

/** The earliest credential date: the file's next due date (1.0 dueDate). */
export const nextDueDate = (file: DotDriverFile, person: DotDriverPerson) => {
  const dates = [
    file.license_expires_on,
    medicalCertificateRequired(person) ? file.medical_certificate_expires_on : null,
    file.mvr_expires_on,
    file.diabetic_eye_exam_expires_on
  ].filter((value): value is string => Boolean(value && ISO_DATE.test(value)))

  return dates.length ? dates.sort()[0] : null
}

/** After an MVR is pulled, the next one is due a year later (49 CFR 391.25). */
export const nextMvrDue = (completedOn: string) => addYearsIso(completedOn, 1)

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

export type WorksheetTone = 'ok' | 'critical' | 'pending' | 'muted'

export type WorksheetItem = {
  key: string
  label: string
  group: string
  tone: WorksheetTone
  status: 'on_file' | 'missing' | 'expired' | 'expiring' | 'optional' | 'na'
  text: string
  date: string | null
  copies: number
}

const docOnFile = (def: DotDocumentDef, row: DotDocumentRow | undefined, copies: number, file: DotDriverFile) => {
  if (copies > 0) return true

  if (!row) {
    // The registry check can be satisfied from the file's own fields (1.0 rule).
    return def.key === 'registry_verification' && Boolean(file.registry_verified || file.national_registry_number)
  }

  if (row.placed_on || row.on_file === 'yes') return true

  const values = row.text_values || {}

  if (def.key === 'dqf_review') return Boolean(String(values.notes || '').trim())

  if (def.key === 'registry_verification') {
    return Boolean(String(values.examiner_registration_number || '').trim() || file.registry_verified || file.national_registry_number)
  }

  return false
}

const credentialItem = ({
  key,
  date,
  copies,
  required,
  requireBoth,
  todayIso,
  missingDateText
}: {
  key: DotCredentialSlot
  date: string | null
  copies: number
  required: boolean
  requireBoth: boolean
  todayIso: string
  missingDateText?: string
}): WorksheetItem => {
  const base = { key, label: DOT_CREDENTIAL_LABELS[key], group: 'credentials', date, copies }
  const state = expiryState(date, todayIso)

  if (!required && !date && !copies) return { ...base, tone: 'muted', status: required ? 'missing' : 'optional', text: 'Optional' }
  if (state === 'expired') return { ...base, tone: 'critical', status: 'expired', text: 'Expired ' + formatUsDate(date) }

  const onFile = requireBoth ? Boolean(date) && copies > 0 : Boolean(date) || copies > 0

  if (!onFile) {
    const text = copies && !date && missingDateText ? missingDateText : 'Missing'

    return { ...base, tone: 'critical', status: 'missing', text }
  }

  if (state === 'expiring') return { ...base, tone: 'pending', status: 'expiring', text: 'Expiring ' + formatUsDate(date) }
  if (!date && missingDateText) return { ...base, tone: 'critical', status: 'missing', text: missingDateText }

  return { ...base, tone: 'ok', status: 'on_file', text: date ? 'Expires ' + formatUsDate(date) : 'On file' }
}

/** Every line of the DQF worksheet with its status, in order: credentials, then documents. */
export const dqfWorksheet = ({
  file,
  person,
  documents,
  fileCounts,
  hiddenDocuments,
  todayIso
}: {
  file: DotDriverFile
  person: DotDriverPerson
  documents: DotDocumentRow[]
  fileCounts: DotFileCounts
  hiddenDocuments: string[]
  todayIso: string
}): WorksheetItem[] => {
  const count = (slot: string) => Number(fileCounts[slot] || 0)
  const byType = new Map(documents.map(row => [row.document_type, row]))
  const mecRequired = medicalCertificateRequired(person)
  const diabeticRequired = diabeticEyeExamRequired(file)

  const items: WorksheetItem[] = [
    credentialItem({ key: 'license', date: file.license_expires_on, copies: count('license'), required: true, requireBoth: true, todayIso }),
    mecRequired
      ? credentialItem({ key: 'medical_certificate', date: file.medical_certificate_expires_on, copies: count('medical_certificate'), required: true, requireBoth: false, todayIso })
      : { key: 'medical_certificate', label: DOT_CREDENTIAL_LABELS.medical_certificate, group: 'credentials', tone: 'muted', status: 'na', text: 'N/A (seasonal)', date: file.medical_certificate_expires_on, copies: count('medical_certificate') },
    credentialItem({ key: 'mvr', date: file.mvr_expires_on, copies: count('mvr'), required: true, requireBoth: false, todayIso, missingDateText: 'Expiration not set' }),
    credentialItem({ key: 'diabetic_eye_exam', date: file.diabetic_eye_exam_expires_on, copies: count('diabetic_eye_exam'), required: diabeticRequired, requireBoth: true, todayIso })
  ]

  for (const def of DOT_DOCUMENTS) {
    const row = byType.get(def.key)
    const copies = count(def.key)
    const base = { key: def.key, label: def.label, group: def.group, date: row?.placed_on || null, copies }

    if (hiddenDocuments.includes(def.key)) {
      items.push({ ...base, tone: 'muted', status: 'na', text: 'N/A' })
    } else if (docOnFile(def, row, copies, file)) {
      items.push({ ...base, tone: 'ok', status: 'on_file', text: row?.placed_on ? 'Placed ' + formatUsDate(row.placed_on) : 'On file' })
    } else if (def.optional) {
      items.push({ ...base, tone: 'muted', status: 'optional', text: 'Optional' })
    } else {
      items.push({ ...base, tone: 'critical', status: 'missing', text: 'Missing' })
    }
  }

  return items
}

// ---------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------

export type DotIssueKind =
  | 'expired'
  | 'expiring'
  | 'missingDocuments'
  | 'missingLicenseCopy'
  | 'missingLicenseExpiry'
  | 'pendingMvr'
  | 'missingMvrConsent'
  | 'sampleDue'

export const DOT_ISSUE_LABELS: Record<DotIssueKind, string> = {
  expired: 'Expired',
  expiring: 'Expiring soon (30 days)',
  missingDocuments: 'Missing DQF documents',
  missingLicenseCopy: 'Missing license copy',
  missingLicenseExpiry: 'Missing license expiration',
  pendingMvr: 'Pending MVR',
  missingMvrConsent: 'MVR consent required',
  sampleDue: 'Selected for annual MVR sample'
}

/** 1.0's attention sort: most urgent first. */
const ISSUE_ORDER: DotIssueKind[] = ['expired', 'pendingMvr', 'missingMvrConsent', 'sampleDue', 'expiring', 'missingLicenseExpiry', 'missingLicenseCopy', 'missingDocuments']

export type DotIssue = { kind: DotIssueKind; label: string; detail: string; slot?: string; date?: string | null }

/**
 * What needs attention on one DQF. Unlike 1.0, the license copy and expiry are reported once
 * (as their own kinds), not again under "missing documents".
 */
export const dqfIssues = (input: Parameters<typeof dqfWorksheet>[0]): DotIssue[] => {
  if (!driverIsActive(input.file, input.person)) return []

  const issues: DotIssue[] = []
  const items = dqfWorksheet(input)

  for (const item of items) {
    if (item.status === 'expired') issues.push({ kind: 'expired', label: item.label, detail: item.text, slot: item.key, date: item.date })
    else if (item.status === 'expiring') issues.push({ kind: 'expiring', label: item.label, detail: item.text, slot: item.key, date: item.date })
  }

  if (!input.file.license_expires_on) issues.push({ kind: 'missingLicenseExpiry', label: DOT_CREDENTIAL_LABELS.license, detail: 'No expiration date', slot: 'license' })
  if (!Number(input.fileCounts.license || 0)) issues.push({ kind: 'missingLicenseCopy', label: DOT_CREDENTIAL_LABELS.license, detail: 'No copy on file', slot: 'license' })

  for (const item of items) {
    if (item.status === 'missing' && item.key !== 'license') {
      issues.push({ kind: 'missingDocuments', label: item.label, detail: item.text, slot: item.key })
    }
  }

  return sortIssues(issues)
}

export const sortIssues = <T extends { kind: DotIssueKind }>(issues: T[]) =>
  [...issues].sort((a, b) => ISSUE_ORDER.indexOf(a.kind) - ISSUE_ORDER.indexOf(b.kind))

// ---------------------------------------------------------------------------
// Company-driver (insurance MVR) roster
// ---------------------------------------------------------------------------

export type CompanyDriverStatus = 'on_insurance' | 'pending_mvr' | 'suspended' | 'removed'

export const COMPANY_DRIVER_STATUS_LABELS: Record<CompanyDriverStatus, string> = {
  on_insurance: 'On insurance',
  pending_mvr: 'Pending MVR',
  suspended: 'Suspended',
  removed: 'Removed'
}

export type CompanyDriver = {
  status: string
  license_expires_on: string | null
  mvr_consent_on: string | null
  last_mvr_on: string | null
  initial_mvr_on: string | null
  sample_year: number | null
  sample_completed_at: string | null
}

/** Consent counts with a date or an uploaded form (1.0 company-driver-mvr-requirements). */
export const mvrConsentOnFile = (driver: Pick<CompanyDriver, 'mvr_consent_on'>, consentUploads: number) =>
  Boolean(driver.mvr_consent_on) || consentUploads > 0

export const mvrOnFile = (driver: Pick<CompanyDriver, 'last_mvr_on' | 'initial_mvr_on'>, reportUploads: number) =>
  Boolean(driver.last_mvr_on || driver.initial_mvr_on) || reportUploads > 0

export const companyDriverIssues = (
  driver: CompanyDriver,
  { consentUploads, todayIso, year }: { consentUploads: number; todayIso: string; year: number }
): DotIssue[] => {
  if (driver.status === 'removed') return []

  const issues: DotIssue[] = []
  const license = expiryState(driver.license_expires_on, todayIso)

  if (license === 'none') issues.push({ kind: 'missingLicenseExpiry', label: DOT_CREDENTIAL_LABELS.license, detail: 'No expiration date' })
  else if (license === 'expired') issues.push({ kind: 'expired', label: DOT_CREDENTIAL_LABELS.license, detail: 'Expired ' + formatUsDate(driver.license_expires_on), date: driver.license_expires_on })
  else if (license === 'expiring') issues.push({ kind: 'expiring', label: DOT_CREDENTIAL_LABELS.license, detail: 'Expiring ' + formatUsDate(driver.license_expires_on), date: driver.license_expires_on })

  if (driver.status === 'pending_mvr') issues.push({ kind: 'pendingMvr', label: 'MVR', detail: 'Pending initial MVR' })
  if (!mvrConsentOnFile(driver, consentUploads)) issues.push({ kind: 'missingMvrConsent', label: 'MVR consent', detail: 'Missing MVR consent form' })
  if (driver.sample_year === year && !driver.sample_completed_at) issues.push({ kind: 'sampleDue', label: 'MVR', detail: `Selected for the ${year} sample` })

  return sortIssues(issues)
}

/** 1.0 mvr-sample: 10% of eligible drivers, at least one. */
export const mvrSampleSize = (eligible: number, percent = 10) => (eligible <= 0 ? 0 : Math.max(1, Math.ceil((eligible * percent) / 100)))

export const mvrSampleEligible = (driver: Pick<CompanyDriver, 'status'>) => driver.status === 'on_insurance' || driver.status === 'pending_mvr'

// ---------------------------------------------------------------------------
// Compliance report
// ---------------------------------------------------------------------------

export type ReportCell = { key: string; status: WorksheetItem['status']; text: string; copies: number }
export type ReportSeverity = 'critical' | 'warning' | 'ok'

/** 1.0: any expired cell is critical, any expiring is a warning. Missing documents are counted separately. */
export const reportSeverity = (cells: ReportCell[]): ReportSeverity =>
  cells.some(cell => cell.status === 'expired') ? 'critical' : cells.some(cell => cell.status === 'expiring') ? 'warning' : 'ok'

export const reportColumns = (hiddenDocuments: string[]) => [
  ...DOT_CREDENTIAL_SLOTS.map(key => ({ key, label: DOT_CREDENTIAL_LABELS[key] })),
  ...DOT_DOCUMENTS.filter(item => !hiddenDocuments.includes(item.key)).map(item => ({ key: item.key, label: item.label }))
]

export type ReportRow = { name: string; employeeNumber: string; location: string; severity: ReportSeverity; cells: ReportCell[] }

export const buildReportRow = (
  meta: { name: string; employeeNumber: string; location: string },
  worksheet: WorksheetItem[],
  hiddenDocuments: string[]
): ReportRow => {
  const byKey = new Map(worksheet.map(item => [item.key, item]))

  const cells = reportColumns(hiddenDocuments).map(column => {
    const item = byKey.get(column.key)

    return { key: column.key, status: item?.status || 'missing', text: item?.text || 'Missing', copies: item?.copies || 0 }
  })

  return { ...meta, severity: reportSeverity(cells), cells }
}

export const reportTotals = (rows: ReportRow[]) => {
  const cells = rows.flatMap(row => row.cells)

  return {
    drivers: rows.length,
    critical: rows.filter(row => row.severity === 'critical').length,
    warning: rows.filter(row => row.severity === 'warning').length,
    missing: rows.filter(row => row.cells.some(cell => cell.status === 'missing')).length,
    expired: cells.filter(cell => cell.status === 'expired').length,
    expiringSoon: cells.filter(cell => cell.status === 'expiring').length
  }
}

export const reportStatsLine = (totals: ReturnType<typeof reportTotals>) =>
  `${totals.drivers} drivers · ${totals.critical} critical · ${totals.warning} warning · ${totals.missing} missing · ${totals.expired} expired · ${totals.expiringSoon} expiring soon`

const csvCell = (value: unknown) => {
  const text = String(value ?? '')

  // Neutralize spreadsheet formulas, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text

  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe
}

export const reportCsv = (rows: ReportRow[], hiddenDocuments: string[]) => {
  const columns = reportColumns(hiddenDocuments)
  const header = ['Driver', 'Employee #', 'Location', 'Severity', ...columns.map(c => c.label), ...columns.map(c => c.label + ' copy')]

  const lines = rows.map(row => [
    row.name,
    row.employeeNumber,
    row.location,
    row.severity,
    ...row.cells.map(cell => cell.text),
    ...row.cells.map(cell => (cell.status === 'na' ? 'N/A' : cell.copies ? 'Yes' : 'No'))
  ])

  return [header, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Attention cards and list filters (Batch 1)
// ---------------------------------------------------------------------------

/** DQF kinds the driver list can filter by; the roster kinds filter the company-driver list. */
export const DOT_DQF_ATTENTION_KINDS: DotIssueKind[] = ['expired', 'expiring', 'missingDocuments', 'missingLicenseCopy', 'missingLicenseExpiry']
export const DOT_ROSTER_ATTENTION_KINDS: DotIssueKind[] = ['pendingMvr', 'missingMvrConsent', 'sampleDue']

export const isDotIssueKind = (value: unknown): value is DotIssueKind =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(DOT_ISSUE_LABELS, value)

/** 1.0 driverMatchesAttentionFilter, on the issues 2.0 already works out per file or roster row. */
export const driverMatchesAttentionFilter = (item: { issues: Array<{ kind: string }> }, kind: DotIssueKind | null | undefined) =>
  !kind || item.issues.some(issue => issue.kind === kind)

export type DotAttentionCard = { kind: DotIssueKind; label: string; count: number; href: string; source: 'dqf' | 'roster' }

/** 1.0 buildDotAttentionCards: one card per kind, counting drivers (not issues), each linking to its filtered list. */
export const buildDotAttentionCards = (
  files: Array<{ issues: Array<{ kind: string }> }>,
  roster: Array<{ issues: Array<{ kind: string }> }>
): DotAttentionCard[] => [
  ...DOT_DQF_ATTENTION_KINDS.map(kind => ({
    kind,
    label: DOT_ISSUE_LABELS[kind],
    count: files.filter(item => driverMatchesAttentionFilter(item, kind)).length,
    href: '/dot/drivers?attention=' + kind,
    source: 'dqf' as const
  })),
  ...DOT_ROSTER_ATTENTION_KINDS.map(kind => ({
    kind,
    label: DOT_ISSUE_LABELS[kind],
    count: roster.filter(item => driverMatchesAttentionFilter(item, kind)).length,
    href: '/dot/company-drivers?attention=' + kind,
    source: 'roster' as const
  }))
]

// ---------------------------------------------------------------------------
// Company-driver roster search, sort and license follow-ups (Batch 1)
// ---------------------------------------------------------------------------

export type LicenseFollowUp = 'expired' | 'expiring' | 'noCopy'

export const LICENSE_FOLLOW_UP_LABELS: Record<LicenseFollowUp, string> = {
  expired: 'License expired',
  expiring: 'License expiring (30 days)',
  noCopy: 'No license copy'
}

/**
 * 1.0 driversWithLicenseIssues: expired, expiring within 30 days, or (2.0) no license copy uploaded.
 * Removed drivers never need a follow-up. A missing expiry date stays its own issue (missingLicenseExpiry).
 */
export const licenseFollowUps = (
  driver: Pick<CompanyDriver, 'status' | 'license_expires_on'>,
  licenseUploads: number,
  todayIso: string
): LicenseFollowUp[] => {
  if (driver.status === 'removed') return []

  const state = expiryState(driver.license_expires_on, todayIso)
  const out: LicenseFollowUp[] = []

  if (state === 'expired') out.push('expired')
  else if (state === 'expiring') out.push('expiring')
  if (!(licenseUploads > 0)) out.push('noCopy')

  return out
}

/** 1.0 matchesCompanyDriverQuery: every word must match the name, employee # or license #. */
export const companyDriverMatchesQuery = (
  driver: { driver_name?: string | null; employee_number?: string | null; license_number?: string | null },
  query: string | null | undefined
) => {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (!tokens.length) return true

  const haystack = [driver.driver_name, driver.employee_number, driver.license_number].map(value => String(value || '').toLowerCase()).join(' ')

  return tokens.every(token => haystack.includes(token))
}

export const COMPANY_DRIVER_SORT_KEYS = ['name', 'status', 'next_mvr', 'consent'] as const
export type CompanyDriverSortKey = (typeof COMPANY_DRIVER_SORT_KEYS)[number]

const STATUS_RANK: Record<string, number> = { on_insurance: 0, pending_mvr: 1, suspended: 2, removed: 3 }

const lastNameKey = (name: string) => {
  const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean)

  return (words[words.length - 1] || '') + ' ' + words.slice(0, -1).join(' ')
}

/**
 * Sorts roster rows. Name sorts by last name like 1.0. Empty dates sort last in either direction,
 * so next MVR due ascending puts the most urgent first and blanks at the bottom.
 */
export const sortCompanyDrivers = <T extends { name: string; driver: { status: string; next_mvr_due_on?: string | null; mvr_consent_on?: string | null } }>(
  items: T[],
  key: CompanyDriverSortKey,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  const sign = direction === 'desc' ? -1 : 1
  const byName = (a: T, b: T) => lastNameKey(a.name).localeCompare(lastNameKey(b.name))

  const dateCompare = (a: string | null | undefined, b: string | null | undefined) => {
    if (!a && !b) return 0
    if (!a) return 1
    if (!b) return -1

    return sign * a.localeCompare(b)
  }

  return [...items].sort((a, b) => {
    let result: number

    if (key === 'status') result = sign * ((STATUS_RANK[a.driver.status] ?? 9) - (STATUS_RANK[b.driver.status] ?? 9))
    else if (key === 'next_mvr') result = dateCompare(a.driver.next_mvr_due_on, b.driver.next_mvr_due_on)
    else if (key === 'consent') result = dateCompare(a.driver.mvr_consent_on, b.driver.mvr_consent_on)
    else result = sign * byName(a, b)

    return result || byName(a, b)
  })
}

// ---------------------------------------------------------------------------
// DOT record due dates and dashboard counts (Batch 1)
// ---------------------------------------------------------------------------

/** Whole days from one ISO date to another (b minus a). */
export const isoDayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 86_400_000)

/**
 * 1.0 dotDueOverdueLabel. Open records with a due date read "Due MM/DD/YYYY", or "Overdue Nd" once
 * the date has passed. Closed records and records without a due date show nothing.
 */
export const dotDueOverdueLabel = (
  record: { status?: string | null; due_on?: string | null },
  todayIso: string
): { text: string; overdue: boolean } | null => {
  const due = String(record.due_on || '').slice(0, 10)

  if (record.status === 'closed' || !ISO_DATE.test(due)) return null
  if (due >= todayIso) return { text: 'Due ' + formatUsDate(due), overdue: false }

  return { text: `Overdue ${isoDayDiff(due, todayIso)}d`, overdue: true }
}

/** Record counts per category plus the open count, for the dashboard tiles. */
export const summarizeDotRecords = (records: Array<{ category: string; status: string }>, categories: string[]) => {
  const byCategory: Record<string, number> = Object.fromEntries(categories.map(key => [key, 0]))

  for (const record of records) byCategory[record.category] = (byCategory[record.category] || 0) + 1

  return { total: records.length, open: records.filter(record => record.status === 'open').length, byCategory }
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/** Checks the first bytes match the declared type, so a renamed file is refused. */
export const looksLikeDotFile = (bytes: Uint8Array, contentType: string) => {
  const at = (offset: number, text: string) => [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0))

  switch (contentType) {
    case 'application/pdf':
      return at(0, '%PDF-')
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return bytes[0] === 0x89 && at(1, 'PNG')
    case 'image/webp':
      return at(0, 'RIFF') && at(8, 'WEBP')
    case 'image/heic':
    case 'image/heif':
      return at(4, 'ftyp') && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].some(brand => at(8, brand))
    default:
      return false
  }
}
