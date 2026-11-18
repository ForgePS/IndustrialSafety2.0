/**
 * Port slice 10: the scan action menu (Industrial 1.0 qr-action-config.ts, scan-actions.ts). Pure: no
 * database, no Next. Used by the scan page, its server actions, the QR admin form and the unit tests.
 *
 * A QR (forge_qr_codes) points at an asset, a location or a form template. With default_action
 * 'scan_menu' (or any non-asset target) scanning opens /scan/<token>, which lists the actions this QR's
 * action_config turns on, filtered for who is looking:
 *
 * - anonymous: nobody signed in and no employee number entered
 * - employee: identified by employee number on this QR (access mode employee_number or public_report)
 * - user: signed in and a member of the QR's company, with their effective permissions
 */

export const SCAN_TARGET_TYPES = ['asset', 'location', 'form', 'vehicle'] as const
export type ScanTargetType = (typeof SCAN_TARGET_TYPES)[number]

export const SCAN_ACCESS_MODES = ['signed_in', 'employee_number', 'public_report'] as const
export type ScanAccessMode = (typeof SCAN_ACCESS_MODES)[number]

export const SCAN_ACCESS_MODE_LABELS: Record<ScanAccessMode, string> = {
  signed_in: 'Signed-in users only',
  employee_number: 'Employee number or sign-in',
  public_report: 'Anyone can report an issue; employee number for the rest'
}

export const SCAN_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const
export type ScanFrequency = (typeof SCAN_FREQUENCIES)[number]

export const SCAN_FREQUENCY_LABELS: Record<ScanFrequency, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

/** Scan-log actions (forge_qr_scans.action). */
export const SCAN_EVENT_ACTIONS = [
  'open',
  'identify',
  'sign_out',
  'report_issue',
  'inspection_start',
  'inspection_complete',
  'out_of_service',
  'return_to_service',
  'history',
  'view_loto',
  'fill_form',
  'open_record',
  'dvir_submit'
] as const
export type ScanEventAction = (typeof SCAN_EVENT_ACTIONS)[number]

export const SCAN_EVENT_LABELS: Record<ScanEventAction, string> = {
  open: 'Scanned',
  identify: 'Employee identified',
  sign_out: 'Employee signed out',
  report_issue: 'Issue reported',
  inspection_start: 'Inspection started',
  inspection_complete: 'Inspection completed',
  out_of_service: 'Marked out of service',
  return_to_service: 'Returned to service',
  history: 'Viewed history',
  view_loto: 'Viewed LOTO',
  fill_form: 'Opened form',
  open_record: 'Opened record',
  dvir_submit: 'DVIR submitted'
}

export const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number]

export type QrActionConfig = {
  reportIssue: boolean

  /** Inspection template id per frequency; a frequency with no template shows no inspection action. */
  inspectionTemplates: Partial<Record<ScanFrequency, string>>
  markOutOfService: boolean
  returnToService: boolean

  /** 1.0 let any identified employee return equipment to service; 2.0 makes that opt-in. */
  employeeReturnToService: boolean

  /** A failed inspection item marks the asset out of service (1.0 did this for any NO answer). */
  outOfServiceOnFailedInspection: boolean
  history: boolean
  lotoView: boolean

  /** Published form templates offered as "Fill out" actions (signed-in users with forms.submit). */
  formTemplateIds: string[]
}

