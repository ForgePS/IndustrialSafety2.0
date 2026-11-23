/**
 * Port slice 17: Environmental Safety rules (permits, recurring obligations, environmental events and hazardous
 * waste manifests). No imports, so the unit tests can load this file directly.
 */

export const PERMIT_TYPES = [
  { key: 'air', label: 'Air' },
  { key: 'water_discharge', label: 'Wastewater discharge (NPDES / pretreatment)' },
  { key: 'stormwater', label: 'Stormwater' },
  { key: 'hazardous_waste', label: 'Hazardous waste (EPA ID / RCRA)' },
  { key: 'spcc', label: 'SPCC plan' },
  { key: 'drinking_water', label: 'Drinking water' },
  { key: 'other', label: 'Other' }
] as const

export const PERMIT_STATUSES = [
  { key: 'pending', label: 'Applied for' },
  { key: 'active', label: 'In force' },
  { key: 'terminated', label: 'Terminated' }
] as const

export const OBLIGATION_TYPES = [
  { key: 'monitoring', label: 'Monitoring or sampling' },
  { key: 'report', label: 'Report to an agency' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'training', label: 'Training' },
  { key: 'plan_review', label: 'Plan review' },
  { key: 'renewal', label: 'Permit renewal' },
  { key: 'other', label: 'Other' }
] as const

export const FREQUENCIES = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'semiannual', label: 'Every 6 months' },
  { key: 'annual', label: 'Yearly' },
  { key: 'one_time', label: 'One time' }
] as const

export const EVENT_TYPES = [
  { key: 'spill_release', label: 'Spill or release' },
  { key: 'exceedance', label: 'Permit limit exceedance' },
  { key: 'complaint', label: 'Complaint' },
  { key: 'notice_of_violation', label: 'Notice of violation' },
  { key: 'other', label: 'Other' }
] as const

export const MEDIA = [
  { key: 'air', label: 'Air' },
  { key: 'surface_water', label: 'Surface water' },
  { key: 'stormwater', label: 'Storm drain' },
  { key: 'sewer', label: 'Sanitary sewer' },
  { key: 'soil', label: 'Soil' },
  { key: 'groundwater', label: 'Groundwater' },
  { key: 'contained', label: 'Secondary containment / indoors' }
] as const

export const UNITS = ['gal', 'L', 'lb', 'kg', 'ton', 'ft3', 'yd3', 'drums'] as const

export const GENERATOR_STATUSES = [
  { key: 'vsqg', label: 'Very small quantity generator' },
  { key: 'sqg', label: 'Small quantity generator' },
  { key: 'lqg', label: 'Large quantity generator' }
] as const

export const PERMIT_WARN_DAYS = 90
export const OBLIGATION_WARN_DAYS = 14

type Option = { readonly key: string; readonly label: string }

const labelOf = (list: readonly Option[], key: string | null | undefined) => list.find(item => item.key === key)?.label || (key ? key.replace(/_/g, ' ') : '')
const isOneOf = <T extends readonly Option[]>(list: T, value: unknown): value is T[number]['key'] => typeof value === 'string' && list.some(item => item.key === value)

export const permitTypeLabel = (key: string) => labelOf(PERMIT_TYPES, key)
export const permitStatusLabel = (key: string) => labelOf(PERMIT_STATUSES, key)
export const obligationTypeLabel = (key: string) => labelOf(OBLIGATION_TYPES, key)
export const frequencyLabel = (key: string) => labelOf(FREQUENCIES, key)
export const eventTypeLabel = (key: string) => labelOf(EVENT_TYPES, key)
export const mediaLabel = (key: string) => labelOf(MEDIA, key)
export const generatorLabel = (key: string) => labelOf(GENERATOR_STATUSES, key)

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

export const isDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const date = new Date(value + 'T00:00:00Z')

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const addDays = (iso: string, days: number) => {
  const date = new Date(iso + 'T00:00:00Z')

  date.setUTCDate(date.getUTCDate() + days)

  return date.toISOString().slice(0, 10)
}

/** Calendar months, clamped to the last day (31 Jan + 1 month = 28 or 29 Feb). */
export const addMonths = (iso: string, months: number) => {
  const [year, month, day] = iso.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()

  target.setUTCDate(Math.min(day, last))

  return target.toISOString().slice(0, 10)
}

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)

