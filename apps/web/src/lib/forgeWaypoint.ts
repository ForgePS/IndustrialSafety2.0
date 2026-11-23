import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveLookup } from '@/lib/forgeLookups'
import { getScopedLocationIds } from '@/lib/forgeQr'
import {
  ACTIVE_LOTO_STATUSES,
  OPEN_CAPA_STATUSES,
  WAYPOINT_HAZARD_LOOKUP,
  WAYPOINT_PPE_LOOKUP,
  areaEmergencyRows,
  areaStatus,
  optionLabels,
  type AreaRow,
  type AreaStatus,
  type AreaStatusInput
} from '@/lib/forgeWaypointRules'

/**
 * Forge Waypoint, phase 0: server side of areas. Server only. Every Waypoint page and action, and the scan page
 * for area QRs, loads areas through here.
 *
 * Scope: an area follows its location. organization = every area; location / division = areas at the user's
 * locations (or their divisions' locations); own / assigned = areas at the user's assigned locations.
 */

const db = () => createServiceRoleClient() as any

export const AREA_COLUMNS =
  'id, organization_id, location_id, name, code, description, hazards, required_ppe, restricted_entry, entry_requirements, nearest_exit, muster_point, nearest_eyewash, nearest_extinguisher, nearest_first_aid, emergency_notes, archived_at, archived_by, archive_reason, created_by, updated_by, created_at, updated_at'

export type Area = AreaRow & {
  id: string
  organization_id: string
  archived_at: string | null
  archived_by: string | null
  archive_reason: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  location_name: string | null
}

export type WaypointContext = {
  user: { id: string }
  activeOrganization: { id: string; name?: string | null }
  access: { effective: { permissionKey: string; allowed: boolean; scope: string | null }[] }
}

export const waypointGrant = (
  context: Pick<WaypointContext, 'access'>,
  permissionKey: 'waypoint.view' | 'waypoint.manage'
) => {
  const grant = context.access.effective.find(item => item.permissionKey === permissionKey && item.allowed)

  return grant ? { scope: grant.scope ?? 'organization' } : null
}

/** Location ids the user's grant covers, or null for every location. */
export const waypointLocationIds = async (
  context: WaypointContext,
  permissionKey: 'waypoint.view' | 'waypoint.manage'
): Promise<string[] | null> => {
  const grant = waypointGrant(context, permissionKey)

  if (!grant) return []

  const scope = grant.scope === 'own' || grant.scope === 'assigned' ? 'location' : grant.scope

  return getScopedLocationIds({ organizationId: context.activeOrganization.id, userId: context.user.id, scope })
}

export const locationInList = (ids: string[] | null, locationId: string | null | undefined) =>
  ids === null || Boolean(locationId && ids.includes(locationId))

const toArea = (row: any): Area => ({
  ...row,
  hazards: row.hazards || [],
  required_ppe: row.required_ppe || [],
  location_name: row.locations?.name ?? null
})

/** One area of the company (archived or not), or null. */
export const loadArea = async (organizationId: string, areaId: string): Promise<Area | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(areaId || '')) return null

  const { data } = await db()
    .from('forge_areas')
    .select(`${AREA_COLUMNS}, locations(name)`)
    .eq('organization_id', organizationId)
    .eq('id', areaId)
    .maybeSingle()

  return data ? toArea(data) : null
}

/** The area when the user's grant covers its location. */
export const loadAreaForUser = async (
  context: WaypointContext,
  areaId: string,
  permissionKey: 'waypoint.view' | 'waypoint.manage' = 'waypoint.view'
) => {
  const area = await loadArea(context.activeOrganization.id, areaId)

  if (!area) return null

  const ids = await waypointLocationIds(context, permissionKey)

  return locationInList(ids, area.location_id) ? area : null
}

