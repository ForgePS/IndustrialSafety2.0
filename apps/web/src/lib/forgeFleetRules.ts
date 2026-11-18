/**
 * Port slice 11: Fleet & DVIR rules (Industrial 1.0 industrial-web lib/fleet.ts, lib/dvir.ts, platform-api
 * dvir-helpers.ts). Pure: no database, no Next. Used by pages, actions, the scan menu and the unit tests.
 */

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export const VEHICLE_TYPES = [
  'passenger_vehicle',
  'fleet_vehicle',
  'bob_truck',
  'trash_truck',
  'tractor_truck',
  'dump_truck',
  'construction_equipment',
  'trailer',
  'other'
] as const
export type VehicleType = (typeof VEHICLE_TYPES)[number]

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  passenger_vehicle: 'Passenger vehicle',
  fleet_vehicle: 'Fleet vehicle',
  bob_truck: 'Bobtail truck',
  trash_truck: 'Trash truck',
  tractor_truck: 'Tractor truck',
  dump_truck: 'Dump truck',
  construction_equipment: 'Construction equipment',
  trailer: 'Trailer',
  other: 'Other'
}

export const VEHICLE_STATUSES = ['active', 'inactive', 'out_of_service', 'removed', 'sold', 'disposed'] as const
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number]

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  active: 'In service',
  inactive: 'Inactive',
  out_of_service: 'Out of service',
  removed: 'Removed',
  sold: 'Sold',
  disposed: 'Disposed'
}

/** Removed from the fleet (1.0: REMOVED / SOLD / DISPOSED). Shown on the Removed tab, not the active list. */
export const REMOVED_STATUSES: readonly VehicleStatus[] = ['removed', 'sold', 'disposed']
export const isRemovedStatus = (status: string) => (REMOVED_STATUSES as readonly string[]).includes(status)

export const INSURANCE_STATUSES = ['unknown', 'insured', 'not_insured', 'pending', 'lapsed'] as const
export const INSURANCE_STATUS_LABELS: Record<(typeof INSURANCE_STATUSES)[number], string> = {
  unknown: 'Unknown',
  insured: 'Insured',
  not_insured: 'Not insured',
  pending: 'Pending',
  lapsed: 'Lapsed'
}

export const COUNTY_STATUSES = ['unknown', 'assessed', 'not_assessed', 'exempt', 'pending'] as const
export const COUNTY_STATUS_LABELS: Record<(typeof COUNTY_STATUSES)[number], string> = {
  unknown: 'Unknown',
  assessed: 'Assessed',
  not_assessed: 'Not assessed',
  exempt: 'Exempt',
  pending: 'Pending'
}

export const COMMUTE_STATUSES = ['unknown', 'yes', 'no', 'occasional'] as const
export const COMMUTE_STATUS_LABELS: Record<(typeof COMMUTE_STATUSES)[number], string> = {
  unknown: 'Unknown',
  yes: 'Yes',
  no: 'No',
  occasional: 'Occasional'
}

export const FILING_STATUSES = ['unknown', 'required', 'filed', 'not_required', 'overdue'] as const
export const FILING_STATUS_LABELS: Record<(typeof FILING_STATUSES)[number], string> = {
  unknown: 'Unknown',
  required: 'Required',
  filed: 'Filed',
  not_required: 'Not required',
  overdue: 'Overdue'
}

export const US_STATE_PATTERN = /^[A-Z]{2}$/

/** Display name for a vehicle: "Unit 12 · 2019 Ford F-150" or the vehicle number. */
export const vehicleDisplayName = (vehicle: {
  vehicle_number?: string | null
  unit_number?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
}) => {
  const description = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  const unit = vehicle.unit_number ? `Unit ${vehicle.unit_number}` : vehicle.vehicle_number || 'Vehicle'

  return description ? `${unit} · ${description}` : unit
}

const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
}

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export const normalizeVin = (vin: string | null | undefined) => {
  const value = (vin || '').replace(/\s/g, '').toUpperCase()

  return value || null
}

/**
 * Soft VIN check (1.0 validateVinHelper): null when it looks fine, otherwise a warning. Vehicles before 1981,
 * trailers and equipment often have non-standard numbers, so this never blocks a save.
 */
export const vinWarning = (vin: string | null | undefined): string | null => {
  const value = normalizeVin(vin)

  if (!value) return null
  if (value.length !== 17) return 'A standard VIN has 17 characters.'
  if (/[IOQ]/.test(value)) return 'A standard VIN never contains I, O or Q.'
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) return 'A VIN has only letters and digits.'

  const sum = value.split('').reduce((total, char, index) => total + (/\d/.test(char) ? Number(char) : VIN_VALUES[char] || 0) * VIN_WEIGHTS[index], 0)
  const check = sum % 11 === 10 ? 'X' : String(sum % 11)

  return value[8] === check ? null : 'The VIN check digit does not match. Double-check the number.'
}

