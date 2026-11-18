import { createServiceRoleClient } from '@repo/supabase/server'

import { DVIR_FOLLOW_UP_LABELS, DVIR_TRIP_LABELS, MAINTENANCE_TYPE_LABELS, VEHICLE_STATUS_LABELS, dvirDefects, dvirFollowUp } from '@/lib/forgeFleetRules'
import type { DvirTripType, MaintenanceType, VehicleStatus } from '@/lib/forgeFleetRules'
import type { ScanQr } from '@/lib/forgeScanContext'
import type { ScanEventAction } from '@/lib/forgeScanRules'
import { SCAN_EVENT_LABELS, personnelDisplayName } from '@/lib/forgeScanRules'

/**
 * Port slice 10: equipment history for the scan page (/scan/<token>/history), newest first. Merges
 * service status changes, inspections on the asset (direct or linked through forge_record_links),
 * issue reports with their Corrective Action number, and this QR's scan log. Server only.
 */

export type ScanHistoryKind = 'status' | 'inspection' | 'issue' | 'scan' | 'dvir' | 'maintenance'

export type ScanHistoryRow = {
  id: string
  kind: ScanHistoryKind
  at: string
  title: string
  detail: string | null
  who: string | null

  /** In-app link; the page shows it to signed-in users only. */
  href: string | null
}

export const SCAN_HISTORY_LIMIT = 60

const STATUS_LABELS: Record<string, string> = {
  active: 'In service',
  out_of_service: 'Out of service',
  maintenance: 'In maintenance',
  reserved: 'Reserved',
  retired: 'Retired'
}

const SOURCE_LABELS: Record<string, string> = {
  record_edit: 'Changed on the equipment record',
  qr_scan: 'From a QR scan',
  qr_issue: 'From an issue report',
  qr_inspection: 'From a scan inspection',
  dvir: 'From a DVIR',
  dvir_certified: 'Repairs certified on a DVIR',
  disposal: 'Removed from the fleet',
  inspection: 'From an inspection',
  import: 'Imported'
}

/** Scan-log actions already shown through their own rows (status history, issue reports). */
const DUPLICATE_SCAN_ACTIONS = ['out_of_service', 'return_to_service', 'report_issue', 'history']

const statusLabel = (status: string | null) => (status ? STATUS_LABELS[status] || status : null)

const isoDate = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T12:00:00.000Z' : value || null)

