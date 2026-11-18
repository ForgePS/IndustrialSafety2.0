/**
 * Port slice 11: fleet reminder rules (pure: no database, no Next). Which reminders are due for a vehicle,
 * a maintenance item, a DVIR or a vehicle document, who may receive each kind, whether a member's scope
 * covers the vehicle, and the digest text. forgeFleetNotify.ts loads the data and queues the notices.
 *
 * 1.0 only showed "Configure recipients in Fleet Settings" and never sent anything.
 */
import { daysUntil, expiryState, maintenanceDueState, registrationDueDate, todayIso, vehicleDisplayName } from './forgeFleetRules.ts'

export const FLEET_NOTICE_KINDS = [
  'registration',
  'insurance',
  'annual_inspection',
  'maintenance_due',
  'maintenance_overdue',
  'dvir_defect',
  'document_expiring'
] as const
export type FleetNoticeKind = (typeof FLEET_NOTICE_KINDS)[number]

/** Fleet editors get every reminder; maintenance staff get maintenance and DVIR reminders. */
export const NOTICE_PERMISSIONS: Record<FleetNoticeKind, readonly string[]> = {
  registration: ['fleet.edit'],
  insurance: ['fleet.edit'],
  annual_inspection: ['fleet.edit'],
  document_expiring: ['fleet.edit'],
  maintenance_due: ['fleet.edit', 'fleet.maintenance'],
  maintenance_overdue: ['fleet.edit', 'fleet.maintenance'],
  dvir_defect: ['fleet.edit', 'fleet.maintenance']
}

export const RECIPIENT_PERMISSIONS = ['fleet.edit', 'fleet.maintenance'] as const

/** A DVIR defect becomes a reminder once it has waited this long for a mechanic. */
export const DVIR_DEFECT_GRACE_HOURS = 24

export type NoticeVehicle = {
  id: string
  organization_id: string
  vehicle_number?: string | null
  unit_number?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  status?: string | null
  mileage?: number | null
  location_id?: string | null
  division_id?: string | null
  assigned_driver_personnel_id?: string | null
  registration_renewal_date?: string | null
  registration_renewal_month?: number | null
  insurance_expires_on?: string | null
  annual_inspection_due_on?: string | null
}

