/**
 * Port slice 11: fleet maintenance rules (pure: no database, no Next). Form checks, the cost conversion and
 * the list order. Used by the maintenance pages, their server actions and the unit tests.
 */
import { MAINTENANCE_TYPES, daysUntil, maintenanceDueState } from './forgeFleetRules.ts'
import type { MaintenanceDueState, MaintenanceType } from './forgeFleetRules.ts'

export const MAINTENANCE_STATUSES = ['open', 'completed', 'canceled'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = { open: 'Open', completed: 'Completed', canceled: 'Canceled' }

export const MAINTENANCE_DUE_LABELS: Record<MaintenanceDueState, string> = {
  overdue: 'Overdue',
  due_soon: 'Due soon',
  scheduled: 'Scheduled',
  unscheduled: 'No due date',
  done: 'Closed'
}

export const MAINTENANCE_DUE_FILTERS: readonly MaintenanceDueState[] = ['overdue', 'due_soon', 'scheduled', 'unscheduled']

const DUE_RANK: Record<MaintenanceDueState, number> = { overdue: 0, due_soon: 1, scheduled: 2, unscheduled: 3, done: 4 }

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** "125", "125.5", "$1,250.00" → cents. '' → null. Anything else → NaN (a form error). */
export const dollarsToCents = (value: string | number | null | undefined): number | null => {
  if (value == null) return null

  const text = String(value).replace(/[$,\s]/g, '')

  if (!text) return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN

  return Math.round(Number(text) * 100)
}

export const centsToDollars = (cents: number | null | undefined) =>
  cents == null ? '' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/** Whole number in a range, '' → null, anything else → NaN. */
const wholeNumber = (value: string | number | null | undefined, min: number, max: number) => {
  if (value == null) return null

  const text = String(value).replace(/[,\s]/g, '')

  if (!text) return null
  if (!/^\d+$/.test(text)) return Number.NaN

  const number = Number(text)

  return number >= min && number <= max ? number : Number.NaN
}

const cleanText = (value: unknown, max: number) => {
  const text = typeof value === 'string' ? value.trim() : ''

  return text ? text.slice(0, max) : null
}

export type MaintenanceInput = {
  title: string
  maintenanceType: string
  dueOn?: string | null
  dueMileage?: string | number | null
  vendor?: string | null
  cost?: string | number | null
  repeatDays?: string | number | null
  repeatMiles?: string | number | null
  notes?: string | null
}

export type MaintenanceValues = {
  title: string
  maintenance_type: MaintenanceType
  due_on: string | null
  due_mileage: number | null
  vendor: string | null
  cost_cents: number | null
  repeat_days: number | null
  repeat_miles: number | null
  notes: string | null
}

/** Checks a new or edited maintenance item. Returns the database values or the problems found. */
export const parseMaintenanceInput = (input: MaintenanceInput): { ok: true; values: MaintenanceValues } | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  const title = cleanText(input.title, 1000) || ''

  if (!title) errors.title = 'Enter what needs to be done.'
  else if (title.length > 200) errors.title = 'Keep the title under 200 characters.'

  const type = (MAINTENANCE_TYPES as readonly string[]).includes(input.maintenanceType) ? (input.maintenanceType as MaintenanceType) : null

  if (!type) errors.maintenanceType = 'Choose a type.'

  const dueOn = cleanText(input.dueOn, 10)

  if (dueOn && !ISO.test(dueOn)) errors.dueOn = 'Enter a valid due date.'

  const dueMileage = wholeNumber(input.dueMileage, 0, 10_000_000)

  if (Number.isNaN(dueMileage)) errors.dueMileage = 'Enter the due mileage in whole miles.'

  const cost = dollarsToCents(input.cost)

  if (Number.isNaN(cost)) errors.cost = 'Enter the cost in dollars, like 125.50.'
  else if (cost != null && cost > 2_000_000_000) errors.cost = 'The cost is too large.'

  const repeatDays = wholeNumber(input.repeatDays, 1, 3650)

  if (Number.isNaN(repeatDays)) errors.repeatDays = 'Repeat every 1 to 3650 days.'

  const repeatMiles = wholeNumber(input.repeatMiles, 1, 1_000_000)

  if (Number.isNaN(repeatMiles)) errors.repeatMiles = 'Repeat every 1 to 1,000,000 miles.'

  if (Object.keys(errors).length) return { ok: false, errors }

  return {
    ok: true,
    values: {
      title,
      maintenance_type: type!,
      due_on: dueOn,
      due_mileage: dueMileage,
      vendor: cleanText(input.vendor, 200),
      cost_cents: cost,
      repeat_days: repeatDays,
      repeat_miles: repeatMiles,
      notes: cleanText(input.notes, 4000)
    }
  }
}

export type CompletionInput = { completedOn: string; completedMileage?: string | number | null; cost?: string | number | null; notes?: string | null }

export type CompletionValues = { completed_on: string; completed_mileage: number | null; cost_cents: number | null; notes: string | null }

