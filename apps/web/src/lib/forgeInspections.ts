import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export const inspectionWithinScope = async ({
  organizationId,
  userId,
  scope,
  inspection
}: {
  organizationId: string
  userId: string
  scope: string | null
  inspection: {
    organization_id: string
    inspector_user_id?: string | null
    assigned_to_user_id?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (inspection.organization_id !== organizationId) return false

  switch (scope) {
    case 'organization':
      return true
    case 'own':
      return inspection.inspector_user_id === userId
    case 'assigned':
      return inspection.inspector_user_id === userId || inspection.assigned_to_user_id === userId
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(inspection.location_id && locationIds.includes(inspection.location_id))
    }
    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(inspection.division_id && divisionIds.includes(inspection.division_id))
    }
    default:
      return false
  }
}

export const getScopedInspections = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_inspections')
    .select('*, locations(name, code), divisions(name, code), forge_inspection_templates(name, inspection_type)')
    .eq('organization_id', organizationId)
    .order('inspection_date', { ascending: false })

  switch (permission.scope) {
    case 'organization':
      break
    case 'own':
      query = query.eq('inspector_user_id', userId)
      break
    case 'assigned':
      query = query.or('inspector_user_id.eq.' + userId + ',assigned_to_user_id.eq.' + userId)
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
  if (error) throw new Error('Unable to load inspections: ' + error.message)
  return data || []
}

export const getInspectionDetailData = async ({
  organizationId,
  inspectionId
}: {
  organizationId: string
  inspectionId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [
    { data: items, error: itemsError },
    { data: findings, error: findingsError },
    { data: activity, error: activityError }
  ] = await Promise.all([
    supabase
      .from('forge_inspection_items')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('inspection_id', inspectionId)
      .order('section_key')
      .order('sort_order'),
    supabase
      .from('forge_inspection_findings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('inspection_id', inspectionId)
      .order('created_at', { ascending: false }),
    supabase
      .from('forge_inspection_activity')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('inspection_id', inspectionId)
      .order('created_at', { ascending: false })
  ])

  if (itemsError) throw new Error('Unable to load inspection items: ' + itemsError.message)
  if (findingsError) throw new Error('Unable to load inspection findings: ' + findingsError.message)
  if (activityError) throw new Error('Unable to load inspection activity: ' + activityError.message)

  return {
    items: items || [],
    findings: findings || [],
    activity: activity || []
  }
}
