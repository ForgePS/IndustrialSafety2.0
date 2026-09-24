import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { getTrainingOverview } from '@/lib/forgeTraining'
import { getScopedIncidents } from '@/lib/forgeIncidents'
import { getScopedInspections } from '@/lib/forgeInspections'
import { getScopedAssets } from '@/lib/forgeAssets'

type AccessContext = {
  organizationId: string
  userId: string
  alertPermission: EffectivePermission
  permissionByKey: Map<string, EffectivePermission>
}

const permissionFor = (
  permissionByKey: Map<string, EffectivePermission>,
  key: string
) => {
  const permission = permissionByKey.get(key)
  return permission?.allowed ? permission : null
}

export const getScopedForgeAiWatchAlerts = async ({
  organizationId,
  userId,
  alertPermission,
  permissionByKey
}: AccessContext) => {
  const supabase = createServiceRoleClient() as any

  const { data: alerts, error } = await supabase
    .from('forge_ai_watch_alerts')
    .select('*, forge_ai_watch_rules(name_override, forge_ai_watch_rule_templates(name, category, required_permission_key))')
    .eq('organization_id', organizationId)
    .neq('status', 'dismissed')
    .order('last_detected_at', { ascending: false })
    .limit(1000)

  if (error) throw new Error('Unable to load Forge AI Watch alerts: ' + error.message)

  let scopeFiltered = alerts || []

  if (alertPermission.scope === 'location' || alertPermission.scope === 'division') {
    const assignments = await getTenantScopeAssignments({ organizationId, userId })

    scopeFiltered = scopeFiltered.filter((alert: any) => {
      if (alertPermission.scope === 'location') {
        return Boolean(alert.location_id && assignments.locationIds.includes(alert.location_id))
      }
      return Boolean(alert.division_id && assignments.divisionIds.includes(alert.division_id))
    })
  } else if (alertPermission.scope !== 'organization') {
    return []
  }

  const trainingPermission = permissionFor(permissionByKey, 'training.view')
  const incidentPermission = permissionFor(permissionByKey, 'incidents.view')
  const inspectionPermission = permissionFor(permissionByKey, 'inspections.view')
  const assetPermission = permissionFor(permissionByKey, 'assets_equipment.view')

  const [training, incidents, inspections, assets] = await Promise.all([
    trainingPermission
      ? getTrainingOverview({ organizationId, userId, permission: trainingPermission })
      : Promise.resolve({ assignments: [], courses: [], completions: [] }),
    incidentPermission
      ? getScopedIncidents({ organizationId, userId, permission: incidentPermission })
      : Promise.resolve([]),
    inspectionPermission
      ? getScopedInspections({ organizationId, userId, permission: inspectionPermission })
      : Promise.resolve([]),
    assetPermission
      ? getScopedAssets({ organizationId, userId, permission: assetPermission, includeRetired: true })
      : Promise.resolve([])
  ])

  const allowedAssignmentIds = new Set((training.assignments || []).map((item: any) => item.id))
  const allowedIncidentIds = new Set((incidents || []).map((item: any) => item.id))
  const allowedInspectionIds = new Set((inspections || []).map((item: any) => item.id))
  const allowedAssetIds = new Set((assets || []).map((item: any) => item.id))

  return scopeFiltered.filter((alert: any) => {
    const requiredPermission = alert.forge_ai_watch_rules?.forge_ai_watch_rule_templates?.required_permission_key
    if (requiredPermission && !permissionFor(permissionByKey, requiredPermission)) return false

    if (alert.target_type === 'training_assignment') {
      return allowedAssignmentIds.has(alert.target_id)
    }

    if (alert.target_type === 'incident') {
      return allowedIncidentIds.has(alert.target_id)
    }

    if (alert.target_type === 'inspection_finding') {
      return Boolean(alert.data?.inspection_id && allowedInspectionIds.has(alert.data.inspection_id))
    }

    if (alert.target_type === 'asset') {
      return allowedAssetIds.has(alert.target_id)
    }

    if (alert.target_type === 'asset_maintenance') {
      return Boolean(alert.data?.asset_id && allowedAssetIds.has(alert.data.asset_id))
    }

    return false
  })
}
