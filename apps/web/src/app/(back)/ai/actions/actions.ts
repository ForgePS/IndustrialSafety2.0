'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import {
  approveAndExecuteForgeAiAction,
  rejectForgeAiAction
} from '@/lib/forgeAiActions'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const approveForgeAiAction = async (approvalId: string) => {
  const context = await requireTenantPermission('forge_ai.approve_actions')

  const result = await approveAndExecuteForgeAiAction({
    organizationId: context.activeOrganization.id,
    approverUserId: context.user.id,
    approvalId
  })

  revalidatePath('/ai/actions')

  if (!('error' in result)) {
    if (result.target_type === 'inspection') {
      revalidatePath('/inspections')
      revalidatePath('/inspections/' + result.target_id)
    }

    if (result.target_type === 'asset') {
      revalidatePath('/assets')
      revalidatePath('/assets/' + result.target_id)
    }
  }

  return result
}

export const rejectPendingForgeAiAction = async ({
  approvalId,
  reason
}: {
  approvalId: string
  reason: string
}) => {
  const context = await requireTenantPermission('forge_ai.approve_actions')

  const result = await rejectForgeAiAction({
    organizationId: context.activeOrganization.id,
    approverUserId: context.user.id,
    approvalId,
    reason
  })

  revalidatePath('/ai/actions')
  return result
}

export const cancelForgeAiAction = async (approvalId: string) => {
  const context = await requireTenantPermission('forge_ai.run_actions')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: approval } = await supabase
    .from('forge_ai_action_approvals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', approvalId)
    .eq('requested_by', context.user.id)
    .maybeSingle()

  if (!approval) return { error: 'AI action approval request not found.' }
  if (approval.status !== 'pending') return { error: 'Only pending AI actions can be canceled.' }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('forge_ai_action_approvals')
    .update({
      status: 'canceled',
      updated_at: now
    })
    .eq('id', approvalId)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'forge_ai.action_canceled',
    entity_type: 'forge_ai_action_approval',
    entity_id: approvalId,
    before_value: {
      status: 'pending',
      action_key: approval.action_key
    },
    after_value: {
      status: 'canceled'
    }
  })

  revalidatePath('/ai/actions')
  return { message: 'AI action canceled.' }
}