// ---------------------------------------------------------------------------
// Dates: renewals, expirations, maintenance due
// ---------------------------------------------------------------------------

export type ExpiryState = 'none' | 'expired' | 'expiring' | 'ok'

const DAY = 86_400_000

const toDay = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))

  return date.getTime()
}

export const todayIso = (now = new Date()) => now.toISOString().slice(0, 10)

export const daysUntil = (date: string, now = new Date()) => Math.round((toDay(date) - toDay(now)) / DAY)

export const expiryState = (date: string | null | undefined, warningDays = 30, now = new Date()): ExpiryState => {
  if (!date) return 'none'

  const days = daysUntil(date, now)

  if (days < 0) return 'expired'

  return days <= warningDays ? 'expiring' : 'ok'
}

/**
 * When registration is next due: the renewal date if set, otherwise the end of the renewal month (this year,
 * or next year once that month has passed). 1.0 fleetRenewalBucket used the same two fields.
 */
export const registrationDueDate = (vehicle: { registration_renewal_date?: string | null; registration_renewal_month?: number | null }, now = new Date()): string | null => {
  if (vehicle.registration_renewal_date) return vehicle.registration_renewal_date.slice(0, 10)

  const month = vehicle.registration_renewal_month

  if (!month || month < 1 || month > 12) return null

  const year = now.getUTCFullYear()
  const endOfMonth = (y: number) => new Date(Date.UTC(y, month, 0)).toISOString().slice(0, 10)
  const thisYear = endOfMonth(year)

  return daysUntil(thisYear, now) < 0 ? endOfMonth(year + 1) : thisYear
}

export const RENEWAL_BUCKETS = ['overdue', 'due_30', 'due_60', 'due_90', 'later', 'unknown'] as const
export type RenewalBucket = (typeof RENEWAL_BUCKETS)[number]

export const RENEWAL_BUCKET_LABELS: Record<RenewalBucket, string> = {
  overdue: 'Overdue',
  due_30: 'Due in 30 days',
  due_60: 'Due in 31–60 days',
  due_90: 'Due in 61–90 days',
  later: 'Later',
  unknown: 'No date'
}

export const renewalBucket = (dueDate: string | null, now = new Date()): RenewalBucket => {
  if (!dueDate) return 'unknown'

  const days = daysUntil(dueDate, now)

  if (days < 0) return 'overdue'
  if (days <= 30) return 'due_30'
  if (days <= 60) return 'due_60'
  if (days <= 90) return 'due_90'

  return 'later'
}

export const MAINTENANCE_TYPES = ['pm', 'repair', 'recall', 'tires', 'inspection_followup', 'annual_inspection', 'other'] as const
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number]

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  pm: 'Preventive maintenance',
  repair: 'Repair',
  recall: 'Recall',
  tires: 'Tires',
  inspection_followup: 'Inspection follow-up',
  annual_inspection: 'Annual inspection',
  other: 'Other'
}

/** 1.0's preset job list (FLEET_COMMON_MAINTENANCE_ITEMS). */
export const COMMON_MAINTENANCE_ITEMS = [
  'Oil and filter change',
  'Tire rotation',
  'Brake inspection',
  'Annual DOT inspection',
  'Air filter',
  'Coolant service',
  'Transmission service',
  'Battery check',
  'Wiper blades',
  'Registration renewal'
] as const

export type MaintenanceDueState = 'done' | 'overdue' | 'due_soon' | 'scheduled' | 'unscheduled'

/** Due by date or by mileage, whichever comes first. "Soon" = within warningDays or 500 miles. */
export const maintenanceDueState = (
  record: { status: string; due_on?: string | null; due_mileage?: number | null },
  currentMileage: number | null | undefined,
  warningDays = 30,
  now = new Date()
): MaintenanceDueState => {
  if (record.status !== 'open') return 'done'

  const byDate = record.due_on ? daysUntil(record.due_on, now) : null
  const byMiles = record.due_mileage != null && currentMileage != null ? record.due_mileage - currentMileage : null

  if (byDate == null && byMiles == null) return 'unscheduled'
  if ((byDate != null && byDate < 0) || (byMiles != null && byMiles <= 0)) return 'overdue'
  if ((byDate != null && byDate <= warningDays) || (byMiles != null && byMiles <= 500)) return 'due_soon'

  return 'scheduled'
}

