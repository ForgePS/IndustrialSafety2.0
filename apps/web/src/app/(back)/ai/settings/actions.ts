'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const settingsSchema = z.object({
  assistantName: z.string().trim().min(1).max(80),
  responseStyle: z.enum(['concise','professional','detailed']),
  systemInstructions: z.string().max(12000).optional()
})

const capabilitySchema = z.object({
  capabilityId: z.string().uuid(),
  enabled: z.boolean()
})

const actionSchema = z.object({
  actionId: z.string().uuid(),
  enabled: z.boolean()
})

export const saveTenantForgeAiSettings = async (
  input: z.infer<typeof settingsSchema>
) => {
  const context = await requireTenantPermission('forge_ai.manage')
  const parsed = settingsSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid Forge AI settings.' }
  }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_ai_tenant_settings')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!before) {
    return { error: 'Forge AI settings have not been provisioned for this tenant.' }
  }

  if (!before.tenant_can_configure) {
    return { error: 'Forge Creator has locked tenant AI configuration.' }
  }

  const payload = {
    assistant_name: parsed.data.assistantName,
    response_style: parsed.data.responseStyle,
    system_instructions: parsed.data.systemInstructions?.trim() || null,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('forge_ai_tenant_settings')
    .update(payload)
    .eq('organization_id', organizationId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.forge_ai_settings_updated',
    entity_type: 'forge_ai_tenant_settings',
    entity_id: organizationId,
    before_value: {
      assistant_name: before.assistant_name,
      response_style: before.response_style,
      system_instructions: before.system_instructions
    },
    after_value: payload
  })

  revalidatePath('/ai')
  revalidatePath('/ai/settings')
  return { message: 'Forge AI tenant settings saved.' }
}

export const saveTenantForgeAiCapability = async (
  input: z.infer<typeof capabilitySchema>
) => {
  const context = await requireTenantPermission('forge_ai.manage')
  const parsed = capabilitySchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid AI capability.' }
  }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: settings }, { data: capability }, { data: override }] = await Promise.all([
    supabase
      .from('forge_ai_tenant_settings')
      .select('tenant_can_configure')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('forge_ai_capabilities')
      .select('id, name, platform_enabled')
      .eq('id', parsed.data.capabilityId)
      .maybeSingle(),
    supabase
      .from('forge_ai_tenant_capabilities')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('capability_id', parsed.data.capabilityId)
      .maybeSingle()
  ])

  if (!settings?.tenant_can_configure) {
    return { error: 'Forge Creator has locked tenant AI configuration.' }
  }

  if (!capability?.platform_enabled) {
    return { error: 'This AI capability is disabled at the Forge platform level.' }
  }

  if (!override?.tenant_can_configure) {
    return { error: 'Forge Creator has not allowed the tenant to change this AI capability.' }
  }

  const { error } = await supabase
    .from('forge_ai_tenant_capabilities')
    .update({
      enabled: parsed.data.enabled,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('capability_id', parsed.data.capabilityId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.forge_ai_capability_updated',
    entity_type: 'forge_ai_capability',
    entity_id: parsed.data.capabilityId,
    before_value: { enabled: override.enabled },
    after_value: { enabled: parsed.data.enabled }
  })

  revalidatePath('/ai/settings')
  return { message: capability.name + ' updated.' }
}


export const saveTenantForgeAiAction = async (
  input: z.infer<typeof actionSchema>
) => {
  const context = await requireTenantPermission('forge_ai.manage')
  const parsed = actionSchema.safeParse(input)

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Invalid AI action.' }
  }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [{ data: settings }, { data: action }, { data: override }] = await Promise.all([
    supabase
      .from('forge_ai_tenant_settings')
      .select('tenant_can_configure')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('forge_ai_action_registry')
      .select('id, name, platform_enabled')
      .eq('id', parsed.data.actionId)
      .maybeSingle(),
    supabase
      .from('forge_ai_tenant_actions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('action_id', parsed.data.actionId)
      .maybeSingle()
  ])

  if (!settings?.tenant_can_configure) {
    return { error: 'Forge Creator has locked tenant AI configuration.' }
  }

  if (!action?.platform_enabled) {
    return { error: 'This AI action is disabled at the Forge platform level.' }
  }

  if (!override?.tenant_can_configure) {
    return { error: 'Forge Creator has not allowed the tenant to change this AI action.' }
  }

  const { error } = await supabase
    .from('forge_ai_tenant_actions')
    .update({
      enabled: parsed.data.enabled,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('organization_id', organizationId)
    .eq('action_id', parsed.data.actionId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.forge_ai_action_updated',
    entity_type: 'forge_ai_action',
    entity_id: parsed.data.actionId,
    before_value: { enabled: override.enabled },
    after_value: { enabled: parsed.data.enabled }
  })

  revalidatePath('/ai/settings')
  return { message: action.name + ' updated.' }
}
