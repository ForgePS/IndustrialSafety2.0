/**
 * Port slice 15: Contractor Safety rules (companies, documents, workers, qualifications, site sign-in and
 * whether a company or worker is cleared to work). Pure and self-contained (no "@/" imports) so the unit
 * tests can load it directly.
 */

export const COMPANY_STATUSES = [
  { key: 'pending', label: 'Pending approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'inactive', label: 'Inactive' }
] as const

export type CompanyStatus = (typeof COMPANY_STATUSES)[number]['key']

export const DOCUMENT_TYPES = [
  { key: 'general_liability', label: 'General liability insurance', insurance: true },
  { key: 'workers_comp', label: "Workers' comp insurance", insurance: true },
  { key: 'auto_liability', label: 'Auto liability insurance', insurance: true },
  { key: 'umbrella', label: 'Umbrella / excess insurance', insurance: true },
  { key: 'safety_program', label: 'Written safety program', insurance: false },
  { key: 'license', label: 'Business or trade license', insurance: false },
  { key: 'w9', label: 'W-9', insurance: false },
  { key: 'other', label: 'Other', insurance: false }
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]['key']

export const DEFAULT_REQUIRED_DOCUMENTS: DocumentType[] = ['general_liability', 'workers_comp']

export const companyStatusLabel = (key: string) => COMPANY_STATUSES.find(item => item.key === key)?.label || key
export const documentTypeLabel = (key: string) => DOCUMENT_TYPES.find(item => item.key === key)?.label || key
export const isDocumentType = (value: unknown): value is DocumentType => DOCUMENT_TYPES.some(item => item.key === value)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

export const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00Z')

  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '')
const line = (value: unknown) => text(value).replace(/\s+/g, ' ')

