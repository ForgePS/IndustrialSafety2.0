import { createServiceRoleClient } from '@repo/supabase/server'
import { writeForgeAudit } from './forgeAudit'
import { writeRecordActivity } from './forgeRecordActivity'
import {
  hasEffectivePermission,
  requireForgeResourceManage,
  requireForgeResourceView
} from './forgeResourceRegistry'
import { getTenantContext } from './forgeTenantContext'
import { getEffectiveTenantAccess } from './forgeEffectiveAccess'

export const addRecordComment = async ({
  resourceType,
  resourceId,
  body
}: {
  resourceType: string
  resourceId: string
  body: string
}) => {
  const text = body.trim()
  if (!text) return { error: 'Comment is required.' }

  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok) return { error: 'Not found.' }
  if (!hasEffectivePermission(auth.access, 'records.comments.create')) {
    return { error: 'Not found.' }
  }

  const organizationId = auth.resource.organizationId
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_comments')
    .insert({
      organization_id: organizationId,
      resource_type: resourceType,
      resource_id: resourceId,
      body: text,
      author_user_id: auth.context.user.id
    })
    .select('*')
    .single()

  if (error || !data) return { error: error?.message || 'Unable to add comment.' }

  await writeRecordActivity({
    organizationId,
    resourceType,
    resourceId,
    activityType: 'comment_added',
    message: 'Comment added.',
    actorUserId: auth.context.user.id,
    metadata: { comment_id: data.id }
  })

  await writeForgeAudit({
    actorUserId: auth.context.user.id,
    organizationId,
    action: 'record_comment.created',
    entityType: 'record_comment',
    entityId: data.id,
    afterValue: { resource_type: resourceType, resource_id: resourceId }
  })

  return { comment: data as Record<string, unknown>, message: 'Comment added.' }
}

export const listRecordComments = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => {
  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok || auth.resource.organizationId !== organizationId) {
    return []
  }
  if (!hasEffectivePermission(auth.access, 'records.comments.view')) {
    return []
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_comments')
    .select('id, body, author_user_id, created_at, edited_at')
    .eq('organization_id', organizationId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data || []) as Array<{
    id: string
    body: string
    author_user_id?: string | null
    created_at: string
    edited_at?: string | null
  }>
}

export const archiveRecordComment = async ({ commentId }: { commentId: string }) => {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) return { error: 'Not found.' }

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({
    organizationId,
    userId: context.user.id
  })
  if (!hasEffectivePermission(access, 'records.comments.manage')) {
    return { error: 'Not found.' }
  }

  const supabase = createServiceRoleClient() as any
  const now = new Date().toISOString()

  const { data: before } = await supabase
    .from('forge_record_comments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', commentId)
    .is('archived_at', null)
    .maybeSingle()

  if (!before) return { error: 'Not found.' }

  const parentAuth = await requireForgeResourceManage({
    resourceType: before.resource_type,
    resourceId: before.resource_id
  })
  if (!parentAuth.ok) return { error: 'Not found.' }

  const { data, error } = await supabase
    .from('forge_record_comments')
    .update({ archived_at: now, archived_by: context.user.id })
    .eq('id', commentId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !data) return { error: error?.message || 'Unable to archive comment.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'record_comment.archived',
    entityType: 'record_comment',
    entityId: commentId,
    beforeValue: before,
    afterValue: data
  })

  return { comment: data as Record<string, unknown>, message: 'Comment archived.' }
}