const line = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const optionalDate = (value: unknown) => (value === null || value === undefined || value === '' ? null : String(value))

// ---------------------------------------------------------------------------
// Permits
// ---------------------------------------------------------------------------

export type PermitInput = {
  title: string
  permitNumber: string | null
  permitType: string
  agency: string
  locationId: string
  status: string
  issuedOn: string | null
  effectiveOn: string | null
  expiresOn: string | null
  notes: string | null
}

export const cleanPermitInput = (raw: Record<string, unknown>): PermitInput | { error: string } => {
  const title = line(raw.title)
  const agency = line(raw.agency)
  const permitNumber = line(raw.permitNumber) || null

  if (!title) return { error: 'Give the permit a name.' }
  if (title.length > 200 || agency.length > 200 || (permitNumber || '').length > 80) return { error: 'One of the fields is too long.' }
  if (!isOneOf(PERMIT_TYPES, raw.permitType)) return { error: 'Pick the type of permit.' }
  if (!agency) return { error: 'Name the agency that issued it.' }
  if (!isUuid(raw.locationId)) return { error: 'Pick the location.' }
  if (!isOneOf(PERMIT_STATUSES, raw.status)) return { error: 'Pick the status.' }

  const issuedOn = optionalDate(raw.issuedOn)
  const effectiveOn = optionalDate(raw.effectiveOn)
  const expiresOn = optionalDate(raw.expiresOn)

  for (const value of [issuedOn, effectiveOn, expiresOn]) if (value !== null && !isDate(value)) return { error: 'Enter valid dates.' }
  if (raw.status === 'active' && !permitNumber) return { error: 'A permit in force needs its number.' }
  if (effectiveOn && expiresOn && expiresOn < effectiveOn) return { error: "The permit can't expire before it takes effect." }
  if (issuedOn && expiresOn && expiresOn < issuedOn) return { error: "The permit can't expire before it was issued." }

  const notes = text(raw.notes)

  if (notes.length > 5000) return { error: 'Keep the notes to 5,000 characters.' }

  return { title, permitNumber, permitType: raw.permitType, agency, locationId: raw.locationId, status: raw.status, issuedOn, effectiveOn, expiresOn, notes: notes || null }
}

export type PermitState = 'terminated' | 'pending' | 'not_yet' | 'expired' | 'expiring' | 'active'

export const permitState = (permit: { status: string; effective_on: string | null; expires_on: string | null }, today: string): PermitState => {
  if (permit.status === 'terminated') return 'terminated'
  if (permit.status === 'pending') return 'pending'
  if (permit.effective_on && permit.effective_on > today) return 'not_yet'
  if (permit.expires_on && permit.expires_on < today) return 'expired'
  if (permit.expires_on && permit.expires_on <= addDays(today, PERMIT_WARN_DAYS)) return 'expiring'

  return 'active'
}

export const PERMIT_STATE_LABELS: Record<PermitState, string> = {
  terminated: 'Terminated',
  pending: 'Applied for',
  not_yet: 'Not yet in effect',
  expired: 'Expired',
  expiring: 'Expiring soon',
  active: 'In force'
}

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

export type ObligationInput = {
  title: string
  obligationType: string
  frequency: string
  nextDueOn: string
  locationId: string
  permitId: string | null
  ownerUserId: string | null
  notes: string | null
}

export const cleanObligationInput = (raw: Record<string, unknown>): ObligationInput | { error: string } => {
  const title = line(raw.title)

  if (!title) return { error: 'Say what has to be done.' }
  if (title.length > 200) return { error: 'Keep it to 200 characters.' }
  if (!isOneOf(OBLIGATION_TYPES, raw.obligationType)) return { error: 'Pick the type of obligation.' }
  if (!isOneOf(FREQUENCIES, raw.frequency)) return { error: 'Pick how often it is due.' }
  if (!isDate(raw.nextDueOn)) return { error: 'Enter when it is next due.' }
  if (!isUuid(raw.locationId)) return { error: 'Pick the location.' }

  const permitId = raw.permitId ? String(raw.permitId) : null
  const ownerUserId = raw.ownerUserId ? String(raw.ownerUserId) : null

  if (permitId && !isUuid(permitId)) return { error: 'Pick the permit from the list.' }
  if (ownerUserId && !isUuid(ownerUserId)) return { error: 'Pick the owner from the list.' }

  const notes = text(raw.notes)

  if (notes.length > 2000) return { error: 'Keep the notes to 2,000 characters.' }

  return { title, obligationType: raw.obligationType, frequency: raw.frequency, nextDueOn: raw.nextDueOn, locationId: raw.locationId, permitId, ownerUserId, notes: notes || null }
}