/** Checks a completion: a date (not in the future), optional mileage, cost and notes. */
export const parseCompletionInput = (input: CompletionInput, now = new Date()): { ok: true; values: CompletionValues } | { ok: false; errors: Record<string, string> } => {
  const errors: Record<string, string> = {}
  const completedOn = cleanText(input.completedOn, 10)

  if (!completedOn || !ISO.test(completedOn)) errors.completedOn = 'Enter the date the work was done.'
  else if (daysUntil(completedOn, now) > 1) errors.completedOn = 'The completed date cannot be in the future.'

  const mileage = wholeNumber(input.completedMileage, 0, 10_000_000)

  if (Number.isNaN(mileage)) errors.completedMileage = 'Enter the odometer in whole miles.'

  const cost = dollarsToCents(input.cost)

  if (Number.isNaN(cost)) errors.cost = 'Enter the cost in dollars, like 125.50.'

  if (Object.keys(errors).length) return { ok: false, errors }

  return { ok: true, values: { completed_on: completedOn!, completed_mileage: mileage, cost_cents: cost, notes: cleanText(input.notes, 4000) } }
}

/** A completion's odometer becomes a meter reading when it is at or above the vehicle's current mileage. */
export const completionWritesReading = (completedMileage: number | null, currentMileage: number | null | undefined) =>
  completedMileage != null && (currentMileage == null || completedMileage >= currentMileage)

export type MaintenanceListRow = { status: string; due_on?: string | null; due_mileage?: number | null; created_at?: string | null; vehicle_mileage?: number | null }

/**
 * List order: overdue first, then due soon, scheduled, no due date and closed; inside a group the earliest due
 * date first (items without a date after dated ones), then the newest.
 */
export const sortMaintenance = <T extends MaintenanceListRow>(rows: T[], warningDays = 30, now = new Date()) =>
  rows
    .map(row => ({ row, state: maintenanceDueState(row, row.vehicle_mileage ?? null, warningDays, now) }))
    .sort((a, b) => {
      const rank = DUE_RANK[a.state] - DUE_RANK[b.state]

      if (rank) return rank

      const left = a.row.due_on || '9999-12-31'
      const right = b.row.due_on || '9999-12-31'

      if (left !== right) return left < right ? -1 : 1

      return String(b.row.created_at || '').localeCompare(String(a.row.created_at || ''))
    })

// ---------------------------------------------------------------------------
// Drivers tab: DOT roster + DOT driver files merged per person
// ---------------------------------------------------------------------------

type DriverPerson = { id: string; first_name?: string | null; last_name?: string | null; preferred_name?: string | null; employee_number?: string | null } | null

export type RosterRow = {
  id: string
  personnel_id: string | null
  driver_name: string
  employee_number?: string | null
  status: string
  license_expires_on?: string | null
  next_mvr_due_on?: string | null
  person?: DriverPerson
}

export type DriverFileRow = {
  id: string
  personnel_id: string
  license_expires_on?: string | null
  medical_certificate_expires_on?: string | null
  mvr_expires_on?: string | null
  person?: DriverPerson
}

export type FleetDriver = {
  key: string
  personnelId: string | null
  name: string
  employeeNumber: string | null
  companyDriverId: string | null
  driverFileId: string | null
  rosterStatus: string | null
  licenseExpiresOn: string | null
  medicalExpiresOn: string | null
  mvrDueOn: string | null
  vehicles: Array<{ id: string; name: string }>
}

const personLabel = (person: DriverPerson) => (person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') : '')

/**
 * One row per person from the company-driver roster and the active DOT driver files. The driver file wins for
 * the license date (it is the qualification record); the roster's next MVR due wins over the file's MVR
 * expiry. Roster entries not linked to personnel stay as their own rows. Sorted by name.
 */
export const buildFleetDrivers = ({
  roster,
  files,
  vehicles
}: {
  roster: RosterRow[]
  files: DriverFileRow[]
  vehicles: Array<{ id: string; personnelId: string | null; name: string }>
}): FleetDriver[] => {
  const byKey = new Map<string, FleetDriver>()

  const entry = (key: string, personnelId: string | null): FleetDriver => {
    let driver = byKey.get(key)

    if (!driver) {
      driver = {
        key,
        personnelId,
        name: '',
        employeeNumber: null,
        companyDriverId: null,
        driverFileId: null,
        rosterStatus: null,
        licenseExpiresOn: null,
        medicalExpiresOn: null,
        mvrDueOn: null,
        vehicles: []
      }
      byKey.set(key, driver)
    }

    return driver
  }

  for (const row of roster) {
    const driver = entry(row.personnel_id ? 'p:' + row.personnel_id : 'r:' + row.id, row.personnel_id)

    driver.companyDriverId = row.id
    driver.rosterStatus = row.status
    driver.name = personLabel(row.person || null) || row.driver_name
    driver.employeeNumber = row.person?.employee_number || row.employee_number || null
    driver.licenseExpiresOn = driver.licenseExpiresOn || row.license_expires_on || null
    driver.mvrDueOn = row.next_mvr_due_on || driver.mvrDueOn
  }

  for (const row of files) {
    const driver = entry('p:' + row.personnel_id, row.personnel_id)

    driver.driverFileId = row.id
    driver.name = driver.name || personLabel(row.person || null) || 'Driver'
    driver.employeeNumber = driver.employeeNumber || row.person?.employee_number || null
    driver.licenseExpiresOn = row.license_expires_on || driver.licenseExpiresOn
    driver.medicalExpiresOn = row.medical_certificate_expires_on || null
    driver.mvrDueOn = driver.mvrDueOn || row.mvr_expires_on || null
  }

  for (const vehicle of vehicles) {
    const driver = vehicle.personnelId ? byKey.get('p:' + vehicle.personnelId) : null

    if (driver) driver.vehicles.push({ id: vehicle.id, name: vehicle.name })
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}
