import { createServiceRoleClient } from '@repo/supabase/server'

import { vehicleScopeFilter } from '@/lib/forgeFleetAccess'
import { REMOVED_STATUSES, vehicleDisplayName } from '@/lib/forgeFleetRules'
import { getQrConfigOptions, getScopedLocationIds } from '@/lib/forgeQr'

/** Locations and fleet vehicles in the user's scope, published forms and active inspection templates for the QR form. */
export type QrFormOptions = {
  locations: Array<{ id: string; label: string }>
  vehicles: Array<{ id: string; label: string }>
  forms: Array<{ id: string; label: string }>
  inspectionTemplates: Array<{ id: string; label: string }>
}

export const loadQrFormOptions = async ({
  organizationId,
  userId,
  scope
}: {
  organizationId: string
  userId: string
  scope: string | null
}): Promise<QrFormOptions> => {
  const supabase = createServiceRoleClient() as any

  const [locationIds, config, vehicleFilter] = await Promise.all([
    getScopedLocationIds({ organizationId, userId, scope }),
    getQrConfigOptions(organizationId),
    vehicleScopeFilter({ organizationId, userId, scope })
  ])

  let locations: Array<{ id: string; label: string }> = []

  if (locationIds === null || locationIds.length) {
    let query = supabase.from('locations').select('id, name, code').eq('organization_id', organizationId).eq('is_active', true).order('name')

    if (locationIds) query = query.in('id', locationIds)

    const { data } = await query

    locations = (data || []).map((item: any) => ({ id: item.id, label: item.code ? item.name + ' (' + item.code + ')' : item.name }))
  }

  // Fleet vehicles: not removed, not archived, inside the user's QR Management scope (fleet scope rules).
  let vehicleQuery = supabase
    .from('forge_fleet_vehicles')
    .select('id, vehicle_number, unit_number, year, make, model, status')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .not('status', 'in', `(${REMOVED_STATUSES.join(',')})`)
    .order('vehicle_number')

  if (vehicleFilter !== null) vehicleQuery = vehicleQuery.or(vehicleFilter)

  const { data: vehicleRows } = await vehicleQuery

  const vehicles = (vehicleRows || []).map((item: any) => ({ id: item.id as string, label: (item.vehicle_number + ' · ' + vehicleDisplayName(item)) as string }))

  return { locations, vehicles, forms: config.forms, inspectionTemplates: config.inspectionTemplates }
}