export const listAreas = async ({
  organizationId,
  locationIds,
  locationId = null,
  archived = false,
  search = ''
}: {
  organizationId: string
  locationIds: string[] | null
  locationId?: string | null
  archived?: boolean
  search?: string
}): Promise<Area[]> => {
  if (locationIds && !locationIds.length) return []

  let query = db()
    .from('forge_areas')
    .select(`${AREA_COLUMNS}, locations(name)`)
    .eq('organization_id', organizationId)
    .order('name')
    .limit(500)

  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  if (locationIds) query = query.in('location_id', locationIds)
  if (locationId) query = query.eq('location_id', locationId)

  const term = search
    .trim()
    .replace(/[%_,()]/g, ' ')
    .trim()

  if (term) query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%`)

  const { data } = await query

  return (data || []).map(toArea)
}

export type AreaEquipment = {
  id: string
  name: string
  assetNumber: string | null
  status: string
  areaId: string | null
  lockedOut: boolean
}

export type AreaSignals = AreaStatusInput & { equipment: AreaEquipment[] }

const emptySignals = (area: Pick<Area, 'restricted_entry' | 'entry_requirements'>): AreaSignals => ({
  restrictedEntry: area.restricted_entry,
  entryRequirements: area.entry_requirements,
  activeLockouts: [],
  outOfService: [],
  openIssues: 0,
  equipment: []
})

/**
 * Everything the status light needs, for many areas in a few queries: equipment in each area (not retired),
 * lockouts in progress on it, and open issues reported from the area or its equipment.
 */
export const loadAreaSignals = async (
  organizationId: string,
  areas: Pick<Area, 'id' | 'restricted_entry' | 'entry_requirements'>[]
): Promise<Map<string, AreaSignals>> => {
  const result = new Map<string, AreaSignals>(areas.map(area => [area.id, emptySignals(area)]))

  if (!areas.length) return result

  const supabase = db()
  const areaIds = areas.map(area => area.id)

  const { data: assetRows } = await supabase
    .from('forge_assets')
    .select('id, name, asset_number, status, area_id')
    .eq('organization_id', organizationId)
    .in('area_id', areaIds)
    .neq('status', 'retired')
    .order('name')

  const assets = (assetRows || []) as any[]
  const assetIds = assets.map(asset => asset.id)
  const areaOfAsset = new Map<string, string>(assets.map(asset => [asset.id, asset.area_id]))

  const [{ data: lockRows }, { data: reportRows }] = await Promise.all([
    assetIds.length
      ? supabase
          .from('forge_loto_applications')
          .select('asset_id')
          .eq('organization_id', organizationId)
          .in('asset_id', assetIds)
          .in('status', [...ACTIVE_LOTO_STATUSES])
      : Promise.resolve({ data: [] }),
    supabase
      .from('forge_qr_issue_reports')
      .select('id, area_id, asset_id, corrective_action_id')
      .eq('organization_id', organizationId)
      .not('corrective_action_id', 'is', null)
      .or(`area_id.in.(${areaIds.join(',')})${assetIds.length ? `,asset_id.in.(${assetIds.join(',')})` : ''}`)
  ])

  const locked = new Set<string>((lockRows || []).map((row: any) => row.asset_id))

  for (const asset of assets) {
    const signals = result.get(asset.area_id)

    if (!signals) continue

    const item: AreaEquipment = {
      id: asset.id,
      name: asset.name,
      assetNumber: asset.asset_number,
      status: asset.status,
      areaId: asset.area_id,
      lockedOut: locked.has(asset.id)
    }

    signals.equipment.push(item)
    if (item.lockedOut) signals.activeLockouts.push({ assetName: asset.name })
    if (asset.status === 'out_of_service') signals.outOfService.push({ assetName: asset.name })
  }

  const reports = (reportRows || []) as any[]
  const capaIds = [...new Set(reports.map(report => report.corrective_action_id as string))]

  if (capaIds.length) {
    const { data: capaRows } = await supabase
      .from('forge_corrective_actions')
      .select('id')
      .eq('organization_id', organizationId)
      .in('id', capaIds)
      .in('status', [...OPEN_CAPA_STATUSES])

    const open = new Set<string>((capaRows || []).map((row: any) => row.id))
    const counted = new Set<string>()

    for (const report of reports) {
      if (!open.has(report.corrective_action_id) || counted.has(report.id)) continue

      const areaId = report.area_id || areaOfAsset.get(report.asset_id)
      const signals = areaId ? result.get(areaId) : null

      if (!signals) continue
      counted.add(report.id)
      signals.openIssues += 1
    }
  }

  return result
}

export const statusForArea = (
  signals: AreaSignals | undefined,
  area: Pick<Area, 'restricted_entry' | 'entry_requirements'>,
  detailed = true
): AreaStatus => areaStatus(signals || emptySignals(area), { detailed })

/**
 * Everything the "Before you enter" brief shows for one area. `detailed` (identified or signed-in viewers) adds
 * equipment names and the equipment list; anonymous scanners get the status, PPE, hazards and emergency info.
 */
export const loadAreaBriefing = async (organizationId: string, area: Area, { detailed }: { detailed: boolean }) => {
  const [signalsByArea, lookups] = await Promise.all([
    loadAreaSignals(organizationId, [area]),
    loadAreaLookups(organizationId)
  ])
  const signals = signalsByArea.get(area.id)
  const equipment = signals?.equipment || []
  let scanTokens = new Map<string, string>()

  if (detailed && equipment.length) {
    const { data } = await db()
      .from('forge_qr_codes')
      .select('target_id, token')
      .eq('organization_id', organizationId)
      .eq('target_type', 'asset')
      .eq('default_action', 'scan_menu')
      .eq('status', 'active')
      .is('archived_at', null)
      .in(
        'target_id',
        equipment.map(item => item.id)
      )

    scanTokens = new Map((data || []).map((row: any) => [row.target_id as string, row.token as string]))
  }

  return {
    status: statusForArea(signals, area, detailed),
    description: area.description,
    ppe: optionLabels(area.required_ppe, lookups.ppe),
    hazards: optionLabels(area.hazards, lookups.hazards),
    entryRequirements: area.entry_requirements,
    restrictedEntry: area.restricted_entry,
    emergency: areaEmergencyRows(area),
    emergencyNotes: area.emergency_notes,
    equipment: detailed
      ? equipment.map(item => ({
          id: item.id,
          name: item.name,
          assetNumber: item.assetNumber,
          status: item.status,
          lockedOut: item.lockedOut,
          scanHref: scanTokens.has(item.id) ? `/scan/${scanTokens.get(item.id)}` : null
        }))
      : null
  }
}

/** Active hazard and PPE options for the company (tenant labels and custom options included). */
export const loadAreaLookups = async (organizationId: string) => {
  const [hazards, ppe] = await Promise.all([
    getEffectiveLookup({ organizationId, lookupKey: WAYPOINT_HAZARD_LOOKUP }),
    getEffectiveLookup({ organizationId, lookupKey: WAYPOINT_PPE_LOOKUP })
  ])

  return {
    hazards: hazards.options.map(option => ({ key: option.key, label: option.label, description: option.description })),
    ppe: ppe.options.map(option => ({ key: option.key, label: option.label, description: option.description }))
  }
}

/** Active locations the user may file areas at, for pickers. */
export const loadAreaLocations = async (
  organizationId: string,
  locationIds: string[] | null
): Promise<{ id: string; label: string }[]> => {
  if (locationIds && !locationIds.length) return []

  let query = db()
    .from('locations')
    .select('id, name, code')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name')

  if (locationIds) query = query.in('id', locationIds)

  const { data } = await query

  return (data || []).map((row: any) => ({
    id: row.id as string,
    label: row.code ? `${row.name} (${row.code})` : (row.name as string)
  }))
}

/** Active QR codes pointing at an area (its Area Cards). */
export const loadAreaQrCodes = async (organizationId: string, areaId: string) => {
  const { data } = await db()
    .from('forge_qr_codes')
    .select('id, qr_number, name, status, access_mode, scan_count, last_scanned_at, token')
    .eq('organization_id', organizationId)
    .eq('target_type', 'area')
    .eq('target_id', areaId)
    .is('archived_at', null)
    .order('created_at')

  return (data || []) as {
    id: string
    qr_number: string
    name: string
    status: string
    access_mode: string
    scan_count: number
    last_scanned_at: string | null
    token: string
  }[]
}

/** Equipment at the area's location that is not in another area, for "Add equipment". */
export const loadAssignableEquipment = async (
  organizationId: string,
  area: Pick<Area, 'id' | 'location_id'>
): Promise<{ id: string; label: string }[]> => {
  const { data } = await db()
    .from('forge_assets')
    .select('id, name, asset_number, status, area_id')
    .eq('organization_id', organizationId)
    .eq('location_id', area.location_id)
    .is('area_id', null)
    .neq('status', 'retired')
    .order('name')
    .limit(500)

  return (data || []).map((row: any) => ({
    id: row.id as string,
    label: row.asset_number ? `${row.asset_number} · ${row.name}` : (row.name as string)
  }))
}

export const loadAreaActivity = async (organizationId: string, areaId: string) => {
  const { data } = await db()
    .from('forge_area_activity')
    .select('id, activity_type, message, actor_user_id, created_at')
    .eq('organization_id', organizationId)
    .eq('area_id', areaId)
    .order('created_at', { ascending: false })
    .limit(50)

  return (data || []) as {
    id: number
    activity_type: string
    message: string
    actor_user_id: string | null
    created_at: string
  }[]
}

export const writeAreaActivity = async ({
  organizationId,
  areaId,
  actorUserId,
  type,
  message,
  metadata = {}
}: {
  organizationId: string
  areaId: string
  actorUserId: string | null
  type: 'created' | 'updated' | 'archived' | 'restored' | 'equipment_added' | 'equipment_removed' | 'qr_created'
  message: string
  metadata?: Record<string, unknown>
}) => {
  const { error } = await db()
    .from('forge_area_activity')
    .insert({
      organization_id: organizationId,
      area_id: areaId,
      actor_user_id: actorUserId,
      activity_type: type,
      message,
      metadata
    })

  if (error) console.error('[waypoint] activity', areaId, error.message)
}
