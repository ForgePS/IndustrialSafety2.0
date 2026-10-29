import { createServiceRoleClient } from '@repo/supabase/server'

export const writeForgeAudit = async ({
  actorUserId,
  organizationId,
  action,
  entityType,
  entityId,
  beforeValue = null,
  afterValue = null,
  reason = null,
  requestId = null
}: {
  actorUserId: string | null
  organizationId: string
  action: string
  entityType: string
  entityId: string
  beforeValue?: Record<string, unknown> | null
  afterValue?: Record<string, unknown> | null
  reason?: string | null
  requestId?: string | null
}) => {
  const supabase = createServiceRoleClient() as any
  const { error } = await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_value: beforeValue,
    after_value: afterValue,
    reason,
    request_id: requestId
  })

  if (error) {
    throw new Error('Unable to write audit event: ' + error.message)
  }
}
