'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const presentationSchema = z.object({
  lookupId: z.string().uuid(),
  label: z.string().trim().min(1),
  description: z.string().trim().optional()
})

const optionSchema = z.object({
  lookupId: z.string().uuid(),
  tenantOptionId: z.string().uuid().nullable().optional(),
  baseOptionId: z.string().uuid().nullable().optional(),
  customOptionKey: z.string().trim().nullable().optional(),
  label: z.string().trim().min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  isCustom: z.boolean()
})

const getPolicy = async (supabase: any, organizationId: string, lookupId: string) => {
  const [{ data: definition }, { data: override }] = await Promise.all([
    supabase.from('forge_lookup_definitions').select('*').eq('id', lookupId).eq('is_active', true).maybeSingle(),
    supabase.from('forge_tenant_lookup_overrides').select('*').eq('organization_id', organizationId).eq('lookup_id', lookupId).maybeSingle()
  ])

  if (!definition) return null

  return {
    definition,
    override,
    canRename: override?.can_rename_override ?? definition.tenant_can_rename,
    canReorder: override?.can_reorder_override ?? definition.tenant_can_reorder,
    canAddOptions: override?.can_add_options_override ?? definition.tenant_can_add_options,
    canHideCoreOptions: override?.can_hide_core_options_override ?? definition.tenant_can_hide_core_options
  }
}

export const saveCompanyLookupPresentation = async (input: z.infer<typeof presentationSchema>) => {
  const context = await requireTenantPermission('tenant.lookups.manage')
  const parsed = presentationSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid dropdown settings.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const policy = await getPolicy(supabase, organizationId, parsed.data.lookupId)

  if (!policy) return { error: 'Dropdown not found.' }
  if (!policy.canRename) return { error: 'Forge Creator has locked this dropdown presentation.' }

  const { data: before } = await supabase
    .from('forge_tenant_lookup_overrides')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('lookup_id', parsed.data.lookupId)
    .maybeSingle()

  const payload = {
    organization_id: organizationId,
    lookup_id: parsed.data.lookupId,
    label: parsed.data.label,
    description: parsed.data.description || null,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_lookup_overrides').upsert(payload)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.lookup_presentation_updated',
    entity_type: 'lookup_definition',
    entity_id: parsed.data.lookupId,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/company/settings/lookups')
  return { message: 'Dropdown settings saved.' }
}

export const saveCompanyLookupOption = async (input: z.infer<typeof optionSchema>) => {
  const context = await requireTenantPermission('tenant.lookups.manage')
  const parsed = optionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid dropdown option.' }

  const data = parsed.data
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const policy = await getPolicy(supabase, organizationId, data.lookupId)

  if (!policy) return { error: 'Dropdown not found.' }

  let baseOption: any = null
  if (!data.isCustom) {
    const { data: base } = await supabase
      .from('forge_lookup_options')
      .select('*')
      .eq('id', data.baseOptionId)
      .eq('lookup_id', data.lookupId)
      .maybeSingle()

    if (!base) return { error: 'Core dropdown option not found.' }
    baseOption = base
  } else if (!policy.canAddOptions) {
    return { error: 'Forge Creator has not allowed custom options for this dropdown.' }
  }

  let before: any = null

  if (data.tenantOptionId) {
    const { data: current } = await supabase
      .from('forge_tenant_lookup_options')
      .select('*')
      .eq('id', data.tenantOptionId)
      .eq('organization_id', organizationId)
      .eq('lookup_id', data.lookupId)
      .maybeSingle()
    before = current
  } else if (data.baseOptionId) {
    const { data: current } = await supabase
      .from('forge_tenant_lookup_options')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('lookup_id', data.lookupId)
      .eq('base_option_id', data.baseOptionId)
      .maybeSingle()
    before = current
  } else if (data.customOptionKey) {
    const { data: current } = await supabase
      .from('forge_tenant_lookup_options')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('lookup_id', data.lookupId)
      .eq('custom_option_key', data.customOptionKey)
      .maybeSingle()
    before = current
  }

  if (!data.isCustom) {
    const currentLabel = before?.label ?? baseOption.label
    const currentOrder = before?.sort_order ?? baseOption.sort_order
    const currentActive = before?.is_active ?? baseOption.is_active

    if (!policy.canRename && data.label !== currentLabel) return { error: 'Forge Creator has locked option labels.' }
    if (!policy.canReorder && data.sortOrder !== currentOrder) return { error: 'Forge Creator has locked option ordering.' }
    if (!policy.canHideCoreOptions && data.isActive !== currentActive) return { error: 'Forge Creator has locked core option visibility.' }
  }

  const customKey = data.isCustom
    ? (data.customOptionKey || '').toLowerCase().trim().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
    : null

  if (data.isCustom && !customKey) return { error: 'Custom options require a stable key.' }

  const payload = {
    organization_id: organizationId,
    lookup_id: data.lookupId,
    base_option_id: data.isCustom ? null : data.baseOptionId,
    custom_option_key: customKey,
    label: data.label,
    sort_order: data.sortOrder,
    is_active: data.isActive,
    is_custom: data.isCustom,
    created_by: before?.created_by || context.user.id,
    updated_at: new Date().toISOString()
  }

  const { data: saved, error } = before?.id
    ? await supabase.from('forge_tenant_lookup_options').update(payload).eq('id', before.id).select('*').single()
    : await supabase.from('forge_tenant_lookup_options').insert(payload).select('*').single()

  if (error || !saved) return { error: error?.message ?? 'Unable to save dropdown option.' }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.lookup_option_saved',
    entity_type: 'lookup_option',
    entity_id: saved.id,
    before_value: before,
    after_value: saved
  })

  revalidatePath('/company/settings/lookups')
  return { id: saved.id, message: 'Dropdown option saved.' }
}

export const deleteCompanyCustomLookupOption = async ({
  lookupId,
  optionId
}: {
  lookupId: string
  optionId: string
}) => {
  const context = await requireTenantPermission('tenant.lookups.manage')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const policy = await getPolicy(supabase, organizationId, lookupId)

  if (!policy?.canAddOptions) return { error: 'Forge Creator has locked custom options.' }

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
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.lookup_option_deleted',
    entity_type: 'lookup_option',
    entity_id: optionId,
    before_value: option,
    after_value: null
  })

  revalidatePath('/company/settings/lookups')
  return { message: 'Custom option deleted.' }
}