/** The next record when a repeating maintenance item is completed. */
export const nextRepeat = (
  record: { repeat_days?: number | null; repeat_miles?: number | null },
  completedOn: string,
  completedMileage: number | null
): { due_on: string | null; due_mileage: number | null } | null => {
  if (!record.repeat_days && !record.repeat_miles) return null

  const dueOn = record.repeat_days ? new Date(toDay(completedOn) + record.repeat_days * DAY).toISOString().slice(0, 10) : null
  const dueMileage = record.repeat_miles && completedMileage != null ? completedMileage + record.repeat_miles : null

  return dueOn || dueMileage != null ? { due_on: dueOn, due_mileage: dueMileage } : null
}

// ---------------------------------------------------------------------------
// DVIR (1.0's paper form: 35 truck, 5 safety and 14 trailer items for both trips)
// ---------------------------------------------------------------------------

export type DvirSection = 'truck' | 'safety' | 'trailer'
export type DvirItem = { id: string; label: string; section: DvirSection }
export type DvirAnswer = 'yes' | 'no' | 'na'
export type DvirItemAnswer = { id: string; answer: DvirAnswer; notes?: string | null }

export const DVIR_SECTION_LABELS: Record<DvirSection, string> = { truck: 'Truck / tractor', safety: 'Safety equipment', trailer: 'Trailer' }

export const DVIR_TRIP_TYPES = ['pre_trip', 'post_trip'] as const
export type DvirTripType = (typeof DVIR_TRIP_TYPES)[number]
export const DVIR_TRIP_LABELS: Record<DvirTripType, string> = { pre_trip: 'Pre-trip', post_trip: 'Post-trip' }

const item = (section: DvirSection) => (id: string, label: string): DvirItem => ({ id, label, section })
const truck = item('truck')
const safety = item('safety')
const trailer = item('trailer')

export const DVIR_ITEMS: readonly DvirItem[] = [
  truck('air-compressor', 'Air Compressor'),
  truck('air-lines', 'Air Lines'),
  truck('battery', 'Battery'),
  truck('brake-accessories', 'Brake Accessories'),
  truck('brakes', 'Brakes'),
  truck('carburetor', 'Carburetor'),
  truck('clutch', 'Clutch'),
  truck('defroster', 'Defroster'),
  truck('drive-line', 'Drive Line'),
  truck('engine', 'Engine'),
  truck('fifth-wheel', 'Fifth Wheel'),
  truck('front-axle', 'Front Axle'),
  truck('fuel-tanks', 'Fuel Tanks'),
  truck('heater', 'Heater'),
  truck('horn', 'Horn'),
  truck('lights-head-stop', 'Lights — Head / Stop'),
  truck('lights-tail-dash', 'Lights — Tail / Dash'),
  truck('lights-turn', 'Lights — Turn Indicators'),
  truck('mirrors', 'Mirrors'),
  truck('muffler', 'Muffler'),
  truck('oil-pressure', 'Oil Pressure'),
  truck('on-board-recorder', 'On-Board Recorder'),
  truck('radiator', 'Radiator'),
  truck('rear-end', 'Rear End'),
  truck('reflectors', 'Reflectors'),
  truck('springs', 'Springs'),
  truck('starter', 'Starter'),
  truck('steering', 'Steering'),
  truck('tachograph', 'Tachograph'),
  truck('tires', 'Tires'),
  truck('transmission', 'Transmission'),
  truck('wheels', 'Wheels'),
  truck('windows', 'Windows'),
  truck('windshield-wipers', 'Windshield Wipers'),
  truck('truck-other', 'Other'),
  safety('fire-extinguisher', 'Fire Extinguisher'),
  safety('first-aid-kit', 'First Aid Kit'),
  safety('flags-flares-fuses', 'Flags / Flares / Fuses'),
  safety('spare-bulbs-fuses', 'Spare Bulbs & Fuses'),
  safety('spare-seal-beam', 'Spare Seal Beam'),
  trailer('trailer-brake-connections', 'Brake Connections'),
  trailer('trailer-brakes', 'Brakes'),
  trailer('coupling-chains', 'Coupling Chains'),
  trailer('coupling-king-pin', 'Coupling (King) Pin'),
  trailer('doors', 'Doors'),
  trailer('hitch', 'Hitch'),
  trailer('landing-gear', 'Landing Gear'),
  trailer('trailer-lights', 'Lights — All'),
  trailer('roof', 'Roof'),
  trailer('trailer-springs', 'Springs'),
  trailer('tarpaulin', 'Tarpaulin'),
  trailer('trailer-tires', 'Tires'),
  trailer('trailer-wheels', 'Wheels'),
  trailer('trailer-other', 'Other')
]

const ITEM_BY_ID = new Map(DVIR_ITEMS.map(entry => [entry.id, entry]))

export const dvirItem = (id: string) => ITEM_BY_ID.get(id) || null

