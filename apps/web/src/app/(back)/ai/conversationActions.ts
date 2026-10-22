'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const conversationSchema = z.object({
  conversationId: z.string().uuid()
})

const feedbackSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.number().int().positive(),
  rating: z.union([z.literal(-1), z.literal(0), z.literal(1)])
})

const requireOwnedConversation = async ({
  organizationId,
  userId,
  conversationId
}: {
  organizationId: string
  userId: string
  conversationId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_ai_conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('id', conversationId)
    .neq('status', 'deleted')
    .maybeSingle()

  return data || null
}

export const saveForgeAiFeedback = async (
  input: z.infer<typeof feedbackSchema>
) => {
  const context = await requireTenantPermission('forge_ai.use')
  const parsed = feedbackSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid AI feedback.' }
  }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const conversation = await requireOwnedConversation({
    organizationId,
    userId: context.user.id,
    conversationId: parsed.data.conversationId
  })

  if (!conversation) return { error: 'AI conversation not found.' }

  const { data: message } = await supabase
    .from('forge_ai_messages')
    .select('id, role')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .eq('id', parsed.data.messageId)
    .maybeSingle()

  if (!message || message.role !== 'assistant') {
    return { error: 'Assistant message not found.' }
  }

  const { error: deleteError } = await supabase
    .from('forge_ai_feedback')
    .delete()
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversation.id)
    .eq('message_id', message.id)
    .eq('user_id', context.user.id)

  if (deleteError) return { error: deleteError.message }

  if (parsed.data.rating !== 0) {
    const { error: insertError } = await supabase
      .from('forge_ai_feedback')
      .insert({
        organization_id: organizationId,
        conversation_id: conversation.id,
        message_id: message.id,
        user_id: context.user.id,
        rating: parsed.data.rating
      })

    if (insertError) return { error: insertError.message }
  }

  return {
    message: parsed.data.rating === 0
      ? 'Feedback cleared.'
      : 'Feedback recorded.'
  }
}

export const setForgeAiConversationPinned = async (
  input: z.infer<typeof conversationSchema> & { pinned: boolean }
) => {
  const context = await requireTenantPermission('forge_ai.use')
  const parsed = conversationSchema.extend({ pinned: z.boolean() }).safeParse(input)

  if (!parsed.success) return { error: 'Invalid AI conversation.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const conversation = await requireOwnedConversation({
    organizationId,
    userId: context.user.id,
    conversationId: parsed.data.conversationId
  })

  if (!conversation) return { error: 'AI conversation not found.' }

  const { error } = await supabase
    .from('forge_ai_conversations')
    .update({
      pinned: parsed.data.pinned,
      updated_at: new Date().toISOString()
    })
    .eq('id', conversation.id)
    .eq('user_id', context.user.id)

  if (error) return { error: error.message }

  revalidatePath('/ai')
  return { message: parsed.data.pinned ? 'Conversation pinned.' : 'Conversation unpinned.' }
}

export const archiveForgeAiConversation = async (
  input: z.infer<typeof conversationSchema>
) => {
  const context = await requireTenantPermission('forge_ai.use')
  const parsed = conversationSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid AI conversation.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const conversation = await requireOwnedConversation({
    organizationId,
    userId: context.user.id,
    conversationId: parsed.data.conversationId
  })

  if (!conversation) return { error: 'AI conversation not found.' }

  const { error } = await supabase
    .from('forge_ai_conversations')
    .update({
      status: 'archived',
      pinned: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', conversation.id)
    .eq('user_id', context.user.id)

  if (error) return { error: error.message }

  revalidatePath('/ai')
  return { message: 'Conversation archived.' }
}

export const deleteForgeAiConversation = async (
  input: z.infer<typeof conversationSchema>
) => {
  const context = await requireTenantPermission('forge_ai.use')
  const parsed = conversationSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid AI conversation.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const conversation = await requireOwnedConversation({
    organizationId,
    userId: context.user.id,
    conversationId: parsed.data.conversationId
  })

  if (!conversation) return { error: 'AI conversation not found.' }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'forge_ai.conversation_deleted',
    entity_type: 'forge_ai_conversation',
    entity_id: conversation.id,
    before_value: {
      title: conversation.title,
      created_at: conversation.created_at,
      last_message_at: conversation.last_message_at
    },
    after_value: null
  })

  const { error } = await supabase
    .from('forge_ai_conversations')
    .delete()
    .eq('id', conversation.id)
    .eq('organization_id', organizationId)
    .eq('user_id', context.user.id)

  if (error) return { error: error.message }

  revalidatePath('/ai')
  return { message: 'Conversation deleted.' }
}