export type FleetNotice = {
  kind: FleetNoticeKind
  subjectId: string
  vehicleId: string
  dueKey: string
  line: string
  link: string
}

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`

const when = (date: string, now: Date) => {
  const days = daysUntil(date, now)

  if (days < 0) return `was due ${usDate(date)} (${-days} day${days === -1 ? '' : 's'} ago)`
  if (days === 0) return 'is due today'

  return `is due ${usDate(date)} (in ${days} day${days === 1 ? '' : 's'})`
}

const expires = (date: string, now: Date) => {
  const days = daysUntil(date, now)

  if (days < 0) return `expired ${usDate(date)}`
  if (days === 0) return 'expires today'

  return `expires ${usDate(date)} (in ${days} day${days === 1 ? '' : 's'})`
}

/** Registration, insurance and annual inspection reminders for one vehicle. */
export const vehicleNotices = (vehicle: NoticeVehicle, warningDays: number, now = new Date()): FleetNotice[] => {
  const name = vehicleDisplayName(vehicle)
  const link = `/fleet/vehicles/${vehicle.id}`
  const notices: FleetNotice[] = []
  const registration = registrationDueDate(vehicle, now)

  if (registration && expiryState(registration, warningDays, now) !== 'ok') {
    notices.push({ kind: 'registration', subjectId: vehicle.id, vehicleId: vehicle.id, dueKey: registration, line: `${name}: registration ${when(registration, now)}.`, link })
  }

  const insurance = vehicle.insurance_expires_on?.slice(0, 10)

  if (insurance && expiryState(insurance, warningDays, now) !== 'ok') {
    notices.push({ kind: 'insurance', subjectId: vehicle.id, vehicleId: vehicle.id, dueKey: insurance, line: `${name}: insurance ${expires(insurance, now)}.`, link })
  }

  const inspection = vehicle.annual_inspection_due_on?.slice(0, 10)

  if (inspection && expiryState(inspection, warningDays, now) !== 'ok') {
    notices.push({ kind: 'annual_inspection', subjectId: vehicle.id, vehicleId: vehicle.id, dueKey: inspection, line: `${name}: annual inspection ${when(inspection, now)}.`, link })
  }

  return notices
}

export type NoticeMaintenance = {
  id: string
  vehicle_id: string
  maintenance_number?: string | null
  title: string
  status: string
  due_on?: string | null
  due_mileage?: number | null
}

/** "Due soon" or "overdue" for an open maintenance item, by date or mileage. The key changes when the due point moves. */
export const maintenanceNotice = (record: NoticeMaintenance, vehicle: NoticeVehicle, warningDays: number, now = new Date()): FleetNotice | null => {
  const state = maintenanceDueState(record, vehicle.mileage ?? null, warningDays, now)

  if (state !== 'overdue' && state !== 'due_soon') return null

  const parts: string[] = []

  if (record.due_on) {
    const date = record.due_on.slice(0, 10)
    const days = daysUntil(date, now)

    parts.push(`due ${usDate(date)}` + (days < 0 ? ` (${-days} day${days === -1 ? '' : 's'} ago)` : days === 0 ? ' (today)' : ` (in ${days} day${days === 1 ? '' : 's'})`))
  }

  if (record.due_mileage != null) {
    const left = vehicle.mileage != null ? record.due_mileage - vehicle.mileage : null

    parts.push(
      left == null
        ? `due at ${record.due_mileage.toLocaleString('en-US')} miles`
        : left <= 0
          ? `due at ${record.due_mileage.toLocaleString('en-US')} miles (${(-left).toLocaleString('en-US')} miles over)`
          : `due at ${record.due_mileage.toLocaleString('en-US')} miles (${left.toLocaleString('en-US')} to go)`
    )
  }

  const label = state === 'overdue' ? 'overdue' : 'due soon'

  return {
    kind: state === 'overdue' ? 'maintenance_overdue' : 'maintenance_due',
    subjectId: record.id,
    vehicleId: vehicle.id,
    dueKey: `${record.due_on ? record.due_on.slice(0, 10) : '-'}|${record.due_mileage ?? '-'}`,
    line: `${vehicleDisplayName(vehicle)}: ${record.title}${record.maintenance_number ? ` (${record.maintenance_number})` : ''} is ${label}${parts.length ? ': ' + parts.join(', ') : ''}.`,
    link: `/fleet/maintenance/${record.id}`
  }
}

export type NoticeDvir = { id: string; vehicle_id: string; dvir_number?: string | null; status: string; created_at: string; archived_at?: string | null }

/** A DVIR still waiting for a mechanic more than a day after it was submitted. */
export const dvirDefectNotice = (dvir: NoticeDvir, vehicle: NoticeVehicle, now = new Date()): FleetNotice | null => {
  if (dvir.status !== 'open' || dvir.archived_at) return null

  const hours = (now.getTime() - new Date(dvir.created_at).getTime()) / 3_600_000

  if (!(hours > DVIR_DEFECT_GRACE_HOURS)) return null

  const days = Math.floor(hours / 24)

  return {
    kind: 'dvir_defect',
    subjectId: dvir.id,
    vehicleId: vehicle.id,
    dueKey: dvir.id,
    line: `${vehicleDisplayName(vehicle)}: DVIR${dvir.dvir_number ? ' ' + dvir.dvir_number : ''} has defects waiting for a mechanic for ${days} day${days === 1 ? '' : 's'}.`,
    link: `/fleet/dvirs/${dvir.id}`
  }
}

export type NoticeDocument = { id: string; vehicle_id: string; title?: string | null; file_name: string; document_type: string; expires_on?: string | null; archived_at?: string | null }

export const documentNotice = (document: NoticeDocument, vehicle: NoticeVehicle, warningDays: number, now = new Date()): FleetNotice | null => {
  const date = document.expires_on?.slice(0, 10)

  if (!date || document.archived_at || expiryState(date, warningDays, now) === 'ok') return null

  return {
    kind: 'document_expiring',
    subjectId: document.id,
    vehicleId: vehicle.id,
    dueKey: date,
    line: `${vehicleDisplayName(vehicle)}: document "${document.title || document.file_name}" ${expires(date, now)}.`,
    link: `/fleet/vehicles/${vehicle.id}`
  }
}

export type ScopeGrant = { scope: string | null }
export type RecipientScope = { locationIds: string[]; divisionIds: string[]; personnelIds: string[] }

/**
 * Whether a grant's scope covers the vehicle (same rule as forgeFleetAccess.vehicleWithinScope): organization
 * covers everything; location / division cover vehicles there; any scope covers the vehicles assigned to you.
 */
export const scopeCoversVehicle = (grant: ScopeGrant | null | undefined, recipient: RecipientScope, vehicle: NoticeVehicle) => {
  if (!grant) return false
  if (grant.scope === 'organization') return true
  if (vehicle.assigned_driver_personnel_id && recipient.personnelIds.includes(vehicle.assigned_driver_personnel_id)) return true
  if (grant.scope === 'location') return Boolean(vehicle.location_id && recipient.locationIds.includes(vehicle.location_id))
  if (grant.scope === 'division') return Boolean(vehicle.division_id && recipient.divisionIds.includes(vehicle.division_id))

  return false
}

/** Whether the member should get this reminder: one of the kind's permissions, with a scope that covers the vehicle. */
export const noticeReachesRecipient = (
  notice: Pick<FleetNotice, 'kind'>,
  grants: Partial<Record<string, ScopeGrant | null>>,
  recipient: RecipientScope,
  vehicle: NoticeVehicle
) => NOTICE_PERMISSIONS[notice.kind].some(key => scopeCoversVehicle(grants[key], recipient, vehicle))

const MAX_LINES = 25

/** One message per recipient per run, listing every new reminder. */
export const fleetDigest = (notices: FleetNotice[], now = new Date()) => {
  const count = notices.length
  const title = count === 1 ? 'Fleet reminder' : `Fleet reminders: ${count} items need attention`
  const lines = notices.slice(0, MAX_LINES).map(notice => '- ' + notice.line)

  if (count > MAX_LINES) lines.push(`- and ${count - MAX_LINES} more. Open Fleet to see them all.`)

  let body = `As of ${usDate(todayIso(now))}:\n` + lines.join('\n')

  if (body.length > 2000) body = body.slice(0, 1990).replace(/\n[^\n]*$/, '') + '\n- and more.'

  return { title, body, link: count === 1 ? notices[0].link : '/fleet' }
}
