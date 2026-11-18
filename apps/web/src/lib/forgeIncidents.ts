import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export const incidentWithinScope = async ({
  organizationId,
  userId,
  scope,
  incident
}: {
  organizationId: string
  userId: string
  scope: string | null
  incident: {
    organization_id: string
    reported_by_user_id?: string | null
    assigned_to_user_id?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (incident.organization_id !== organizationId) return false

  switch (scope) {
    case 'organization':
      return true

    case 'own':
      return incident.reported_by_user_id === userId

    case 'assigned':
      return incident.reported_by_user_id === userId || incident.assigned_to_user_id === userId

    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(incident.location_id && locationIds.includes(incident.location_id))
    }

    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(incident.division_id && divisionIds.includes(incident.division_id))
    }

    default:
      return false
  }
}

export const getScopedIncidents = async ({
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
    .from('forge_incidents')
    .select('*, locations(name, code), divisions(name, code), forge_personnel!forge_incidents_reported_by_personnel_id_fkey(first_name, last_name, employee_number)')
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })

  switch (permission.scope) {
    case 'organization':
      break

    case 'own':
      query = query.eq('reported_by_user_id', userId)
      break

    case 'assigned':
      query = query.or('reported_by_user_id.eq.' + userId + ',assigned_to_user_id.eq.' + userId)
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
  if (error) throw new Error('Unable to load incidents: ' + error.message)

  return data || []
}

export const getIncidentActivity = async ({
  organizationId,
  incidentId
}: {
  organizationId: string
  incidentId: string
}) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_incident_activity')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false })

  if (error) throw new Error('Unable to load incident activity: ' + error.message)
  return data || []
}