export const addDays = (iso: string, days: number) => {
  const date = new Date(iso + 'T00:00:00Z')

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

export const addMonths = (iso: string, months: number) => {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()

  target.setUTCDate(Math.min(day, lastDay))

  return target.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type ContractorSettings = { requiredDocuments: DocumentType[]; orientationValidMonths: number; warningDays: number }

export const DEFAULT_SETTINGS: ContractorSettings = { requiredDocuments: DEFAULT_REQUIRED_DOCUMENTS, orientationValidMonths: 12, warningDays: 30 }

export const cleanSettings = (raw: Record<string, unknown>): ContractorSettings | { error: string } => {
  const required = [...new Set((Array.isArray(raw.requiredDocuments) ? raw.requiredDocuments : []).map(String))]

  if (!required.every(isDocumentType)) return { error: 'Pick document types from the list.' }

  const months = Number(raw.orientationValidMonths)

  if (!Number.isInteger(months) || months < 1 || months > 60) return { error: 'Orientation must be good for 1 to 60 months.' }

  const warn = Number(raw.warningDays)

  if (!Number.isInteger(warn) || warn < 1 || warn > 180) return { error: 'Warn between 1 and 180 days ahead.' }

  return { requiredDocuments: required as DocumentType[], orientationValidMonths: months, warningDays: warn }
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export type CompanyInput = {
  name: string
  trade: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  sponsorUserId: string | null
  locationIds: string[]
  emr: number | null
  trir: number | null
  notes: string | null
}

const decimal = (value: unknown, max: number, label: string) => {
  if (value === undefined || value === null || value === '') return { value: null }
  const number = Number(value)

  if (!Number.isFinite(number) || number < 0 || number > max) return { error: `Enter ${label} between 0 and ${max}.` }

  return { value: Math.round(number * 100) / 100 }
}

export const cleanCompanyInput = (raw: Record<string, unknown>): CompanyInput | { error: string } => {
  const name = line(raw.name)

  if (!name) return { error: 'Enter the company name.' }
  if (name.length > 200) return { error: 'Keep the name to 200 characters.' }

  const trade = line(raw.trade)

  if (trade.length > 120) return { error: 'Keep the trade to 120 characters.' }

  const contactName = line(raw.contactName)
  const contactEmail = line(raw.contactEmail).toLowerCase()
  const contactPhone = line(raw.contactPhone)

  if (contactName.length > 120) return { error: 'Keep the contact name to 120 characters.' }
  if (contactEmail && (contactEmail.length > 254 || !EMAIL.test(contactEmail))) return { error: 'Enter a valid contact email.' }
  if (contactPhone && (contactPhone.length > 40 || !/^[0-9+().\-\s x]+$/i.test(contactPhone))) return { error: 'Enter a valid contact phone.' }

  const sponsorUserId = raw.sponsorUserId ? String(raw.sponsorUserId) : null

  if (sponsorUserId && !isUuid(sponsorUserId)) return { error: 'Pick the sponsor.' }

  const locationIds = [...new Set((Array.isArray(raw.locationIds) ? raw.locationIds : []).map(String))]

  if (!locationIds.every(isUuid)) return { error: 'Pick locations from the list.' }

  const emr = decimal(raw.emr, 10, 'the EMR')

  if ('error' in emr) return { error: emr.error as string }

  const trir = decimal(raw.trir, 100, 'the TRIR')

  if ('error' in trir) return { error: trir.error as string }

  const notes = text(raw.notes)

  if (notes.length > 5000) return { error: 'Keep the notes to 5,000 characters.' }

  return {
    name,
    trade: trade || null,
    contactName: contactName || null,
    contactEmail: contactEmail || null,
    contactPhone: contactPhone || null,
    sponsorUserId,
    locationIds,
    emr: emr.value,
    trir: trir.value,
    notes: notes || null
  }
}

export type DocumentInput = { docType: DocumentType; title: string | null; coverageAmount: number | null; effectiveOn: string | null; expiresOn: string | null }

export const cleanDocumentInput = (raw: Record<string, unknown>): DocumentInput | { error: string } => {
  const docType = raw.docType

  if (!isDocumentType(docType)) return { error: 'Pick the type of document.' }

  const title = line(raw.title)

  if (title.length > 200) return { error: 'Keep the title to 200 characters.' }
  if (docType === 'other' && !title) return { error: 'Give the document a title.' }

  const coverage = raw.coverageAmount === undefined || raw.coverageAmount === null || raw.coverageAmount === '' ? null : Number(String(raw.coverageAmount).replace(/[$,\s]/g, ''))

  if (coverage !== null && (!Number.isFinite(coverage) || coverage < 0 || coverage > 1_000_000_000)) return { error: 'Enter the coverage amount in dollars.' }

  const effectiveOn = raw.effectiveOn ? String(raw.effectiveOn) : null
  const expiresOn = raw.expiresOn ? String(raw.expiresOn) : null

  if (effectiveOn && !isDate(effectiveOn)) return { error: 'Enter a valid effective date.' }
  if (expiresOn && !isDate(expiresOn)) return { error: 'Enter a valid expiration date.' }
  if (effectiveOn && expiresOn && expiresOn < effectiveOn) return { error: 'The expiration date is before the effective date.' }

  const insurance = DOCUMENT_TYPES.find(item => item.key === docType)!.insurance

  if (insurance && !expiresOn) return { error: 'Insurance certificates need an expiration date.' }

  return { docType, title: title || null, coverageAmount: insurance ? coverage : null, effectiveOn, expiresOn }
}

export type WorkerInput = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  trade: string | null
  badgeNumber: string | null
  active: boolean
  orientationCompletedOn: string | null
}

export const cleanWorkerInput = (raw: Record<string, unknown>, today: string): WorkerInput | { error: string } => {
  const firstName = line(raw.firstName)
  const lastName = line(raw.lastName)

  if (!firstName || !lastName) return { error: 'Enter the first and last name.' }
  if (firstName.length > 80 || lastName.length > 80) return { error: 'Keep names to 80 characters.' }

  const email = line(raw.email).toLowerCase()
  const phone = line(raw.phone)
  const trade = line(raw.trade)
  const badgeNumber = line(raw.badgeNumber).toUpperCase()

  if (email && (email.length > 254 || !EMAIL.test(email))) return { error: 'Enter a valid email.' }
  if (phone && (phone.length > 40 || !/^[0-9+().\-\s x]+$/i.test(phone))) return { error: 'Enter a valid phone number.' }
  if (trade.length > 120) return { error: 'Keep the trade to 120 characters.' }
  if (badgeNumber.length > 40) return { error: 'Keep the badge number to 40 characters.' }

  const orientation = raw.orientationCompletedOn ? String(raw.orientationCompletedOn) : null

  if (orientation && !isDate(orientation)) return { error: 'Enter a valid orientation date.' }
  if (orientation && orientation > today) return { error: "The orientation date can't be in the future." }

  return {
    firstName,
    lastName,
    email: email || null,
    phone: phone || null,
    trade: trade || null,
    badgeNumber: badgeNumber || null,
    active: raw.active !== false,
    orientationCompletedOn: orientation
  }
}

export type QualificationInput = { name: string; issuedOn: string | null; expiresOn: string | null; required: boolean }

export const cleanQualificationInput = (raw: Record<string, unknown>): QualificationInput | { error: string } => {
  const name = line(raw.name)

  if (!name) return { error: 'Name the qualification (for example OSHA 10 or Forklift operator).' }
  if (name.length > 120) return { error: 'Keep the name to 120 characters.' }

  const issuedOn = raw.issuedOn ? String(raw.issuedOn) : null
  const expiresOn = raw.expiresOn ? String(raw.expiresOn) : null

  if (issuedOn && !isDate(issuedOn)) return { error: 'Enter a valid issue date.' }
  if (expiresOn && !isDate(expiresOn)) return { error: 'Enter a valid expiration date.' }
  if (issuedOn && expiresOn && expiresOn < issuedOn) return { error: 'The expiration date is before the issue date.' }

  return { name, issuedOn, expiresOn, required: raw.required === true }
}

// ---------------------------------------------------------------------------
// Standing: is a company / worker cleared to work?
// ---------------------------------------------------------------------------

export type DateState = 'missing' | 'expired' | 'expiring' | 'current'

/** A date's state against today: past = expired; within the warning window = expiring. No date = current. */
export const expiryState = (expiresOn: string | null, today: string, warningDays: number): Exclude<DateState, 'missing'> => {
  if (!expiresOn) return 'current'
  if (expiresOn < today) return 'expired'

  return expiresOn <= addDays(today, warningDays) ? 'expiring' : 'current'
}

export type StandingDocument = { id: string; doc_type: string; effective_on?: string | null; expires_on: string | null; archived_at?: string | null }
export type Problem = { code: string; message: string }

export type Standing = { cleared: boolean; problems: Problem[]; warnings: Problem[] }

/**
 * A company is cleared when it is approved and every required document type has a current document: not
 * archived, already in effect, and not expired. Documents expiring within the warning window are warnings. A
 * renewal that hasn't started yet doesn't count until its effective date.
 */
export const companyStanding = ({
  status,
  documents,
  settings,
  today
}: {
  status: string
  documents: StandingDocument[]
  settings: ContractorSettings
  today: string
}): Standing => {
  const problems: Problem[] = []
  const warnings: Problem[] = []

  if (status !== 'approved') problems.push({ code: 'status_' + status, message: status === 'pending' ? 'Not approved yet' : `Company is ${companyStatusLabel(status).toLowerCase()}` })

  const live = documents.filter(doc => !doc.archived_at)

  for (const type of settings.requiredDocuments) {
    const ofType = live.filter(doc => doc.doc_type === type)

    if (!ofType.length) {
      problems.push({ code: 'missing_' + type, message: `${documentTypeLabel(type)} missing` })
      continue
    }

    const inForce = ofType.filter(doc => !doc.effective_on || doc.effective_on <= today)

    if (!inForce.length) {
      const starts = ofType.map(doc => doc.effective_on as string).sort()[0]

      problems.push({ code: 'not_effective_' + type, message: `${documentTypeLabel(type)} not in effect until ${starts}` })
      continue
    }

    // The best one in force counts: no expiry beats any date, later beats earlier.
    const best = inForce.reduce((a, b) => (!a.expires_on ? a : !b.expires_on ? b : a.expires_on >= b.expires_on ? a : b))
    const state = expiryState(best.expires_on, today, settings.warningDays)

    if (state === 'expired') problems.push({ code: 'expired_' + type, message: `${documentTypeLabel(type)} expired ${best.expires_on}` })
    else if (state === 'expiring') warnings.push({ code: 'expiring_' + type, message: `${documentTypeLabel(type)} expires ${best.expires_on}` })
  }

  for (const doc of live.filter(item => !settings.requiredDocuments.includes(item.doc_type as DocumentType))) {
    const state = expiryState(doc.expires_on, today, settings.warningDays)

    if (state !== 'current') warnings.push({ code: state + '_' + doc.doc_type, message: `${documentTypeLabel(doc.doc_type)} ${state === 'expired' ? 'expired' : 'expires'} ${doc.expires_on}` })
  }

  return { cleared: problems.length === 0, problems, warnings }
}

export const orientationExpiresOn = (completedOn: string | null, settings: ContractorSettings) => (completedOn ? addMonths(completedOn, settings.orientationValidMonths) : null)

export type StandingQualification = { name: string; expires_on: string | null; required: boolean }

/**
 * A worker is cleared when active, their company is cleared, their site orientation is current, and every
 * qualification marked required is current. Other qualifications expiring or expired are warnings.
 */
export const workerStanding = ({
  active,
  orientationCompletedOn,
  qualifications,
  company,
  settings,
  today
}: {
  active: boolean
  orientationCompletedOn: string | null
  qualifications: StandingQualification[]
  company: Standing
  settings: ContractorSettings
  today: string
}): Standing & { orientationExpiresOn: string | null } => {
  const problems: Problem[] = []
  const warnings: Problem[] = [...company.warnings]

  if (!active) problems.push({ code: 'inactive', message: 'Worker is inactive' })
  if (!company.cleared) problems.push(...company.problems.map(problem => ({ code: 'company_' + problem.code, message: 'Company: ' + problem.message })))

  const orientationExpires = orientationExpiresOn(orientationCompletedOn, settings)

  if (!orientationExpires) problems.push({ code: 'orientation_missing', message: 'Site orientation not done' })
  else {
    const state = expiryState(orientationExpires, today, settings.warningDays)

    if (state === 'expired') problems.push({ code: 'orientation_expired', message: `Site orientation expired ${orientationExpires}` })
    else if (state === 'expiring') warnings.push({ code: 'orientation_expiring', message: `Site orientation expires ${orientationExpires}` })
  }

  for (const qualification of qualifications) {
    const state = expiryState(qualification.expires_on, today, settings.warningDays)

    if (state === 'expired' && qualification.required) problems.push({ code: 'qualification_expired', message: `${qualification.name} expired ${qualification.expires_on}` })
    else if (state !== 'current') warnings.push({ code: 'qualification_' + state, message: `${qualification.name} ${state === 'expired' ? 'expired' : 'expires'} ${qualification.expires_on}` })
  }

  return { cleared: problems.length === 0, problems, warnings, orientationExpiresOn: orientationExpires }
}

// ---------------------------------------------------------------------------
// Site sign-in
// ---------------------------------------------------------------------------

/** Whether a company may work at a location: no list = anywhere in the company. */
export const companyAllowedAt = (locationIds: string[], locationId: string) => !locationIds.length || locationIds.includes(locationId)

export type SignInInput = { workerId: string; locationId: string; hostName: string | null; purpose: string | null; overrideReason: string | null }

export const cleanSignIn = (raw: Record<string, unknown>): SignInInput | { error: string } => {
  const workerId = String(raw.workerId || '')
  const locationId = String(raw.locationId || '')

  if (!isUuid(workerId)) return { error: 'Pick the worker.' }
  if (!isUuid(locationId)) return { error: 'Pick the location.' }

  const hostName = line(raw.hostName)
  const purpose = line(raw.purpose)
  const overrideReason = line(raw.overrideReason)

  if (hostName.length > 120) return { error: 'Keep the host to 120 characters.' }
  if (purpose.length > 300) return { error: 'Keep the purpose to 300 characters.' }
  if (overrideReason.length > 500) return { error: 'Keep the reason to 500 characters.' }

  return { workerId, locationId, hostName: hostName || null, purpose: purpose || null, overrideReason: overrideReason || null }
}

/**
 * Decides a sign-in. A worker who isn't cleared, or a company not allowed at the location, is refused unless
 * someone who can manage contractors gives a reason (an override, kept on the record).
 */
export const signInDecision = ({
  standing,
  allowedHere,
  alreadyOnSite,
  canOverride,
  overrideReason
}: {
  standing: Standing
  allowedHere: boolean
  alreadyOnSite: boolean
  canOverride: boolean
  overrideReason: string | null
}): { ok: true; overridden: boolean; problems: Problem[] } | { ok: false; error: string; problems: Problem[] } => {
  if (alreadyOnSite) return { ok: false, error: 'This worker is already signed in. Sign them out first.', problems: [] }

  const problems = [...standing.problems, ...(allowedHere ? [] : [{ code: 'location', message: "Company isn't approved for this location" }])]

  if (!problems.length) return { ok: true, overridden: false, problems }
  if (!canOverride) return { ok: false, error: 'Not cleared to work: ' + problems.map(problem => problem.message).join('; ') + '.', problems }
  if (!overrideReason) return { ok: false, error: 'Not cleared to work. Give a reason to sign them in anyway.', problems }

  return { ok: true, overridden: true, problems }
}
