import { createServiceRoleClient } from '@repo/supabase/server'

import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 11: who can see a fleet vehicle, and the shared vehicle loaders. Server only. Every fleet page,
 * action and route checks access through here.
 *
 * Scope of a fleet permission:
 * - organization: every vehicle in the company
 * - location / division: vehicles at your locations / divisions, plus the ones assigned to you
 * - own / assigned: vehicles assigned to you as driver (your personnel record)
 *
 * DVIRs, maintenance, documents and meter readings follow their vehicle's scope.
 */

const db = () => createServiceRoleClient() as any

export type FleetScopeVehicle = {
  organization_id: string
  location_id?: string | null
  division_id?: string | null
  assigned_driver_personnel_id?: string | null
}

/** The current user's personnel ids in the company (a user normally has one). */
export const ownPersonnelIds = async (organizationId: string, userId: string) => {
  const { data } = await db().from('forge_personnel').select('id').eq('organization_id', organizationId).eq('auth_user_id', userId).is('archived_at', null)

  return ((data || []) as { id: string }[]).map(row => row.id)
}

export const vehicleWithinScope = async ({
  organizationId,
  userId,
  scope,
  vehicle
}: {
  organizationId: string
  userId: string
  scope: string | null
  vehicle: FleetScopeVehicle
}) => {
  if (vehicle.organization_id !== organizationId) return false
  if (scope === 'organization') return true

  if (vehicle.assigned_driver_personnel_id) {
    const personnel = await ownPersonnelIds(organizationId, userId)

    if (personnel.includes(vehicle.assigned_driver_personnel_id)) return true
  }

  if (scope === 'own' || scope === 'assigned') return false

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') return Boolean(vehicle.location_id && assignments.locationIds.includes(vehicle.location_id))
  if (scope === 'division') return Boolean(vehicle.division_id && assignments.divisionIds.includes(vehicle.division_id))

  return false
}

/**
 * The PostgREST `or=()` filter limiting a forge_fleet_vehicles query to a scope, or null for organization scope.
 * Apply with `query.or(filter)` (callers still filter organization_id). Returned as a string because awaiting a
 * query builder runs it. For tables keyed by vehicle_id, use scopedVehicleIds instead.
 */
export const vehicleScopeFilter = async ({ organizationId, userId, scope }: { organizationId: string; userId: string; scope: string | null }): Promise<string | null> => {
  if (scope === 'organization') return null

  const personnel = await ownPersonnelIds(organizationId, userId)

  // A filter that matches nothing, so "own" with no personnel record shows no vehicles.
  const filters = personnel.length ? personnel.map(id => `assigned_driver_personnel_id.eq.${id}`) : ['id.eq.00000000-0000-0000-0000-000000000000']

  if (scope === 'location' || scope === 'division') {
    const assignments = await getTenantScopeAssignments({ organizationId, userId })
    const ids = scope === 'location' ? assignments.locationIds : assignments.divisionIds
    const column = scope === 'location' ? 'location_id' : 'division_id'

    if (ids.length) filters.push(`${column}.in.(${ids.join(',')})`)
  }

  return filters.join(',')
}

/** Ids of the vehicles in scope (null = every vehicle in the company), for queries on child tables. */
export const scopedVehicleIds = async ({ organizationId, userId, scope }: { organizationId: string; userId: string; scope: string | null }): Promise<string[] | null> => {
  const filter = await vehicleScopeFilter({ organizationId, userId, scope })

  if (filter === null) return null

  const { data } = await db().from('forge_fleet_vehicles').select('id').eq('organization_id', organizationId).or(filter)

  return ((data || []) as { id: string }[]).map(row => row.id)
}

export const loadVehicle = async ({ organizationId, vehicleId }: { organizationId: string; vehicleId: string }) => {
  const { data } = await db()
    .from('forge_fleet_vehicles')
    .select('*, locations(name), divisions(name), driver:forge_personnel!forge_fleet_vehicles_assigned_driver_personnel_id_fkey(id, first_name, last_name, preferred_name, employee_number, auth_user_id)')
    .eq('organization_id', organizationId)
    .eq('id', vehicleId)
    .maybeSingle()

  return data || null
}

export const loadFleetSettings = async (organizationId: string) => {
  const { data } = await db().from('forge_fleet_settings').select('*').eq('organization_id', organizationId).maybeSingle()

  return {
    defect_out_of_service: data?.defect_out_of_service ?? true,
    defect_opens_repair: data?.defect_opens_repair ?? true,
    renewal_warning_days: data?.renewal_warning_days ?? 30,
    dvir_retention_days: data?.dvir_retention_days ?? 91
  }
}

/** One row on the vehicle's activity feed. Never throws. */
export const fleetActivity = async ({
  organizationId,
  vehicleId,
  actorUserId,
  type,
  message,
  metadata = {}
}: {
  organizationId: string
  vehicleId: string
  actorUserId: string | null
  type: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  try {
    await db().from('forge_fleet_activity').insert({ organization_id: organizationId, vehicle_id: vehicleId, activity_type: type, message, actor_user_id: actorUserId, metadata })
  } catch {
    // The feed must not break the action.
  }
}

/**
 * Vehicle in or out of service with a status history row (forge_fleet_set_status) and an activity row.
 * The caller checks permission. changed: false when the vehicle already had that status.
 */
export const setVehicleServiceStatus = async ({
  organizationId,
  vehicleId,
  status,
  reason = null,
  source,
  relatedRecordType = null,
  relatedRecordId = null,
  qrCodeId = null,
  actorUserId = null,
  actorPersonnelId = null,
  actorName = null
}: {
  organizationId: string
  vehicleId: string
  status: 'active' | 'out_of_service'
  reason?: string | null
  source: 'record_edit' | 'dvir' | 'dvir_certified' | 'qr_scan' | 'qr_issue'
  relatedRecordType?: string | null
  relatedRecordId?: string | null
  qrCodeId?: string | null
  actorUserId?: string | null
  actorPersonnelId?: string | null
  actorName?: string | null
}): Promise<{ error: string } | { changed: boolean; historyId: string | null }> => {
  const { data, error } = await db().rpc('forge_fleet_set_status', {
    p_organization_id: organizationId,
    p_vehicle_id: vehicleId,
    p_status: status,
    p_reason: reason,
    p_source: source,
    p_related_record_type: relatedRecordType,
    p_related_record_id: relatedRecordId,
    p_qr_code_id: qrCodeId,
    p_actor_user_id: actorUserId,
    p_actor_personnel_id: actorPersonnelId,
    p_actor_name: actorName
  })

  if (error) return { error: error.message || 'Unable to change the vehicle status.' }
  if (!data) return { changed: false, historyId: null }

  const out = status === 'out_of_service'

  await fleetActivity({
    organizationId,
    vehicleId,
    actorUserId,
    type: out ? 'out_of_service' : 'returned_to_service',
    message: out ? `Marked out of service${reason ? `: ${reason}` : ''}.` : 'Returned to service.',
    metadata: { source, related_record_type: relatedRecordType, related_record_id: relatedRecordId, actor_name: actorName, history_id: data }
  })

  return { changed: true, historyId: data as string }
}
