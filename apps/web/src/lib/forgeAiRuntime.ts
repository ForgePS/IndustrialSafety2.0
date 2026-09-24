import { createServiceRoleClient } from '@repo/supabase/server'
import { getTenantContext } from '@/lib/forgeTenantContext'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

export type ForgeAiTenantSettings = {
  organization_id: string
  enabled: boolean
  assistant_name: string
  provider: string
  model: string
  reasoning_effort: 'none' | 'low' | 'medium' | 'high'
  response_style: 'concise' | 'professional' | 'detailed'
  system_instructions: string | null
  allow_sensitive_data: boolean
  action_mode: 'read_only' | 'approval_required' | 'enabled'
  tenant_can_configure: boolean
  monthly_token_budget: number | null
  max_input_chars: number
  max_output_tokens: number
  max_tool_calls: number
  requests_per_minute: number
  data_retention_days: number
}

export const getForgeAiRuntimeContext = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) {
    return { error: 'not_authenticated' as const }
  }

  const access = await getEffectiveTenantAccess({
    organizationId: context.activeOrganization.id,
    userId: context.user.id
  })

  const usePermission = access.effective.find(item => item.permissionKey === 'forge_ai.use')

  if (!usePermission?.allowed) {
    return { error: 'forbidden' as const }
  }

  const supabase = createServiceRoleClient() as any
  const { data: settingsRow } = await supabase
    .from('forge_ai_tenant_settings')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .maybeSingle()

  const settings: ForgeAiTenantSettings = settingsRow || {
    organization_id: context.activeOrganization.id,
    enabled: true,
    assistant_name: 'Forge AI',
    provider: 'openai',
    model: process.env.FORGE_AI_MODEL || 'gpt-6-sol',
    reasoning_effort: 'medium',
    response_style: 'professional',
    system_instructions: null,
    allow_sensitive_data: false,
    action_mode: 'approval_required',
    tenant_can_configure: false,
    monthly_token_budget: null,
    max_input_chars: 12000,
    max_output_tokens: 3000,
    max_tool_calls: 8,
    requests_per_minute: 12,
    data_retention_days: 365
  }

  if (!settings.enabled) {
    return { error: 'disabled' as const }
  }

  const [{ data: capabilityRows }, { data: capabilityOverrides }] = await Promise.all([
    supabase
      .from('forge_ai_capabilities')
      .select('*')
      .eq('platform_enabled', true)
      .order('sort_order'),
    supabase
      .from('forge_ai_tenant_capabilities')
      .select('*')
      .eq('organization_id', context.activeOrganization.id)
  ])

  const capabilityOverrideById = new Map(
    (capabilityOverrides || []).map((item: any) => [item.capability_id, item])
  )

  const permissionByKey = new Map(
    access.effective.map(permission => [permission.permissionKey, permission])
  )

  const capabilities = (capabilityRows || [])
    .map((capability: any) => {
      const tenantOverride = capabilityOverrideById.get(capability.id)
      const enabled = tenantOverride?.enabled ?? true
      const requiredPermission = capability.required_permission_key
        ? permissionByKey.get(capability.required_permission_key)
        : null

      const permissionAllowed = capability.required_permission_key
        ? Boolean(requiredPermission?.allowed)
        : true

      const sensitiveAllowed = !capability.sensitive || (
        settings.allow_sensitive_data &&
        Boolean(permissionByKey.get('forge_ai.view_sensitive')?.allowed)
      )

      const actionAllowed = capability.capability_type !== 'action' || (
        settings.action_mode !== 'read_only' &&
        Boolean(permissionByKey.get('forge_ai.run_actions')?.allowed)
      )

      return {
        ...capability,
        enabled: Boolean(enabled && permissionAllowed && sensitiveAllowed && actionAllowed),
        effectivePermission: requiredPermission || null
      }
    })
    .filter((capability: any) => capability.enabled)

  return {
    user: context.user,
    activeOrganization: context.activeOrganization,
    access,
    settings,
    capabilities,
    permissionByKey
  }
}

export const getForgeAiConversation = async ({
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

export const getForgeAiConversationMessages = async ({
  organizationId,
  conversationId,
  limit = 24
}: {
  organizationId: string
  conversationId: string
  limit?: number
}) => {
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_ai_messages')
    .select('id, role, content, source_refs, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))

  if (error) throw new Error('Unable to load AI conversation messages: ' + error.message)

  return (data || []).reverse()
}

export const getForgeAiMonthlyUsage = async (organizationId: string) => {
  const supabase = createServiceRoleClient() as any
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data, error } = await supabase
    .from('forge_ai_usage_events')
    .select('total_tokens')
    .eq('organization_id', organizationId)
    .gte('created_at', monthStart)

  if (error) throw new Error('Unable to load AI usage: ' + error.message)

  return (data || []).reduce((sum: number, row: any) => sum + Number(row.total_tokens || 0), 0)
}