export const loadScanHistory = async ({ qr, assetId }: { qr: ScanQr; assetId: string }): Promise<ScanHistoryRow[]> => {
  const supabase = createServiceRoleClient() as any
  const org = qr.organizationId
  const limit = SCAN_HISTORY_LIMIT

  const [statusRes, directInspections, linksFrom, linksTo, issuesRes, scansRes] = await Promise.all([
    supabase
      .from('forge_asset_status_history')
      .select('id, from_status, to_status, reason, notes, source, actor_name, actor_user_id, actor_personnel_id, changed_at')
      .eq('organization_id', org)
      .eq('asset_id', assetId)
      .order('changed_at', { ascending: false })
      .limit(limit),
    supabase.from('forge_inspections').select('id').eq('organization_id', org).eq('asset_id', assetId).order('inspection_date', { ascending: false }).limit(limit),
    supabase
      .from('forge_record_links')
      .select('source_resource_id')
      .eq('organization_id', org)
      .is('archived_at', null)
      .eq('source_resource_type', 'inspection')
      .eq('target_resource_type', 'asset')
      .eq('target_resource_id', assetId)
      .limit(limit),
    supabase
      .from('forge_record_links')
      .select('target_resource_id')
      .eq('organization_id', org)
      .is('archived_at', null)
      .eq('source_resource_type', 'asset')
      .eq('source_resource_id', assetId)
      .eq('target_resource_type', 'inspection')
      .limit(limit),
    supabase
      .from('forge_qr_issue_reports')
      .select('id, title, priority, immediate_hazard, marked_out_of_service, anonymous, reporter_name, corrective_action_id, created_at')
      .eq('organization_id', org)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('forge_qr_scans')
      .select('id, action, result, auth_user_id, personnel_id, scanned_at')
      .eq('organization_id', org)
      .eq('qr_code_id', qr.id)
      .not('action', 'in', `(${DUPLICATE_SCAN_ACTIONS.join(',')})`)
      .order('scanned_at', { ascending: false })
      .limit(limit)
  ])

  const inspectionIds = [
    ...new Set<string>([
      ...(directInspections.data || []).map((row: any) => row.id),
      ...(linksFrom.data || []).map((row: any) => row.source_resource_id),
      ...(linksTo.data || []).map((row: any) => row.target_resource_id)
    ])
  ]

  const issues = issuesRes.data || []
  const caIds = [...new Set<string>(issues.map((row: any) => row.corrective_action_id).filter(Boolean))]

  const [inspectionsRes, caRes] = await Promise.all([
    inspectionIds.length
      ? supabase
          .from('forge_inspections')
          .select('id, inspection_number, template_name_snapshot, status, result, inspection_date, completed_at, started_at, created_at, inspector_user_id, inspector_personnel_id')
          .eq('organization_id', org)
          .in('id', inspectionIds)
      : { data: [] },
    caIds.length ? supabase.from('forge_corrective_actions').select('id, action_number').eq('organization_id', org).in('id', caIds) : { data: [] }
  ])

  const inspections = inspectionsRes.data || []
  const statuses = statusRes.data || []
  const scans = scansRes.data || []

  const personnelIds = [
    ...new Set<string>(
      [...statuses.map((row: any) => row.actor_personnel_id), ...inspections.map((row: any) => row.inspector_personnel_id), ...scans.map((row: any) => row.personnel_id)].filter(Boolean)
    )
  ]

  const userIds = [
    ...new Set<string>(
      [...statuses.map((row: any) => row.actor_user_id), ...inspections.map((row: any) => row.inspector_user_id), ...scans.map((row: any) => row.auth_user_id)].filter(Boolean)
    )
  ]

  const [peopleRes, usersRes] = await Promise.all([
    personnelIds.length
      ? supabase.from('forge_personnel').select('id, first_name, last_name, preferred_name').eq('organization_id', org).in('id', personnelIds)
      : { data: [] },
    userIds.length ? supabase.from('users').select('user_id, name, email').in('user_id', userIds) : { data: [] }
  ])

  const people = new Map<string, string>((peopleRes.data || []).map((row: any) => [row.id, personnelDisplayName(row)]))
  const users = new Map<string, string>((usersRes.data || []).map((row: any) => [row.user_id, row.name || row.email || 'Forge user']))
  const caNumbers = new Map<string, string>((caRes.data || []).map((row: any) => [row.id, row.action_number]))

  const nameOf = (personnelId: string | null, userId: string | null, fallback: string | null = null) =>
    (personnelId && people.get(personnelId)) || (userId && users.get(userId)) || fallback

  const rows: ScanHistoryRow[] = []

  for (const row of statuses) {
    const to = statusLabel(row.to_status)
    const from = statusLabel(row.from_status)

    rows.push({
      id: 'status-' + row.id,
      kind: 'status',
      at: row.changed_at,
      title: row.to_status === 'out_of_service' ? 'Marked out of service' : row.to_status === 'active' && row.from_status === 'out_of_service' ? 'Returned to service' : `Status changed to ${to}`,
      detail: [from ? `${from} → ${to}` : null, row.reason ? `Reason: ${row.reason}` : null, row.notes ? `Notes: ${row.notes}` : null, SOURCE_LABELS[row.source] || null]
        .filter(Boolean)
        .join(' · '),
      who: row.actor_name || nameOf(row.actor_personnel_id, row.actor_user_id),
      href: null
    })
  }

  for (const row of inspections) {
    const result = row.result ? String(row.result).replace(/_/g, ' ') : null

    rows.push({
      id: 'inspection-' + row.id,
      kind: 'inspection',
      at: row.completed_at || row.started_at || isoDate(row.inspection_date) || row.created_at,
      title: `${row.template_name_snapshot || 'Inspection'}${row.inspection_number ? ` (${row.inspection_number})` : ''}`,
      detail: [`Status: ${String(row.status || '').replace(/_/g, ' ')}`, result ? `Result: ${result}` : null].filter(Boolean).join(' · '),
      who: nameOf(row.inspector_personnel_id, row.inspector_user_id),
      href: `/inspections/${row.id}`
    })
  }

  for (const row of issues) {
    const caNumber = row.corrective_action_id ? caNumbers.get(row.corrective_action_id) || null : null

    rows.push({
      id: 'issue-' + row.id,
      kind: 'issue',
      at: row.created_at,
      title: `Issue reported: ${row.title}`,
      detail: [
        `Priority: ${row.priority}`,
        row.immediate_hazard ? 'Immediate hazard' : null,
        row.marked_out_of_service ? 'Marked out of service' : null,
        caNumber ? `Corrective Action ${caNumber}` : null
      ]
        .filter(Boolean)
        .join(' · '),
      who: row.anonymous ? 'Anonymous' : row.reporter_name || null,
      href: row.corrective_action_id ? `/corrective-actions/${row.corrective_action_id}` : null
    })
  }

  for (const row of scans) {
    const label = SCAN_EVENT_LABELS[row.action as ScanEventAction] || row.action
    const denied = row.result !== 'ok'

    rows.push({
      id: 'scan-' + row.id,
      kind: 'scan',
      at: row.scanned_at,
      title: row.action === 'identify' && denied ? 'Employee number not recognized' : denied ? `${label} (refused)` : label,
      detail: null,
      who: nameOf(row.personnel_id, row.auth_user_id),
      href: null
    })
  }

  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit)
}

