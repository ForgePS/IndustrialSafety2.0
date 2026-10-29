'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const tenantExperienceSchema = z.object({
  organizationId: z.string().uuid(),
  elementId: z.string().uuid(),
  label: z.string().trim().optional(),
  description: z.string().trim().optional(),
  hidden: z.boolean().nullable(),
  sortOrder: z.number().int().nullable(),
  tenantEditModeOverride: z.enum(['none','content','presentation','full']).nullable(),
  locationEditModeOverride: z.enum(['none','content','presentation','full']).nullable(),
  userEditModeOverride: z.enum(['none','preference','presentation']).nullable(),
  canHideOverride: z.boolean().nullable(),
  canRenameOverride: z.boolean().nullable(),
  canReorderOverride: z.boolean().nullable()
})

export const saveCreatorTenantExperience = async (input: z.infer<typeof tenantExperienceSchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = tenantExperienceSchema.safeParse(input)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid tenant experience configuration.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const [{ data: tenant }, { data: element }, { data: before }] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', data.organizationId).maybeSingle(),
    supabase.from('forge_experience_elements').select('*').eq('id', data.elementId).maybeSingle(),
    supabase
      .from('forge_tenant_experience_overrides')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('element_id', data.elementId)
      .maybeSingle()
  ])

  if (!tenant) return { error: 'Tenant not found.' }
  if (!element) return { error: 'Experience element not found.' }

  const payload = {
    organization_id: data.organizationId,
    element_id: data.elementId,
    label: data.label || null,
    description: data.description || null,
    hidden: data.hidden,
    sort_order: data.sortOrder,
    tenant_edit_mode_override: data.tenantEditModeOverride,
    location_edit_mode_override: data.locationEditModeOverride,
    user_edit_mode_override: data.userEditModeOverride,
    can_hide_override: data.canHideOverride,
    can_rename_override: data.canRenameOverride,
    can_reorder_override: data.canReorderOverride,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('forge_tenant_experience_overrides')
    .upsert(payload)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.tenant_experience_updated',
    entity_type: 'experience_element',
    entity_id: data.elementId,
    before_value: before,
    after_value: payload
  })

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/experience`)
  revalidatePath(`/admin/creator/tenants/${data.organizationId}`)
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')

  return { message: 'Tenant experience updated.' }
}

export const resetCreatorTenantExperience = async ({
  organizationId,
  elementId
}: {
  organizationId: string
  elementId: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_tenant_experience_overrides')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('element_id', elementId)
    .maybeSingle()

  const { error } = await supabase
    .from('forge_tenant_experience_overrides')
    .delete()
    .eq('organization_id', organizationId)
    .eq('element_id', elementId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: organizationId,
    action: 'creator.tenant_experience_reset',
    entity_type: 'experience_element',
    entity_id: elementId,
    before_value: before,
    after_value: null
  })

  revalidatePath(`/admin/creator/tenants/${organizationId}/experience`)
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')

  return { message: 'Tenant experience reset to platform defaults.' }
}