/** The next due date after completing the one due on `due`. Null for one-time obligations. */
export const advanceDue = (due: string, frequency: string): string | null => {
  switch (frequency) {
    case 'weekly':
      return addDays(due, 7)
    case 'monthly':
      return addMonths(due, 1)
    case 'quarterly':
      return addMonths(due, 3)
    case 'semiannual':
      return addMonths(due, 6)
    case 'annual':
      return addMonths(due, 12)
    default:
      return null
  }
}

export type CompletionInput = { completedOn: string; result: 'done' | 'issue'; notes: string | null }

/** Completing one occurrence. A problem found needs a note. Missed occurrences are never skipped. */
export const cleanCompletion = (raw: Record<string, unknown>, today: string): CompletionInput | { error: string } => {
  if (!isDate(raw.completedOn)) return { error: 'Enter the date it was done.' }
  if (raw.completedOn > today) return { error: "The date can't be in the future." }
  if (raw.result !== 'done' && raw.result !== 'issue') return { error: 'Say whether it was done without problems.' }

  const notes = text(raw.notes)

  if (raw.result === 'issue' && !notes) return { error: 'Describe the problem that was found.' }
  if (notes.length > 2000) return { error: 'Keep the notes to 2,000 characters.' }

  return { completedOn: raw.completedOn, result: raw.result, notes: notes || null }
}

export type DueState = 'inactive' | 'overdue' | 'due_soon' | 'ok'

export const obligationState = (obligation: { active: boolean; next_due_on: string | null }, today: string): DueState => {
  if (!obligation.active || !obligation.next_due_on) return 'inactive'
  if (obligation.next_due_on < today) return 'overdue'

  return obligation.next_due_on <= addDays(today, OBLIGATION_WARN_DAYS) ? 'due_soon' : 'ok'
}

// ---------------------------------------------------------------------------
// Environmental events
// ---------------------------------------------------------------------------

export type EventInput = {
  eventType: string
  occurredAt: string
  locationId: string
  permitId: string | null
  substance: string | null
  quantity: number | null
  unit: string | null
  media: string[]
  contained: boolean
  reportable: boolean
  agencyName: string | null
  agencyNotifiedAt: string | null
  agencyReference: string | null
  description: string
  immediateActions: string | null
}

const isDateTime = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value))

