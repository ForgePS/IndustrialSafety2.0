'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const lookupPolicySchema = z.object({
  organizationId: z.string().uuid(),
  lookupId: z.string().uuid(),
  label: z.string().trim().optional(),
  description: z.string().trim().optional(),
  canRenameOverride: z.boolean().nullable(),
  canReorderOverride: z.boolean().nullable(),
  canAddOptionsOverride: z.boolean().nullable(),
  canHideCoreOptionsOverride: z.boolean().nullable(),
  canDeleteCoreOptionsOverride: z.boolean().nullable()
})

const optionSchema = z.object({
  organizationId: z.string().uuid(),
  lookupId: z.string().uuid(),
  baseOptionId: z.string().uuid().nullable().optional(),
  customOptionKey: z.string().trim().nullable().optional(),
  label: z.string().trim().min(1),
  description: z.string().trim().optional(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  isCustom: z.boolean(),
  color: z.string().trim().optional(),
  icon: z.string().trim().optional()
})

export const saveCreatorTenantLookupPolicy = async (input: z.infer<typeof lookupPolicySchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = lookupPolicySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid lookup policy.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const [{ data: tenant }, { data: lookup }, { data: before }] = await Promise.all([
    supabase.from('organizations').select('id').eq('id', data.organizationId).maybeSingle(),
    supabase.from('forge_lookup_definitions').select('*').eq('id', data.lookupId).maybeSingle(),
    supabase
      .from('forge_tenant_lookup_overrides')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('lookup_id', data.lookupId)
      .maybeSingle()
  ])

  if (!tenant || !lookup) return { error: 'Tenant or lookup not found.' }

  const payload = {
    organization_id: data.organizationId,
    lookup_id: data.lookupId,
    label: data.label || null,
    description: data.description || null,
    can_rename_override: data.canRenameOverride,
    can_reorder_override: data.canReorderOverride,
    can_add_options_override: data.canAddOptionsOverride,
    can_hide_core_options_override: data.canHideCoreOptionsOverride,
    can_delete_core_options_override: data.canDeleteCoreOptionsOverride,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_lookup_overrides').upsert(payload)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.tenant_lookup_policy_updated',
    entity_type: 'lookup_definition',
    entity_id: data.lookupId,
    before_value: before,
    after_value: payload
  })

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/lookups`)
  return { message: 'Dropdown policy saved.' }
}

export const saveCreatorTenantLookupOption = async (input: z.infer<typeof optionSchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = optionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid lookup option.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const { data: lookup } = await supabase
    .from('forge_lookup_definitions')
    .select('*')
    .eq('id', data.lookupId)
    .maybeSingle()

  if (!lookup) return { error: 'Lookup not found.' }

  if (data.isCustom && !data.customOptionKey) return { error: 'Custom options require a stable option key.' }
  if (!data.isCustom && !data.baseOptionId) return { error: 'Core option override requires a base option.' }

  let before = null

  if (data.baseOptionId) {
    const { data: current } = await supabase
      .from('forge_tenant_lookup_options')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('lookup_id', data.lookupId)
      .eq('base_option_id', data.baseOptionId)
      .maybeSingle()
    before = current
  } else if (data.customOptionKey) {
    const { data: current } = await supabase
      .from('forge_tenant_lookup_options')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('lookup_id', data.lookupId)
      .eq('custom_option_key', data.customOptionKey)
      .maybeSingle()
    before = current
  }

  const payload = {
    organization_id: data.organizationId,
    lookup_id: data.lookupId,
    base_option_id: data.baseOptionId || null,
    custom_option_key: data.customOptionKey || null,
    label: data.label,
    description: data.description || null,
    sort_order: data.sortOrder,
    is_active: data.isActive,
    is_custom: data.isCustom,
    color: data.color || null,
    icon: data.icon || null,
    created_by: before?.created_by || user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_lookup_options').upsert(
    payload,
    data.baseOptionId
      ? { onConflict: 'organization_id,lookup_id,base_option_id' }
      : { onConflict: 'organization_id,lookup_id,custom_option_key' }
  )

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.tenant_lookup_option_saved',
    entity_type: 'lookup_option',
    entity_id: data.baseOptionId || data.customOptionKey || null,
    before_value: before,
    after_value: payload
  })

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/lookups`)
  return { message: 'Dropdown option saved.' }
}

export const deleteCreatorTenantCustomLookupOption = async ({
  organizationId,
  lookupId,
  optionId
}: {
  organizationId: string
  lookupId: string
  optionId: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const supabase = createServiceRoleClient() as any

  const { data: option } = await supabase
    .from('forge_tenant_lookup_options')
    .select('*')
    .eq('id', optionId)
    .eq('organization_id', organizationId)
    .eq('lookup_id', lookupId)
    .eq('is_custom', true)
    .maybeSingle()

  if (!option) return { error: 'Custom option not found.' }

  const { error } = await supabase.from('forge_tenant_lookup_options').delete().eq('id', optionId)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: organizationId,
    action: 'creator.tenant_lookup_option_deleted',
    entity_type: 'lookup_option',
    entity_id: optionId,
    before_value: option,
    after_value: null
  })

  revalidatePath(`/admin/creator/tenants/${organizationId}/lookups`)
  return { message: 'Custom option deleted.' }
}