export const DEFAULT_QR_ACTION_CONFIG: QrActionConfig = {
  reportIssue: true,
  inspectionTemplates: {},
  markOutOfService: true,
  returnToService: true,
  employeeReturnToService: false,
  outOfServiceOnFailedInspection: true,
  history: true,
  lotoView: true,
  formTemplateIds: []
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

const flag = (raw: Record<string, unknown>, keys: string[], fallback: boolean) => {
  for (const key of keys) {
    const value = raw[key]

    if (typeof value === 'boolean') return value
    if (value === 'true') return true
    if (value === 'false') return false
  }

  return fallback
}

/** Normalizes a stored or submitted action_config. Accepts 1.0's camelCase and snake_case names. */
export const parseQrActionConfig = (input: unknown): QrActionConfig => {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  const d = DEFAULT_QR_ACTION_CONFIG

  const templatesRaw = (raw.inspectionTemplates ?? raw.inspection_templates) as Record<string, unknown> | undefined
  const inspectionTemplates: Partial<Record<ScanFrequency, string>> = {}

  if (templatesRaw && typeof templatesRaw === 'object') {
    for (const [key, value] of Object.entries(templatesRaw)) {
      const frequency = key.toLowerCase() as ScanFrequency

      if ((SCAN_FREQUENCIES as readonly string[]).includes(frequency) && isUuid(value)) inspectionTemplates[frequency] = value
    }
  }

  const formsRaw = raw.formTemplateIds ?? raw.form_template_ids
  const formTemplateIds = Array.isArray(formsRaw) ? [...new Set(formsRaw.filter(isUuid))].slice(0, 20) : []

  return {
    reportIssue: flag(raw, ['reportIssue', 'report_issue'], d.reportIssue),
    inspectionTemplates,
    markOutOfService: flag(raw, ['markOutOfService', 'mark_out_of_service'], d.markOutOfService),
    returnToService: flag(raw, ['returnToService', 'return_to_service'], d.returnToService),
    employeeReturnToService: flag(raw, ['employeeReturnToService', 'employee_return_to_service'], d.employeeReturnToService),
    outOfServiceOnFailedInspection: flag(raw, ['outOfServiceOnFailedInspection', 'out_of_service_on_failed_inspection'], d.outOfServiceOnFailedInspection),
    history: flag(raw, ['history', 'equipmentHistory', 'equipment_history'], d.history),
    lotoView: flag(raw, ['lotoView', 'viewLoto', 'view_loto'], d.lotoView),
    formTemplateIds
  }
}

export const parseScanAccessMode = (value: unknown): ScanAccessMode =>
  (SCAN_ACCESS_MODES as readonly string[]).includes(value as string) ? (value as ScanAccessMode) : 'signed_in'

/** Whether people without a login can identify by employee number on this QR. */
export const allowsEmployeeIdentification = (mode: ScanAccessMode) => mode === 'employee_number' || mode === 'public_report'

export type ScanViewer =
  | { kind: 'anonymous' }
  | { kind: 'employee'; personnelId: string; name: string }
  | { kind: 'user'; userId: string; personnelId: string | null; name: string; permissions: string[] }

export type ScanActionId =
  | 'report_issue'
  | 'inspect_daily'
  | 'inspect_weekly'
  | 'inspect_monthly'
  | 'out_of_service'
  | 'return_to_service'
  | 'history'
  | 'view_loto'
  | 'fill_form'
  | 'open_record'
  | 'dvir_pre_trip'
  | 'dvir_post_trip'

export type ScanAction = {
  id: ScanActionId
  label: string
  description: string
  frequency?: ScanFrequency
  templateId?: string
  formTemplateId?: string

  /** Set for actions that leave the scan page. */
  href?: string

  /** Shown but not usable until the viewer identifies or signs in. */
  locked?: 'identify' | 'sign_in'

  /** Set on vehicle actions: the permission checks use fleet permissions instead of asset ones. */
  subject?: 'vehicle'

  /** DVIR trip for dvir_pre_trip / dvir_post_trip. */
  trip?: 'pre_trip' | 'post_trip'
}

export type ScanMenuInput = {
  targetType: ScanTargetType
  targetId: string
  token: string
  accessMode: ScanAccessMode
  config: QrActionConfig

  /** forge_assets.status for asset targets. */
  assetStatus?: string | null

  /** forge_fleet_vehicles.status and dot_regulated for vehicle targets. */
  vehicleStatus?: string | null
  vehicleDotRegulated?: boolean | null

  /** The asset has at least one approved LOTO procedure. */
  lotoAvailable?: boolean

  /** Published templates for config.formTemplateIds (and the target form), in display order. */
  forms?: { id: string; title: string }[]
}

const has = (viewer: ScanViewer, ...keys: string[]) => viewer.kind === 'user' && keys.some(key => viewer.permissions.includes(key))

const VEHICLE_REMOVED_STATUSES = ['removed', 'sold', 'disposed']

/**
 * Whether a vehicle QR offers pre-trip / post-trip DVIRs: DOT-regulated, not out of service, not removed
 * (same rule as forgeFleetRules.vehicleOffersDvir; repeated here so this file stays dependency-free).
 */
export const scanVehicleOffersDvir = (status: string | null | undefined, dotRegulated: boolean | null | undefined) =>
  Boolean(dotRegulated) && status !== 'out_of_service' && !VEHICLE_REMOVED_STATUSES.includes(status || '')

/**
 * Vehicle QR menu (1.0 scan-actions VEHICLE): DVIRs for DOT-regulated units, report an issue, out of
 * service / return to service, history, forms and the fleet record. Vehicles have no daily / weekly /
 * monthly checklists: the DVIR is the inspection (1.0 skipped them for DOT units; 2.0's scan inspections
 * are asset records).
 */
const buildVehicleScanActions = (input: ScanMenuInput): ScanAction[] => {
  const { config } = input
  const status = input.vehicleStatus || 'active'
  const removed = VEHICLE_REMOVED_STATUSES.includes(status)
  const outOfService = status === 'out_of_service'
  const actions: ScanAction[] = []
  const vehicle = { subject: 'vehicle' as const }

  if (scanVehicleOffersDvir(status, input.vehicleDotRegulated)) {
    actions.push(
      { id: 'dvir_pre_trip', label: 'Pre-trip DVIR', description: 'Driver vehicle inspection report before you drive.', href: `/scan/${input.token}/dvir/pre_trip`, trip: 'pre_trip', ...vehicle },
      { id: 'dvir_post_trip', label: 'Post-trip DVIR', description: 'Driver vehicle inspection report at the end of the trip.', href: `/scan/${input.token}/dvir/post_trip`, trip: 'post_trip', ...vehicle }
    )
  }

  if (config.reportIssue && !removed) {
    actions.push({ id: 'report_issue', label: 'Report an issue', description: 'Tell the fleet team about a problem with this vehicle. Creates a Corrective Action.', ...vehicle })
  }

  if (!removed) {
    if (!outOfService && config.markOutOfService) {
      actions.push({ id: 'out_of_service', label: 'Mark out of service', description: 'Tag this vehicle out so nobody drives it until it is fixed.', ...vehicle })
    }

    if (outOfService && config.returnToService) {
      actions.push({ id: 'return_to_service', label: 'Return to service', description: 'The problem is fixed and the vehicle is safe to drive.', ...vehicle })
    }
  }

  if (config.history) {
    actions.push({ id: 'history', label: 'Vehicle history', description: 'Recent DVIRs, maintenance, issues and service status changes.', ...vehicle })
  }

  for (const form of input.forms || []) {
    actions.push({
      id: 'fill_form',
      label: `Fill out: ${form.title}`,
      description: 'Opens the form in Forge. Requires sign-in.',
      formTemplateId: form.id,
      href: `/forms/fill/${form.id}`
    })
  }

  actions.push({ id: 'open_record', label: 'Open vehicle record', description: 'The full fleet record in Forge.', href: `/fleet/vehicles/${input.targetId}`, ...vehicle })

  return actions
}

/** Every action this QR offers, before the viewer filter. */
export const buildScanActions = (input: ScanMenuInput): ScanAction[] => {
  if (input.targetType === 'vehicle') return buildVehicleScanActions(input)

  const { config, targetType } = input
  const isAsset = targetType === 'asset'
  const outOfService = input.assetStatus === 'out_of_service'
  const retired = input.assetStatus === 'retired'
  const actions: ScanAction[] = []

  if (config.reportIssue) {
    actions.push({ id: 'report_issue', label: 'Report an issue', description: 'Tell the safety team about a problem here. Creates a Corrective Action.' })
  }

  if (targetType !== 'form' && !retired) {
    for (const frequency of SCAN_FREQUENCIES) {
      const templateId = config.inspectionTemplates[frequency]

      if (!templateId) continue
      actions.push({
        id: `inspect_${frequency}` as ScanActionId,
        label: `${SCAN_FREQUENCY_LABELS[frequency]} inspection`,
        description: `Start the ${SCAN_FREQUENCY_LABELS[frequency].toLowerCase()} inspection checklist.`,
        frequency,
        templateId
      })
    }
  }

  if (isAsset && !retired) {
    if (!outOfService && config.markOutOfService) {
      actions.push({ id: 'out_of_service', label: 'Mark out of service', description: 'Tag this equipment out so nobody uses it until it is fixed.' })
    }

    if (outOfService && config.returnToService) {
      actions.push({ id: 'return_to_service', label: 'Return to service', description: 'The problem is fixed and the equipment is safe to use.' })
    }
  }

  if (isAsset && config.history) {
    actions.push({ id: 'history', label: 'Equipment history', description: 'Recent inspections, issues and service status changes.' })
  }

  if (isAsset && config.lotoView && input.lotoAvailable) {
    actions.push({
      id: 'view_loto',
      label: 'Lockout / Tagout procedure',
      description: 'Open the approved energy control procedure.',
      href: `/q/${input.token}/loto`
    })
  }

  for (const form of input.forms || []) {
    actions.push({
      id: 'fill_form',
      label: `Fill out: ${form.title}`,
      description: 'Opens the form in Forge. Requires sign-in.',
      formTemplateId: form.id,
      href: `/forms/fill/${form.id}`
    })
  }

  if (isAsset) {
    actions.push({ id: 'open_record', label: 'Open equipment record', description: 'The full asset record in Forge.', href: `/assets/${input.targetId}` })
  }

  return actions
}

/** Vehicle actions: as for assets, with fleet permissions for signed-in users. */
const canUseVehicleScanAction = (action: ScanAction, viewer: ScanViewer, accessMode: ScanAccessMode, config: QrActionConfig): boolean => {
  switch (action.id) {
    case 'dvir_pre_trip':
    case 'dvir_post_trip':
      return viewer.kind === 'employee' || has(viewer, 'fleet.dvir')
    case 'report_issue':
      return viewer.kind !== 'anonymous' || accessMode === 'public_report'
    case 'out_of_service':
      return viewer.kind === 'employee' || has(viewer, 'qr_management.service_status', 'fleet.edit')
    case 'return_to_service':
      return (viewer.kind === 'employee' && config.employeeReturnToService) || has(viewer, 'qr_management.service_status', 'fleet.edit')
    case 'history':
      return viewer.kind === 'employee' || has(viewer, 'fleet.view', 'qr_management.view_scans')
    case 'open_record':
      return has(viewer, 'fleet.view')
    default:
      return false
  }
}

/**
 * Whether the viewer may use an action now. An employee identified on this QR is a field worker:
 * they may report, inspect, tag out and view history, and return to service only when the QR allows it.
 */
export const canUseScanAction = (action: ScanAction, viewer: ScanViewer, accessMode: ScanAccessMode, config: QrActionConfig): boolean => {
  if (action.subject === 'vehicle') return canUseVehicleScanAction(action, viewer, accessMode, config)

  switch (action.id) {
    case 'view_loto':
      return true
    case 'report_issue':
      return viewer.kind !== 'anonymous' || accessMode === 'public_report'
    case 'inspect_daily':
    case 'inspect_weekly':
    case 'inspect_monthly':
      return viewer.kind === 'employee' || has(viewer, 'inspections.create')
    case 'out_of_service':
      return viewer.kind === 'employee' || has(viewer, 'qr_management.service_status', 'assets_equipment.edit')
    case 'return_to_service':
      return (viewer.kind === 'employee' && config.employeeReturnToService) || has(viewer, 'qr_management.service_status', 'assets_equipment.edit')
    case 'history':
      return viewer.kind === 'employee' || has(viewer, 'assets_equipment.view', 'qr_management.view_scans')
    case 'fill_form':
      return has(viewer, 'forms.submit')
    case 'open_record':
      return has(viewer, 'assets_equipment.view')
    default:
      return false
  }
}

/**
 * The menu for this viewer: usable actions, plus locked ones the viewer could unlock by entering an
 * employee number or signing in (so a field worker sees what identifying gets them). Actions the viewer
 * could never use are dropped.
 */
export const scanMenuForViewer = (actions: ScanAction[], viewer: ScanViewer, accessMode: ScanAccessMode, config: QrActionConfig): ScanAction[] => {
  const asEmployee: ScanViewer = { kind: 'employee', personnelId: '', name: '' }
  const identifyPossible = viewer.kind === 'anonymous' && allowsEmployeeIdentification(accessMode)

  return actions.flatMap(action => {
    if (canUseScanAction(action, viewer, accessMode, config)) return [action]
    if (viewer.kind === 'user') return []
    if (identifyPossible && canUseScanAction(action, asEmployee, accessMode, config)) return [{ ...action, locked: 'identify' as const }]
    if (action.id === 'fill_form' || action.id === 'open_record' || viewer.kind === 'anonymous') return [{ ...action, locked: 'sign_in' as const }]

    return []
  })
}

/** Path of the public scan page for a QR token. */
export const scanPath = (token: string) => `/scan/${token}`

export const QR_TOKEN_PATTERN = /^[a-f0-9]{48}$/i

/**
 * Pulls a QR token out of whatever a camera or a person typed: a full /q/<token> or /scan/<token> URL,
 * a path, or the bare 48-character token. Returns null when nothing usable is found.
 */
export const extractTokenFromQrText = (text: string): string | null => {
  const value = (text || '').trim()

  if (!value) return null
  if (QR_TOKEN_PATTERN.test(value)) return value.toLowerCase()

  const match = value.match(/\/(?:q|scan)\/([a-f0-9]{48})(?=$|[/?#])/i)

  return match ? match[1].toLowerCase() : null
}

/** The inspection name for a scan-started inspection, as in 1.0 ("Forklift 7 — Daily inspection"). */
export const scanInspectionTitle = (targetName: string, frequency: ScanFrequency) => `${targetName} — ${SCAN_FREQUENCY_LABELS[frequency]} inspection`

/** Display name for a personnel row. */
export const personnelDisplayName = (person: { first_name?: string | null; last_name?: string | null; preferred_name?: string | null } | null | undefined) =>
  person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Employee' : 'Employee'
