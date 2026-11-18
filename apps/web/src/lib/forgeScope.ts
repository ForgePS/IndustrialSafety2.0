import { createServiceRoleClient } from '@repo/supabase/server'

export type TenantDataScope = 'own' | 'assigned' | 'location' | 'division' | 'organization'

export const getTenantScopeAssignments = async ({
  organizationId,
  userId
}: {
  organizationId: string
  userId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: locations }, { data: divisions }] = await Promise.all([
    supabase
      .from('forge_tenant_user_location_access')
      .select('location_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId),
    supabase
      .from('forge_tenant_user_division_access')
      .select('division_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
  ])

  return {
    locationIds: (locations || []).map((item: any) => item.location_id),
    divisionIds: (divisions || []).map((item: any) => item.division_id)
  }
}

export const personnelRecordWithinScope = async ({
  organizationId,
  userId,
  scope,
  record
}: {
  organizationId: string
  userId: string
  scope: TenantDataScope | string | null
  record: {
    organization_id: string
    auth_user_id?: string | null
    supervisor_user_id?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (record.organization_id !== organizationId) return false

  switch (scope) {
    case 'organization':
      return true

    case 'own':
      return record.auth_user_id === userId

    case 'assigned':
      return record.auth_user_id === userId || record.supervisor_user_id === userId

    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(record.location_id && locationIds.includes(record.location_id))
    }

    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      return Boolean(record.division_id && divisionIds.includes(record.division_id))
    }

    default:
      return false
  }
}