/** `now` is an ISO timestamp; times may be up to five minutes ahead of it (clock drift). */
export const cleanEventInput = (raw: Record<string, unknown>, now: string): EventInput | { error: string } => {
  const limit = Date.parse(now) + 5 * 60000

  if (!isOneOf(EVENT_TYPES, raw.eventType)) return { error: 'Pick the type of event.' }
  if (!isDateTime(raw.occurredAt)) return { error: 'Enter when it happened.' }
  if (Date.parse(raw.occurredAt) > limit) return { error: "It can't have happened in the future." }
  if (!isUuid(raw.locationId)) return { error: 'Pick the location.' }

  const permitId = raw.permitId ? String(raw.permitId) : null

  if (permitId && !isUuid(permitId)) return { error: 'Pick the permit from the list.' }

  const substance = line(raw.substance) || null

  if (raw.eventType === 'spill_release' && !substance) return { error: 'Name what was spilled or released.' }

  const hasQuantity = raw.quantity !== null && raw.quantity !== undefined && raw.quantity !== ''
  const quantity = hasQuantity ? Number(raw.quantity) : null

  if (hasQuantity && (!Number.isFinite(quantity) || (quantity as number) < 0 || (quantity as number) > 1e9)) return { error: 'Enter the quantity as a number.' }

  const unit = hasQuantity ? (UNITS as readonly string[]).find(item => item === raw.unit) || null : null

  if (hasQuantity && !unit) return { error: 'Pick the unit for the quantity.' }

  const mediaRaw = Array.isArray(raw.media) ? raw.media.map(String) : []

  if (!mediaRaw.every(item => isOneOf(MEDIA, item))) return { error: 'Pick where it went from the list.' }

  const media = MEDIA.map(item => item.key).filter(key => mediaRaw.includes(key))

  if (raw.eventType === 'spill_release' && !media.length) return { error: 'Say where the spill or release went.' }

  const reportable = raw.reportable === true
  const agencyName = line(raw.agencyName) || null
  const agencyReference = line(raw.agencyReference) || null
  const agencyNotifiedAt = raw.agencyNotifiedAt ? String(raw.agencyNotifiedAt) : null

  if (agencyNotifiedAt) {
    if (!isDateTime(agencyNotifiedAt)) return { error: 'Enter when the agency was told.' }
    if (Date.parse(agencyNotifiedAt) < Date.parse(raw.occurredAt)) return { error: "The agency can't have been told before it happened." }
    if (Date.parse(agencyNotifiedAt) > limit) return { error: "The agency notice can't be in the future." }
    if (!agencyName) return { error: 'Name the agency that was told.' }
  }

  const description = text(raw.description)
  const immediateActions = text(raw.immediateActions)

  if (!description) return { error: 'Describe what happened.' }

  if (description.length > 10000 || immediateActions.length > 5000 || (substance || '').length > 200 || (agencyName || '').length > 200 || (agencyReference || '').length > 120) {
    return { error: 'One of the fields is too long.' }
  }

  return {
    eventType: raw.eventType,
    occurredAt: new Date(raw.occurredAt).toISOString(),
    locationId: raw.locationId,
    permitId,
    substance,
    quantity,
    unit,
    media,
    contained: raw.contained === true,
    reportable,
    agencyName,
    agencyNotifiedAt: agencyNotifiedAt ? new Date(agencyNotifiedAt).toISOString() : null,
    agencyReference,
    description,
    immediateActions: immediateActions || null
  }
}

export const capaDone = (status: string | null) => status === 'pending_verification' || status === 'verified' || status === 'closed'

/** What stands in the way of closing an event. */
export const eventCloseBlockers = ({ reportable, agencyNotifiedAt, actions }: { reportable: boolean; agencyNotifiedAt: string | null; actions: { title: string; capaStatus: string | null; capaNumber?: string | null }[] }) => [
  ...(reportable && !agencyNotifiedAt ? ['It is reportable and the agency notice is not recorded'] : []),
  ...actions
    .filter(action => !capaDone(action.capaStatus))
    .map(action => `Action open: ${action.capaNumber ? action.capaNumber + ' ' : ''}${action.title} (${action.capaStatus === 'canceled' ? 'canceled' : 'not done'})`)
]

export const capaSeverityForEvent = (event: { reportable: boolean; event_type: string }) =>
  event.reportable || event.event_type === 'notice_of_violation' ? 'high' : event.event_type === 'complaint' ? 'low' : 'moderate'

// ---------------------------------------------------------------------------
// Hazardous waste shipments (manifests)
// ---------------------------------------------------------------------------

/** Uniform Hazardous Waste Manifest tracking number: nine digits and three letters. */
export const MANIFEST_NUMBER = /^\d{9}[A-Z]{3}$/

export type ShipmentInput = {
  manifestNumber: string
  locationId: string
  shippedOn: string
  generatorStatus: string
  wasteDescription: string
  wasteCodes: string[]
  quantity: number
  unit: string
  transporter: string
  facility: string
  returnReceivedOn: string | null
  exceptionFiledOn: string | null
  notes: string | null
}

