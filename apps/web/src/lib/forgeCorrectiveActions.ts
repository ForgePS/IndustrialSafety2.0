import { createServiceRoleClient } from '@repo/supabase/server'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

export const correctiveActionWithinScope = async ({
  organizationId,
  userId,
  scope,
  action
}: {
  organizationId: string
  userId: string
  scope: string | null
  action: {
    organization_id: string
    assigned_user_id?: string | null
    created_by?: string | null
    location_id?: string | null
    division_id?: string | null
  }
}) => {
  if (action.organization_id !== organizationId) return false

  if (scope === 'organization') return true

  if (scope === 'own' || scope === 'assigned') {
    return action.assigned_user_id === userId || action.created_by === userId
  }

  const assignments = await getTenantScopeAssignments({ organizationId, userId })

  if (scope === 'location') {
    return Boolean(
      (action.location_id && assignments.locationIds.includes(action.location_id)) ||
      action.assigned_user_id === userId ||
      action.created_by === userId
    )
  }

  if (scope === 'division') {
    return Boolean(
      (action.division_id && assignments.divisionIds.includes(action.division_id)) ||
      action.assigned_user_id === userId ||
      action.created_by === userId
    )
  }

  return false
}

export const getScopedCorrectiveActions = async ({
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
    .from('forge_corrective_actions')
    .select('*, forge_personnel!forge_corrective_actions_assigned_personnel_id_fkey(first_name, last_name, employee_number, auth_user_id), locations(name, code), divisions(name, code)')
    .eq('organization_id', organizationId)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!includeArchived) query = query.is('archived_at', null)

  switch (permission.scope) {
    case 'organization':
      break
    case 'own':
    case 'assigned':
      query = query.or('assigned_user_id.eq.' + userId + ',created_by.eq.' + userId)
      break
    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!locationIds.length) {
        query = query.or('assigned_user_id.eq.' + userId + ',created_by.eq.' + userId)
      } else {
        query = query.or(
          'assigned_user_id.eq.' + userId +
          ',created_by.eq.' + userId +
          ',location_id.in.(' + locationIds.join(',') + ')'
        )
      }
      break
    }
    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })
      if (!divisionIds.length) {
        query = query.or('assigned_user_id.eq.' + userId + ',created_by.eq.' + userId)
      } else {
        query = query.or(
          'assigned_user_id.eq.' + userId +
          ',created_by.eq.' + userId +
          ',division_id.in.(' + divisionIds.join(',') + ')'
        )
      }
      break
    }
    default:
      return []
  }

  const { data, error } = await query
  if (error) throw new Error('Unable to load Corrective Actions: ' + error.message)

  return data || []
}

export const getCorrectiveActionDetail = async ({
  organizationId,
  correctiveActionId
}: {
  organizationId: string
  correctiveActionId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: comments, error: commentsError }, { data: activity, error: activityError }] = await Promise.all([
    supabase
      .from('forge_corrective_action_comments')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('corrective_action_id', correctiveActionId)
      .order('created_at'),
    supabase
      .from('forge_corrective_action_activity')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('corrective_action_id', correctiveActionId)
      .order('created_at', { ascending: false })
  ])

  if (commentsError) throw new Error('Unable to load Corrective Action comments: ' + commentsError.message)
  if (activityError) throw new Error('Unable to load Corrective Action activity: ' + activityError.message)

  return {
    comments: comments || [],
    activity: activity || []
  }
}
