import { createServiceRoleClient } from '@repo/supabase/server'
import {
  requireForgeResourceView,
  type ForgeResourceType,
  type ResolvedForgeResource
} from './forgeResourceRegistry'

export type RecordActivityRow = {
  id: string
  activity_type: string
  message: string | null
  actor_user_id?: string | null
  metadata?: Record<string, unknown>
  created_at: string
}

export const writeRecordActivity = async ({
  organizationId,
  resourceType,
  resourceId,
  activityType,
  message,
  actorUserId,
  metadata = {}
}: {
  organizationId: string
  resourceType: ForgeResourceType | string
  resourceId: string
  activityType: string
  message: string
  actorUserId: string | null
  metadata?: Record<string, unknown>
}) => {
  const supabase = createServiceRoleClient() as any
  const { error } = await supabase.from('forge_record_activity').insert({
    organization_id: organizationId,
    resource_type: resourceType,
    resource_id: resourceId,
    activity_type: activityType,
    message,
    actor_user_id: actorUserId,
    metadata
  })

  if (error) throw new Error('Unable to write activity: ' + error.message)
}

const queryRecordActivity = async ({
  organizationId,
  resourceType,
  resourceId,
  limit = 50
}: {
  organizationId: string
  resourceType: string
  resourceId: string
  limit?: number
}) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_activity')
    .select('id, activity_type, message, actor_user_id, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('Unable to load activity: ' + error.message)
  return (data || []) as RecordActivityRow[]
}

/** Requires view access on the parent resource before listing activity. */
export const listRecordActivity = async ({
  organizationId,
  resourceType,
  resourceId,
  limit = 50
}: {
  organizationId: string
  resourceType: string
  resourceId: string
  limit?: number
}) => {
  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok || auth.resource.organizationId !== organizationId) {
    return [] as RecordActivityRow[]
  }

  return queryRecordActivity({
    organizationId: auth.resource.organizationId,
    resourceType,
    resourceId,
    limit
  })
}

/** Prefer when the caller already holds an authorized ResolvedForgeResource. */
export const listAuthorizedRecordActivity = async ({
  resourceType,
  resourceId,
  limit = 50,
  authorizedResource = null
}: {
  resourceType: string
  resourceId: string
  limit?: number
  authorizedResource?: ResolvedForgeResource | null
}) => {
  let resource = authorizedResource
  if (!resource) {
    const auth = await requireForgeResourceView({ resourceType, resourceId })
    if (!auth.ok) {
      return { error: 'Not found.' as const, activity: [] as RecordActivityRow[] }
    }
    resource = auth.resource
  } else if (resource.resourceType !== resourceType || resource.resourceId !== resourceId) {
    return { error: 'Not found.' as const, activity: [] as RecordActivityRow[] }
  }

  const activity = await queryRecordActivity({
    organizationId: resource.organizationId,
    resourceType: resource.resourceType,
    resourceId: resource.resourceId,
    limit
  })

  return { activity }
}
