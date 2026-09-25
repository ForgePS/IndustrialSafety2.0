import { createServiceRoleClient } from '@repo/supabase/server'
import { writeForgeAudit } from './forgeAudit'
import { writeRecordActivity } from './forgeRecordActivity'
import {
  hasEffectivePermission,
  requireForgeResourceView
} from './forgeResourceRegistry'

export const createAcknowledgement = async ({
  resourceType,
  resourceId,
  acknowledgementType,
  resourceVersion = null,
  statementVersion = null,
  signatureMethod = 'click_confirm',
  signatureMetadata = {}
}: {
  resourceType: string
  resourceId: string
  acknowledgementType: string
  resourceVersion?: string | null
  statementVersion?: string | null
  signatureMethod?: 'click_confirm' | 'typed_name' | 'drawn' | 'external'
  signatureMetadata?: Record<string, unknown>
  /** Ignored — actor is always the authenticated user. */
  personnelId?: string | null
}) => {
  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok) return { error: 'Not found.' }
  if (!hasEffectivePermission(auth.access, 'records.acknowledgements.create')) {
    return { error: 'Not found.' }
  }

  const organizationId = auth.resource.organizationId
  // Actor is always the current authenticated user — never trust client personnel_id.
  const actorUserId = auth.context.user.id

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_acknowledgements')
    .insert({
      organization_id: organizationId,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_version: resourceVersion,
      acknowledgement_type: acknowledgementType.trim(),
      user_id: actorUserId,
      statement_version: statementVersion,
      signature_method: signatureMethod,
      signature_metadata: signatureMetadata
    })
    .select('*')
    .single()

  if (error?.code === '23505') return { error: 'This acknowledgment already exists.' }
  if (error || !data) return { error: error?.message || 'Unable to save acknowledgment.' }

  await writeRecordActivity({
    organizationId,
    resourceType,
    resourceId,
    activityType: 'acknowledged',
    message: 'Record acknowledged (' + acknowledgementType + ').',
    actorUserId,
    metadata: { acknowledgement_id: data.id }
  })

  await writeForgeAudit({
    actorUserId,
    organizationId,
    action: 'record_acknowledgement.created',
    entityType: 'record_acknowledgement',
    entityId: data.id,
    afterValue: data
  })

  return { acknowledgement: data as Record<string, unknown>, message: 'Acknowledgment recorded.' }
}

export const listAcknowledgements = async ({
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
  if (!hasEffectivePermission(auth.access, 'records.acknowledgements.view')) {
    return []
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_record_acknowledgements')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('acknowledged_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as Array<{
    id: string
    acknowledgement_type: string
    user_id: string
    acknowledged_at: string
    signature_method?: string | null
  }>
}
