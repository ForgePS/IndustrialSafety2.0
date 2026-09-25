import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from './forgeEffectiveAccess'
import { writeForgeAudit } from './forgeAudit'
import { writeRecordActivity } from './forgeRecordActivity'
import {
  getRelationshipDefinition,
  isAllowedRelationship
} from './forgeRelationshipRegistry'
import {
  hasEffectivePermission,
  isForgeResourceType,
  loadOrgResource,
  requireCompatibleForgeResources,
  requireForgeResourceManage,
  requireForgeResourceView,
  type ForgeResourceType
} from './forgeResourceRegistry'
import { getTenantContext } from './forgeTenantContext'

export type RecordLink = {
  id: string
  organization_id: string
  source_resource_type: string
  source_resource_id: string
  target_resource_type: string
  target_resource_id: string
  relationship_type: string
  created_by: string | null
  created_at: string
  archived_at: string | null
}

export const validateResourceReference = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => {
  if (!isForgeResourceType(resourceType)) {
    return { error: 'Unsupported resource type.', record: null as Record<string, unknown> | null }
  }

  return loadOrgResource({
    organizationId,
    resourceType,
    resourceId
  })
}

export const createRecordLink = async ({
  sourceResourceType,
  sourceResourceId,
  targetResourceType,
  targetResourceId,
  relationshipType
}: {
  sourceResourceType: string
  sourceResourceId: string
  targetResourceType: string
  targetResourceId: string
  relationshipType: string
}) => {
  const rel = relationshipType.trim().toLowerCase()
  const definition = getRelationshipDefinition(rel)
  if (!definition) return { error: 'Not found.' }

  if (!isAllowedRelationship(sourceResourceType, targetResourceType, rel)) {
    return { error: 'Not found.' }
  }

  if (sourceResourceType === targetResourceType && sourceResourceId === targetResourceId) {
    return { error: 'A record cannot link to itself.' }
  }

  const compatible = await requireCompatibleForgeResources({
    sourceResourceType,
    sourceResourceId,
    targetResourceType,
    targetResourceId
  })
  if (!compatible.ok) {
    return { error: 'Not found.' }
  }

  if (!hasEffectivePermission(compatible.access, 'records.links.manage')) {
    return { error: 'Not found.' }
  }

  if (
    definition.requiredManagePermission &&
    !hasEffectivePermission(compatible.access, definition.requiredManagePermission)
  ) {
    return { error: 'Not found.' }
  }

  const organizationId = compatible.context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  if (!definition.allowDuplicate) {
    const { data: existing } = await supabase
      .from('forge_record_links')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('source_resource_type', sourceResourceType)
      .eq('source_resource_id', sourceResourceId)
      .eq('target_resource_type', targetResourceType)
      .eq('target_resource_id', targetResourceId)
      .eq('relationship_type', rel)
      .is('archived_at', null)
      .maybeSingle()
    if (existing) return { error: 'This relationship already exists.' }
  }

  const { data, error } = await supabase
    .from('forge_record_links')
    .insert({
      organization_id: organizationId,
      source_resource_type: sourceResourceType,
      source_resource_id: sourceResourceId,
      target_resource_type: targetResourceType,
      target_resource_id: targetResourceId,
      relationship_type: rel,
      created_by: compatible.context.user.id
    })
    .select('*')
    .single()

  if (error?.code === '23505') return { error: 'This relationship already exists.' }
  if (error || !data) return { error: error?.message || 'Unable to create record link.' }

  const link = data as RecordLink

  await writeRecordActivity({
    organizationId,
    resourceType: sourceResourceType as ForgeResourceType,
    resourceId: sourceResourceId,
    activityType: 'record_link_created',
    message: 'Linked to ' + targetResourceType + ' record.',
    actorUserId: compatible.context.user.id,
    metadata: { link_id: link.id, target_resource_id: targetResourceId, relationship_type: rel }
  })

  await writeForgeAudit({
    actorUserId: compatible.context.user.id,
    organizationId,
    action: 'record_link.created',
    entityType: 'record_link',
    entityId: link.id,
    afterValue: link
  })

  return { link, message: 'Record link created.' }
}

export const archiveRecordLink = async ({ linkId }: { linkId: string }) => {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) return { error: 'Not found.' }

  const organizationId = context.activeOrganization.id
  const access = await getEffectiveTenantAccess({
    organizationId,
    userId: context.user.id
  })
  if (!hasEffectivePermission(access, 'records.links.manage')) {
    return { error: 'Not found.' }
  }

  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_record_links')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', linkId)
    .is('archived_at', null)
    .maybeSingle()

  if (!before) return { error: 'Not found.' }

  const linkBefore = before as RecordLink
  const definition = getRelationshipDefinition(linkBefore.relationship_type)
  if (!definition?.archivable) return { error: 'Not found.' }

  const sourceAuth = await requireForgeResourceManage({
    resourceType: linkBefore.source_resource_type,
    resourceId: linkBefore.source_resource_id
  })
  if (!sourceAuth.ok) return { error: 'Not found.' }

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('forge_record_links')
    .update({ archived_at: now, archived_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('id', linkId)
    .select('*')
    .single()

  if (error || !data) return { error: error?.message || 'Unable to archive record link.' }

  const link = data as RecordLink

  await writeRecordActivity({
    organizationId,
    resourceType: linkBefore.source_resource_type,
    resourceId: linkBefore.source_resource_id,
    activityType: 'record_link_archived',
    message: 'Record link archived.',
    actorUserId: context.user.id,
    metadata: { link_id: linkId }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'record_link.archived',
    entityType: 'record_link',
    entityId: linkId,
    beforeValue: linkBefore,
    afterValue: link
  })

  return { link, message: 'Record link archived.' }
}

export const getRecordLinks = async ({
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
    return { outbound: [] as RecordLink[], inbound: [] as RecordLink[], error: 'Not found.' as const }
  }
  if (!hasEffectivePermission(auth.access, 'records.links.view')) {
    return { outbound: [] as RecordLink[], inbound: [] as RecordLink[], error: 'Not found.' as const }
  }

  const supabase = createServiceRoleClient() as any
  const [{ data: outbound }, { data: inbound }] = await Promise.all([
    supabase
      .from('forge_record_links')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('source_resource_type', resourceType)
      .eq('source_resource_id', resourceId)
      .is('archived_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('forge_record_links')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('target_resource_type', resourceType)
      .eq('target_resource_id', resourceId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
  ])

  return {
    outbound: (outbound || []) as RecordLink[],
    inbound: (inbound || []) as RecordLink[]
  }
}

export const getOutboundRecordLinks = async (args: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => (await getRecordLinks(args)).outbound

export const getInboundRecordLinks = async (args: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => (await getRecordLinks(args)).inbound