export type DvirSubmission = {
  tripType: string
  inspectionDate: string
  odometer?: number | null
  trailerNumbers?: string | null
  items: DvirItemAnswer[]
  remarks?: string | null
  conditionSatisfactory: boolean
  driverName: string
  driverSignatureImage: string | null
}

export const isValidSignatureImage = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length > 200 && value.length <= 400_000

const MAX_NOTE = 1000

/**
 * The server-side check of a driver's DVIR (1.0 assertDvirDriverBody): every item answered once, a "no" needs
 * a note, "satisfactory" only when nothing is "no", a driver name and signature. Returns the cleaned items in
 * checklist order, or the problems found.
 */
export const validateDvirSubmission = (input: DvirSubmission, now = new Date()): { ok: true; items: DvirItemAnswer[] } | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}

  if (!(DVIR_TRIP_TYPES as readonly string[]).includes(input.tripType)) errors.tripType = 'Choose pre-trip or post-trip.'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.inspectionDate || '')) errors.inspectionDate = 'Enter the inspection date.'
  else if (daysUntil(input.inspectionDate, now) > 1) errors.inspectionDate = 'The inspection date cannot be in the future.'

  if (input.odometer != null && (!Number.isInteger(input.odometer) || input.odometer < 0 || input.odometer > 10_000_000)) errors.odometer = 'Enter the odometer in whole miles.'

  const given = new Map<string, DvirItemAnswer>()

  for (const answer of Array.isArray(input.items) ? input.items : []) {
    if (answer && typeof answer.id === 'string' && ITEM_BY_ID.has(answer.id)) given.set(answer.id, answer)
  }

  const items: DvirItemAnswer[] = []

  for (const entry of DVIR_ITEMS) {
    const answer = given.get(entry.id)
    const value = answer?.answer

    if (value !== 'yes' && value !== 'no' && value !== 'na') {
      errors[`item:${entry.id}`] = 'Answer this item.'
      continue
    }

    const notes = typeof answer?.notes === 'string' ? answer.notes.trim().slice(0, MAX_NOTE) : ''

    if (value === 'no' && !notes) errors[`item:${entry.id}`] = 'Describe the defect.'
    items.push({ id: entry.id, answer: value, notes: notes || null })
  }

  const hasDefect = items.some(answer => answer.answer === 'no')

  if (input.conditionSatisfactory && hasDefect) errors.conditionSatisfactory = 'The condition cannot be satisfactory when an item has a defect.'

  if (!input.conditionSatisfactory && !hasDefect && !Object.keys(errors).some(key => key.startsWith('item:'))) {
    errors.conditionSatisfactory = 'Mark the condition satisfactory, or record the defect on the item.'
  }

  if (!(input.driverName || '').trim()) errors.driverName = 'Enter the driver name.'
  if (!isValidSignatureImage(input.driverSignatureImage)) errors.driverSignature = 'The driver must sign.'

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, items }
}

export type DvirDefect = { itemId: string; label: string; section: DvirSection; notes: string }

export const dvirDefects = (items: DvirItemAnswer[]): DvirDefect[] =>
  items.flatMap(answer => {
    const entry = ITEM_BY_ID.get(answer.id)

    return entry && answer.answer === 'no' ? [{ itemId: entry.id, label: entry.label, section: entry.section, notes: answer.notes || '' }] : []
  })

/** Status of a new DVIR: closed when nothing is defective, otherwise open for a mechanic. */
export const initialDvirStatus = (items: DvirItemAnswer[]) => (dvirDefects(items).length ? 'open' : 'closed')

export type DvirFollowUp = 'none' | 'needs_mechanic' | 'needs_review' | 'complete'

export const dvirFollowUp = (dvir: { status: string; mechanic_signature?: unknown; review_signature?: unknown; items?: DvirItemAnswer[] }): DvirFollowUp => {
  if (dvir.status === 'open') return 'needs_mechanic'
  if (dvir.status === 'needs_review') return 'needs_review'

  return dvir.mechanic_signature ? 'complete' : 'none'
}

export const DVIR_FOLLOW_UP_LABELS: Record<DvirFollowUp, string> = {
  none: 'No defects',
  needs_mechanic: 'Needs mechanic',
  needs_review: 'Needs driver review',
  complete: 'Repairs certified and reviewed'
}

/** What a vehicle QR offers for DVIRs (1.0 scan-actions: DOT-regulated units only, and not out of service). */
export const vehicleOffersDvir = (vehicle: { dot_regulated?: boolean | null; status?: string | null }) =>
  Boolean(vehicle.dot_regulated) && vehicle.status !== 'out_of_service' && !isRemovedStatus(vehicle.status || '')
