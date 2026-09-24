import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import ForgeAiWorkspace from './ForgeAiWorkspace'
import {
  getForgeAiConversation,
  getForgeAiConversationMessages,
  getForgeAiRuntimeContext
} from '@/lib/forgeAiRuntime'

export const metadata: Metadata = { title: 'Forge AI' }

const ForgeAiPage = async ({
  searchParams
}: {
  searchParams: Promise<{ conversation?: string }>
}) => {
  const runtime = await getForgeAiRuntimeContext()

  if ('error' in runtime) {
    redirect('/dashboard')
  }

  const query = await searchParams
  const organizationId = runtime.activeOrganization.id
  const userId = runtime.user.id
  const supabase = createServiceRoleClient() as any

  const { data: conversations } = await supabase
    .from('forge_ai_conversations')
    .select('id, title, last_message_at, pinned')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(40)

  let activeConversationId: string | null = null
  let initialMessages: any[] = []

  if (query.conversation) {
    const conversation = await getForgeAiConversation({
      organizationId,
      userId,
      conversationId: query.conversation
    })

    if (conversation) {
      activeConversationId = conversation.id

      const [messages, { data: feedback }] = await Promise.all([
        getForgeAiConversationMessages({
          organizationId,
          conversationId: conversation.id,
          limit: 60
        }),
        supabase
          .from('forge_ai_feedback')
          .select('message_id, rating')
          .eq('organization_id', organizationId)
          .eq('conversation_id', conversation.id)
          .eq('user_id', userId)
      ])

      const feedbackByMessage = new Map(
        (feedback || []).map((item: any) => [Number(item.message_id), Number(item.rating)])
      )

      initialMessages = messages.map((message: any) => ({
        ...message,
        prepared_actions: message.metadata?.prepared_actions || [],
        rating: feedbackByMessage.get(Number(message.id)) || 0
      }))
    }
  }

  const quickPrompts = [
    'Give me a safety snapshot of what I can see in Forge.',
    'What training assignments are overdue in my scope?',
    'Show me open incidents that need attention.',
    'Which assets are out of service or in poor condition?',
    'Show inspections that are still open or waiting for review.',
    'Explain what Forge permissions I currently have.'
  ]

  return (
    <ForgeAiWorkspace
      assistantName={runtime.settings.assistant_name}
      organizationName={runtime.activeOrganization.name}
      conversations={conversations || []}
      activeConversationId={activeConversationId}
      initialMessages={initialMessages.filter(message => message.role === 'user' || message.role === 'assistant')}
      quickPrompts={quickPrompts}
      canManageKnowledge={runtime.access.effective.some(
        permission => permission.permissionKey === 'forge_ai.manage_knowledge' && permission.allowed
      )}
      canManageAi={runtime.access.effective.some(
        permission => permission.permissionKey === 'forge_ai.manage' && permission.allowed
      )}
      canViewUsage={runtime.access.effective.some(
        permission => permission.permissionKey === 'forge_ai.view_usage' && permission.allowed
      )}
      canUseActions={runtime.access.effective.some(
        permission =>
          ['forge_ai.run_actions','forge_ai.approve_actions'].includes(permission.permissionKey) &&
          permission.allowed
      )}
      canViewWatch={runtime.access.effective.some(
        permission => permission.permissionKey === 'forge_ai.view_alerts' && permission.allowed
      )}
    />
  )
}

export default ForgeAiPage
