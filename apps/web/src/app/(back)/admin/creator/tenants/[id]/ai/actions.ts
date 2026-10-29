'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const settingsSchema = z.object({
  organizationId: z.string().uuid(),
  enabled: z.boolean(),
  assistantName: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  reasoningEffort: z.enum(['none','low','medium','high']),
  responseStyle: z.enum(['concise','professional','detailed']),
  systemInstructions: z.string().max(12000).optional(),
  allowSensitiveData: z.boolean(),
  actionMode: z.enum(['read_only','approval_required','enabled']),
  tenantCanConfigure: z.boolean(),
  monthlyTokenBudget: z.number().int().positive().nullable(),
  maxInputChars: z.number().int().min(500).max(100000),
  maxOutputTokens: z.number().int().min(256).max(16000),
  maxToolCalls: z.number().int().min(0).max(30),
  requestsPerMinute: z.number().int().min(1).max(120),
  dataRetentionDays: z.number().int().min(1).max(3650)
})

const capabilitySchema = z.object({
  organizationId: z.string().uuid(),
  capabilityId: z.string().uuid(),
  enabled: z.boolean(),
  tenantCanConfigure: z.boolean()
})

const actionSchema = z.object({
  organizationId: z.string().uuid(),
  actionId: z.string().uuid(),
  enabled: z.boolean(),
  tenantCanConfigure: z.boolean()
})

export const saveCreatorForgeAiSettings = async (
  input: z.infer<typeof settingsSchema>
) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = settingsSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid Forge AI configuration.' }
  }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const [{ data: tenant }, { data: before }] = await Promise.all([
    supabase.from('organizations').select('id').eq('id', data.organizationId).maybeSingle(),
    supabase.from('forge_ai_tenant_settings').select('*').eq('organization_id', data.organizationId).maybeSingle()
  ])

  if (!tenant) return { error: 'Tenant not found.' }

  const payload = {
    organization_id: data.organizationId,
    enabled: data.enabled,
    assistant_name: data.assistantName,
    provider: 'openai',
    model: data.model,
    reasoning_effort: data.reasoningEffort,
    response_style: data.responseStyle,
    system_instructions: data.systemInstructions?.trim() || null,
    allow_sensitive_data: data.allowSensitiveData,
    action_mode: data.actionMode,
    tenant_can_configure: data.tenantCanConfigure,
    monthly_token_budget: data.monthlyTokenBudget,
    max_input_chars: data.maxInputChars,
    max_output_tokens: data.maxOutputTokens,
    max_tool_calls: data.maxToolCalls,
    requests_per_minute: data.requestsPerMinute,
    data_retention_days: data.dataRetentionDays,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('forge_ai_tenant_settings')
    .upsert(payload, { onConflict: 'organization_id' })

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.forge_ai_settings_updated',
    entity_type: 'forge_ai_tenant_settings',
    entity_id: data.organizationId,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/admin/creator/tenants/' + data.organizationId + '/ai')
  return { message: 'Forge AI settings saved.' }
}

export const saveCreatorForgeAiCapability = async (
  input: z.infer<typeof capabilitySchema>
) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = capabilitySchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid AI capability configuration.' }
  }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const [{ data: capability }, { data: before }] = await Promise.all([
    supabase.from('forge_ai_capabilities').select('*').eq('id', data.capabilityId).maybeSingle(),
    supabase
      .from('forge_ai_tenant_capabilities')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('capability_id', data.capabilityId)
      .maybeSingle()
  ])

  if (!capability) return { error: 'AI capability not found.' }

  const payload = {
    organization_id: data.organizationId,
    capability_id: data.capabilityId,
    enabled: data.enabled,
    tenant_can_configure: data.tenantCanConfigure,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('forge_ai_tenant_capabilities')
    .upsert(payload, { onConflict: 'organization_id,capability_id' })

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.forge_ai_capability_updated',
    entity_type: 'forge_ai_capability',
    entity_id: data.capabilityId,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/admin/creator/tenants/' + data.organizationId + '/ai')
  return { message: capability.name + ' updated.' }
}


export const saveCreatorForgeAiAction = async (
  input: z.infer<typeof actionSchema>
) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = actionSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid AI action configuration.' }
  }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const [{ data: action }, { data: before }] = await Promise.all([
    supabase.from('forge_ai_action_registry').select('*').eq('id', data.actionId).maybeSingle(),
    supabase
      .from('forge_ai_tenant_actions')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('action_id', data.actionId)
      .maybeSingle()
  ])

  if (!action) return { error: 'AI action not found.' }

  const payload = {
    organization_id: data.organizationId,
    action_id: data.actionId,
    enabled: data.enabled,
    tenant_can_configure: data.tenantCanConfigure,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('forge_ai_tenant_actions')
    .upsert(payload, { onConflict: 'organization_id,action_id' })

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.forge_ai_action_updated',
    entity_type: 'forge_ai_action',
    entity_id: data.actionId,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/admin/creator/tenants/' + data.organizationId + '/ai')
  return { message: action.name + ' updated.' }
}
