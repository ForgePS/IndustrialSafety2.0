import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export const getScopedPersonnel = async ({
  organizationId,
  userId,
  permission,
  includeArchived = false
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  includeArchived?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_personnel')
    .select('*, locations(name, code), divisions(name, code)')
    .eq('organization_id', organizationId)
    .order('last_name')
    .order('first_name')

  if (!includeArchived) query = query.is('archived_at', null)

  switch (permission.scope) {
    case 'organization':
      break

    case 'own':
      query = query.eq('auth_user_id', userId)
      break

    case 'assigned':
      query = query.or(`auth_user_id.eq.${userId},supervisor_user_id.eq.${userId}`)
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
  if (error) throw new Error(`Unable to load personnel: ${error.message}`)

  return data || []
}
