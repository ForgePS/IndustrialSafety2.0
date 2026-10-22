'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const overrideSchema = z.object({
  elementId: z.string().uuid(),
  label: z.string().trim().optional(),
  description: z.string().trim().optional(),
  hidden: z.boolean().nullable(),
  sortOrder: z.number().int().nullable()
})

export const saveTenantExperienceOverride = async (input: z.infer<typeof overrideSchema>) => {
  const context = await requireTenantPermission('tenant.settings.manage')
  const parsed = overrideSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid customization.' }

  const supabase = createServiceRoleClient() as any
  const { data: element } = await supabase
    .from('forge_experience_elements')
    .select('*')
    .eq('id', parsed.data.elementId)
    .maybeSingle()

  if (!element) return { error: 'Experience element not found.' }
  if (element.tenant_edit_mode === 'none') return { error: 'Forge Creator has locked this element.' }

  const { data: before } = await supabase
    .from('forge_tenant_experience_overrides')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .eq('element_id', element.id)
    .maybeSingle()

  const payload = {
    organization_id: context.activeOrganization.id,
    element_id: element.id,
    label: element.can_rename ? parsed.data.label || null : before?.label || null,
    description:
      ['content', 'full'].includes(element.tenant_edit_mode)
        ? parsed.data.description || null
        : before?.description || null,
    hidden: element.can_hide ? parsed.data.hidden : before?.hidden ?? null,
    sort_order: element.can_reorder ? parsed.data.sortOrder : before?.sort_order ?? null,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_experience_overrides').upsert(payload)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: context.activeOrganization.id,
    action: 'tenant.experience_customized',
    entity_type: 'experience_element',
    entity_id: element.id,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/company/settings')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')

  return { message: 'Company customization saved.' }
}

export const resetTenantExperienceOverride = async (elementId: string) => {
  const context = await requireTenantPermission('tenant.settings.manage')
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_tenant_experience_overrides')
    .select('*')
    .eq('organization_id', context.activeOrganization.id)
    .eq('element_id', elementId)
    .maybeSingle()

  const { error } = await supabase
    .from('forge_tenant_experience_overrides')
    .delete()
    .eq('organization_id', context.activeOrganization.id)
    .eq('element_id', elementId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: context.activeOrganization.id,
    action: 'tenant.experience_reset',
    entity_type: 'experience_element',
    entity_id: elementId,
    before_value: before,
    after_value: null
  })

  revalidatePath('/company/settings')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')

  return { message: 'Reset to Forge default.' }
}
