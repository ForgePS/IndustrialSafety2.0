import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export const assetWithinScope = async ({
  organizationId,
  userId,
  scope,
  asset
}: {
  organizationId: string
  userId: string
  scope: string | null
  asset: {
    organization_id: string
    custodian_user_id?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (asset.organization_id !== organizationId) return false

  switch (scope) {
    case 'organization':
      return true
    case 'own':
    case 'assigned':
      return asset.custodian_user_id === userId
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(asset.location_id && locationIds.includes(asset.location_id))
    }
    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(asset.division_id && divisionIds.includes(asset.division_id))
    }
    default:
      return false
  }
}

export const getScopedAssets = async ({
  organizationId,
  userId,
  permission,
  includeRetired = false
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  includeRetired?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_assets')
    .select('*, locations(name, code), divisions(name, code), forge_personnel!forge_assets_custodian_personnel_id_fkey(first_name, last_name, employee_number)')
    .eq('organization_id', organizationId)
    .order('name')

  if (!includeRetired) query = query.is('retired_at', null)

  switch (permission.scope) {
    case 'organization':
      break
    case 'own':
    case 'assigned':
      query = query.eq('custodian_user_id', userId)
      break
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!locationIds.length) return []
      query = query.in('location_id', locationIds)
      break
    }
    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!divisionIds.length) return []
      query = query.in('division_id', divisionIds)
      break
    }
    default:
      return []
  }

  const { data, error } = await query
  if (error) throw new Error('Unable to load assets: ' + error.message)

  return data || []
}

export const getAssetDetailData = async ({
  organizationId,
  assetId
}: {
  organizationId: string
  assetId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [
    { data: maintenance, error: maintenanceError },
    { data: meterReadings, error: meterError },
    { data: assignments, error: assignmentsError },
    { data: activity, error: activityError }
  ] = await Promise.all([
    supabase
      .from('forge_asset_maintenance')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false }),
    supabase
      .from('forge_asset_meter_readings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('forge_asset_assignments')
      .select('*, forge_personnel(first_name, last_name, employee_number), locations(name, code), divisions(name, code)')
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .order('assigned_at', { ascending: false }),
    supabase
      .from('forge_asset_activity')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
  ])

  if (maintenanceError) throw new Error('Unable to load asset maintenance: ' + maintenanceError.message)
  if (meterError) throw new Error('Unable to load asset meter readings: ' + meterError.message)
  if (assignmentsError) throw new Error('Unable to load asset assignments: ' + assignmentsError.message)
  if (activityError) throw new Error('Unable to load asset activity: ' + activityError.message)

  return {
    maintenance: maintenance || [],
    meterReadings: meterReadings || [],
    assignments: assignments || [],
    activity: activity || []
  }
}
