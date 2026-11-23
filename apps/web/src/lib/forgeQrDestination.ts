// Pure helpers for QR Links admin pages: scan log labels, record links, the 30-day scan summary and which
// default actions a QR target allows. No database, no Next (unit-tested in tests/port-s10-qr-admin.test.cjs).
import { SCAN_EVENT_LABELS, SCAN_FREQUENCIES } from './forgeScanRules.ts'
import type { QrActionConfig, ScanEventAction, ScanTargetType } from './forgeScanRules.ts'

// Turns a recorded QR scan destination path into a label people can read.
// Scan routes send people to one of three asset pages or the public LOTO view (see app/q/[token]/route.ts).
// The LOTO view is logged as /q/<QR number>/loto so the secret token is not stored in scan history.
export const describeQrDestination = (path: string | null | undefined, assetName?: string | null) => {
  if (!path) return '—'

  const target = assetName ? ' · ' + assetName : ''

  if (/^\/assets\/[^/]+\/maintenance\/create\/?$/.test(path)) return 'Log maintenance' + target
  if (/^\/assets\/[^/]+\/meter-readings\/create\/?$/.test(path)) return 'Record meter reading' + target
  if (/^\/assets\/[^/]+\/?$/.test(path)) return 'Open asset' + target
  if (/^\/q\/[^/]+\/loto\/?$/.test(path)) return 'View LOTO procedures' + target

  return path
}

export const QR_TARGET_TYPE_LABELS: Record<ScanTargetType, string> = {
  asset: 'Asset / equipment',
  location: 'Location',
  form: 'Form',
  vehicle: 'Fleet vehicle',
  area: 'Area (Waypoint)'
}

/** Actions an asset QR can open straight away; location, form and vehicle QRs always open the scan menu. */
export const QR_ASSET_DEFAULT_ACTIONS = ['scan_menu', 'asset_record', 'maintenance', 'meter_reading', 'loto_view'] as const

export const allowedQrDefaultActions = (targetType: string): string[] =>
  targetType === 'asset' ? [...QR_ASSET_DEFAULT_ACTIONS] : ['scan_menu']

/** Plain-language help for each access mode (shown under the picker). */
export const QR_ACCESS_MODE_HELP: Record<string, string> = {
  signed_in: 'Only people who sign in to Forge can use the scan menu.',
  employee_number: 'Field workers without a login can type their employee number to use the scan menu. Signed-in users can too.',
  public_report: 'Anyone who scans can report an issue without signing in. Everything else needs an employee number or sign-in.'
}

type ScanRow = {
  action?: string | null
  result?: string | null
  destination_path?: string | null
}

/**
 * One scan-log row as a label. Legacy rows (written by the /q redirect) have action 'open' and a
 * destination path; scan-menu rows have the action that was taken.
 */
export const describeQrScanEvent = (scan: ScanRow, assetName?: string | null) => {
  const action = scan.action || 'open'

  if (action === 'open') return scan.destination_path ? describeQrDestination(scan.destination_path, assetName) : 'Opened scan menu'

  return SCAN_EVENT_LABELS[action as ScanEventAction] || action.replaceAll('_', ' ')
}

export const QR_SCAN_RESULT_LABELS: Record<string, string> = { ok: 'OK', denied: 'Denied', failed: 'Failed' }

/** Where a scan-log record points, or null when there is no page for it. */
export const scanRecordHref = (recordType: string | null | undefined, recordId: string | null | undefined): string | null => {
  if (!recordType || !recordId) return null

  switch (recordType) {
    case 'asset':
      return '/assets/' + recordId
    case 'vehicle':
      return '/fleet/vehicles/' + recordId
    case 'fleet_dvir':
      return '/fleet/dvirs/' + recordId
    case 'inspection':
      return '/inspections/' + recordId
    case 'corrective_action':
      return '/corrective-actions/' + recordId
    case 'form_submission':
      return '/forms/submissions/' + recordId
    case 'form':
    case 'form_template':
      return '/forms/fill/' + recordId
    case 'area':
      return '/waypoint/' + recordId
    case 'location':
      return null
    default:
      return null
  }
}

export const SCAN_RECORD_TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  vehicle: 'Vehicle',
  area: 'Area',
  fleet_dvir: 'DVIR',
  inspection: 'Inspection',
  corrective_action: 'Corrective Action',
  form_submission: 'Form submission',
  form: 'Form',
  form_template: 'Form',
  issue_report: 'Issue report',
  qr_issue_report: 'Issue report',
  asset_status_history: 'Status change'
}

export type QrScanSummary = {
  scans: number
  inspectionsStarted: number
  inspectionsCompleted: number
  issuesReported: number
  outOfService: number
  returnedToService: number
}

/**
 * Counts for the last N days, from forge_qr_scans.action (the names the scan pages actually write, see
 * SCAN_EVENT_ACTIONS). A scan is an 'open' row, including legacy redirect rows that only have a destination.
 * Only successful rows count.
 */
export const summarizeQrScans = (
  rows: Array<ScanRow & { scanned_at?: string | null }>,
  { now = new Date(), days = 30 }: { now?: Date; days?: number } = {}
): QrScanSummary => {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000
  const summary: QrScanSummary = { scans: 0, inspectionsStarted: 0, inspectionsCompleted: 0, issuesReported: 0, outOfService: 0, returnedToService: 0 }

  for (const row of rows) {
    const at = row.scanned_at ? new Date(row.scanned_at).getTime() : NaN

    if (!Number.isFinite(at) || at < since || at > now.getTime() + 60_000) continue
    if ((row.result || 'ok') !== 'ok') continue

    switch (row.action || 'open') {
      case 'open':
        summary.scans += 1
        break
      case 'inspection_start':
        summary.inspectionsStarted += 1
        break
      case 'inspection_complete':
        summary.inspectionsCompleted += 1
        break
      case 'report_issue':
        summary.issuesReported += 1
        break
      case 'out_of_service':
        summary.outOfService += 1
        break
      case 'return_to_service':
        summary.returnedToService += 1
        break
    }
  }

  return summary
}

/** Every inspection template and form id a config points at (to check they belong to the company). */
export const qrConfigReferences = (config: QrActionConfig) => ({
  inspectionTemplateIds: Array.from(new Set(SCAN_FREQUENCIES.map(frequency => config.inspectionTemplates[frequency]).filter((id): id is string => Boolean(id)))),
  formTemplateIds: [...config.formTemplateIds]
})

/** forge_asset_status_history.source as people read it. */
export const ASSET_STATUS_SOURCE_LABELS: Record<string, string> = {
  record_edit: 'Asset record edited',
  qr_scan: 'QR scan',
  qr_issue: 'Issue reported from a QR scan',
  qr_inspection: 'Inspection started from a QR scan',
  inspection: 'Inspection',
  import: 'Import'
}

const FALLBACK_STATUS_LABELS: Record<string, string> = { active: 'In service', out_of_service: 'Out of service', retired: 'Retired' }

/** An asset status for the history table; a missing "from" status reads as "New". */
export const assetStatusLabel = (status: string | null | undefined, labels: Record<string, string> = {}) => {
  if (!status) return 'New'

  return labels[status] || FALLBACK_STATUS_LABELS[status] || status.replaceAll('_', ' ')
}