/**
 * Port slice 11: vehicle history for the scan page. Merges the vehicle's status history, DVIRs (number,
 * trip, defects, follow-up), maintenance (open / completed), scan issue reports and this QR's scan log.
 */
export const loadVehicleScanHistory = async ({ qr, vehicleId }: { qr: ScanQr; vehicleId: string }): Promise<ScanHistoryRow[]> => {
  const supabase = createServiceRoleClient() as any
  const org = qr.organizationId
  const limit = SCAN_HISTORY_LIMIT

  const [statusRes, dvirRes, maintenanceRes, issuesRes, scansRes] = await Promise.all([
    supabase
      .from('forge_fleet_status_history')
      .select('id, from_status, to_status, reason, source, actor_name, actor_user_id, actor_personnel_id, changed_at')
      .eq('organization_id', org)
      .eq('vehicle_id', vehicleId)
      .order('changed_at', { ascending: false })
      .limit(limit),
    supabase
      .from('forge_fleet_dvirs')
      .select('id, dvir_number, trip_type, inspection_date, status, items, mechanic_signature, review_signature, driver_name, driver_personnel_id, driver_user_id, created_at')
      .eq('organization_id', org)
      .eq('vehicle_id', vehicleId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('forge_fleet_maintenance')
      .select('id, maintenance_number, title, maintenance_type, status, due_on, completed_on, created_at, updated_at')
      .eq('organization_id', org)
      .eq('vehicle_id', vehicleId)
      .in('status', ['open', 'completed'])
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('forge_qr_issue_reports')
      .select('id, title, priority, immediate_hazard, marked_out_of_service, anonymous, reporter_name, corrective_action_id, created_at')
      .eq('organization_id', org)
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('forge_qr_scans')
      .select('id, action, result, auth_user_id, personnel_id, scanned_at')
      .eq('organization_id', org)
      .eq('qr_code_id', qr.id)
      .not('action', 'in', `(${[...DUPLICATE_SCAN_ACTIONS, 'dvir_submit'].join(',')})`)
      .order('scanned_at', { ascending: false })
      .limit(limit)
  ])

  const statuses = statusRes.data || []
  const dvirs = dvirRes.data || []
  const maintenance = maintenanceRes.data || []
  const issues = issuesRes.data || []
  const scans = scansRes.data || []
  const caIds = [...new Set<string>(issues.map((row: any) => row.corrective_action_id).filter(Boolean))]

  const personnelIds = [
    ...new Set<string>(
      [...statuses.map((row: any) => row.actor_personnel_id), ...dvirs.map((row: any) => row.driver_personnel_id), ...scans.map((row: any) => row.personnel_id)].filter(Boolean)
    )
  ]

  const userIds = [
    ...new Set<string>([...statuses.map((row: any) => row.actor_user_id), ...dvirs.map((row: any) => row.driver_user_id), ...scans.map((row: any) => row.auth_user_id)].filter(Boolean))
  ]

  const [peopleRes, usersRes, caRes] = await Promise.all([
    personnelIds.length
      ? supabase.from('forge_personnel').select('id, first_name, last_name, preferred_name').eq('organization_id', org).in('id', personnelIds)
      : { data: [] },
    userIds.length ? supabase.from('users').select('user_id, name, email').in('user_id', userIds) : { data: [] },
    caIds.length ? supabase.from('forge_corrective_actions').select('id, action_number').eq('organization_id', org).in('id', caIds) : { data: [] }
  ])

  const people = new Map<string, string>((peopleRes.data || []).map((row: any) => [row.id, personnelDisplayName(row)]))
  const users = new Map<string, string>((usersRes.data || []).map((row: any) => [row.user_id, row.name || row.email || 'Forge user']))
  const caNumbers = new Map<string, string>((caRes.data || []).map((row: any) => [row.id, row.action_number]))

  const nameOf = (personnelId: string | null, userId: string | null, fallback: string | null = null) =>
    (personnelId && people.get(personnelId)) || (userId && users.get(userId)) || fallback

  const vehicleStatus = (status: string | null) => (status ? VEHICLE_STATUS_LABELS[status as VehicleStatus] || status : null)
  const rows: ScanHistoryRow[] = []

  for (const row of statuses) {
    const to = vehicleStatus(row.to_status)
    const from = vehicleStatus(row.from_status)

    rows.push({
      id: 'status-' + row.id,
      kind: 'status',
      at: row.changed_at,
      title:
        row.to_status === 'out_of_service'
          ? 'Marked out of service'
          : row.to_status === 'active' && row.from_status === 'out_of_service'
            ? 'Returned to service'
            : `Status changed to ${to}`,
      detail: [
        from ? `${from} → ${to}` : null,
        row.reason ? `Reason: ${row.reason}` : null,
        row.source === 'record_edit' ? 'Changed on the vehicle record' : SOURCE_LABELS[row.source] || null
      ]
        .filter(Boolean)
        .join(' · '),
      who: row.actor_name || nameOf(row.actor_personnel_id, row.actor_user_id),
      href: null
    })
  }

  for (const row of dvirs) {
    const defects = dvirDefects(Array.isArray(row.items) ? row.items : []).length

    rows.push({
      id: 'dvir-' + row.id,
      kind: 'dvir',
      at: row.created_at,
      title: `${DVIR_TRIP_LABELS[row.trip_type as DvirTripType] || 'DVIR'} DVIR (${row.dvir_number})`,
      detail: [defects ? `${defects} defect${defects === 1 ? '' : 's'}` : 'No defects', defects ? DVIR_FOLLOW_UP_LABELS[dvirFollowUp(row)] : null].filter(Boolean).join(' · '),
      who: row.driver_name || nameOf(row.driver_personnel_id, row.driver_user_id),
      href: `/fleet/dvirs/${row.id}`
    })
  }

  for (const row of maintenance) {
    const done = row.status === 'completed'

    rows.push({
      id: 'maintenance-' + row.id,
      kind: 'maintenance',
      at: done ? isoDate(row.completed_on) || row.updated_at : row.created_at,
      title: `${done ? 'Maintenance completed' : 'Maintenance open'}: ${row.title} (${row.maintenance_number})`,
      detail: [MAINTENANCE_TYPE_LABELS[row.maintenance_type as MaintenanceType] || null, !done && row.due_on ? `Due ${row.due_on}` : null].filter(Boolean).join(' · ') || null,
      who: null,
      href: `/fleet/maintenance/${row.id}`
    })
  }

  for (const row of issues) {
    const caNumber = row.corrective_action_id ? caNumbers.get(row.corrective_action_id) || null : null

    rows.push({
      id: 'issue-' + row.id,
      kind: 'issue',
      at: row.created_at,
      title: `Issue reported: ${row.title}`,
      detail: [
        `Priority: ${row.priority}`,
        row.immediate_hazard ? 'Immediate hazard' : null,
        row.marked_out_of_service ? 'Marked out of service' : null,
        caNumber ? `Corrective Action ${caNumber}` : null
      ]
        .filter(Boolean)
        .join(' · '),
      who: row.anonymous ? 'Anonymous' : row.reporter_name || null,
      href: row.corrective_action_id ? `/corrective-actions/${row.corrective_action_id}` : null
    })
  }

  for (const row of scans) {
    const label = SCAN_EVENT_LABELS[row.action as ScanEventAction] || row.action
    const denied = row.result !== 'ok'

    rows.push({
      id: 'scan-' + row.id,
      kind: 'scan',
      at: row.scanned_at,
      title: row.action === 'identify' && denied ? 'Employee number not recognized' : denied ? `${label} (refused)` : label,
      detail: null,
      who: nameOf(row.personnel_id, row.auth_user_id),
      href: null
    })
  }

  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit)
}