export const cleanShipmentInput = (raw: Record<string, unknown>, today: string): ShipmentInput | { error: string } => {
  const manifestNumber = line(raw.manifestNumber).replace(/[\s-]/g, '').toUpperCase()

  if (!MANIFEST_NUMBER.test(manifestNumber)) return { error: 'Enter the manifest tracking number: nine digits then three letters, like 123456789JJK.' }
  if (!isUuid(raw.locationId)) return { error: 'Pick the location that shipped it.' }
  if (!isDate(raw.shippedOn)) return { error: 'Enter the date it was shipped.' }
  if (raw.shippedOn > today) return { error: "The ship date can't be in the future." }
  if (!isOneOf(GENERATOR_STATUSES, raw.generatorStatus)) return { error: 'Pick the generator status.' }

  const wasteDescription = line(raw.wasteDescription)
  const transporter = line(raw.transporter)
  const facility = line(raw.facility)

  if (!wasteDescription) return { error: 'Describe the waste.' }
  if (!transporter) return { error: 'Name the transporter.' }
  if (!facility) return { error: 'Name the receiving facility.' }
  if (wasteDescription.length > 500 || transporter.length > 200 || facility.length > 200) return { error: 'One of the fields is too long.' }

  const wasteCodes = [
    ...new Set(
      String(raw.wasteCodes || '')
        .toUpperCase()
        .split(/[\s,;]+/)
        .filter(Boolean)
    )
  ]

  if (wasteCodes.length > 20 || !wasteCodes.every(code => /^[A-Z0-9]{2,8}$/.test(code))) return { error: 'Enter waste codes like D001, F005, separated by commas.' }

  const quantity = Number(raw.quantity)

  if (raw.quantity === '' || raw.quantity === null || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) return { error: 'Enter the quantity shipped.' }
  if (!(UNITS as readonly string[]).includes(String(raw.unit))) return { error: 'Pick the unit.' }

  const returnReceivedOn = optionalDate(raw.returnReceivedOn)
  const exceptionFiledOn = optionalDate(raw.exceptionFiledOn)

  for (const value of [returnReceivedOn, exceptionFiledOn]) {
    if (value === null) continue
    if (!isDate(value)) return { error: 'Enter valid dates.' }
    if (value < raw.shippedOn) return { error: "A date can't be before the ship date." }
    if (value > today) return { error: "A date can't be in the future." }
  }

  const notes = text(raw.notes)

  if (notes.length > 2000) return { error: 'Keep the notes to 2,000 characters.' }

  return {
    manifestNumber,
    locationId: raw.locationId,
    shippedOn: raw.shippedOn,
    generatorStatus: raw.generatorStatus,
    wasteDescription,
    wasteCodes,
    quantity,
    unit: String(raw.unit),
    transporter,
    facility,
    returnReceivedOn,
    exceptionFiledOn,
    notes: notes || null
  }
}

export type ManifestState = 'received' | 'not_required' | 'exception_filed' | 'exception_overdue' | 'follow_up' | 'waiting'

/**
 * Where the signed copy from the receiving facility stands (40 CFR 262.42). Large quantity generators follow up
 * after 35 days and file an exception report by day 45; small quantity generators file one after 60 days.
 * Very small quantity generators have no exception reporting.
 */
export const manifestState = (shipment: { generator_status: string; shipped_on: string; return_received_on: string | null; exception_filed_on: string | null }, today: string): ManifestState => {
  if (shipment.return_received_on) return 'received'
  if (shipment.generator_status === 'vsqg') return 'not_required'
  if (shipment.exception_filed_on) return 'exception_filed'

  const days = daysBetween(shipment.shipped_on, today)

  if (shipment.generator_status === 'lqg') return days > 45 ? 'exception_overdue' : days > 35 ? 'follow_up' : 'waiting'

  return days > 60 ? 'exception_overdue' : 'waiting'
}

export const MANIFEST_STATE_LABELS: Record<ManifestState, string> = {
  received: 'Signed copy received',
  not_required: 'Awaiting copy (no exception report needed)',
  exception_filed: 'Exception report filed',
  exception_overdue: 'Exception report due',
  follow_up: 'Follow up with transporter and facility',
  waiting: 'Awaiting signed copy'
}

/** The date by which the exception report is due, or null when none applies. */
export const exceptionDueOn = (shipment: { generator_status: string; shipped_on: string }) =>
  shipment.generator_status === 'lqg' ? addDays(shipment.shipped_on, 45) : shipment.generator_status === 'sqg' ? addDays(shipment.shipped_on, 60) : null
