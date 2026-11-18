'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const elementSchema = z.object({
  elementId: z.string().uuid(),
  name: z.string().trim().min(1),
  defaultLabel: z.string().trim().optional(),
  defaultDescription: z.string().trim().optional(),
  category: z.string().trim().min(1),
  platformEnabled: z.boolean(),
  tenantEditMode: z.enum(['none','content','presentation','full']),
  locationEditMode: z.enum(['none','content','presentation','full']),
  userEditMode: z.enum(['none','preference','presentation']),
  canHide: z.boolean(),
  canRename: z.boolean(),
  canReorder: z.boolean()
})

export const saveExperienceElement = async (input: z.infer<typeof elementSchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = elementSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid experience configuration.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const { data: before, error: beforeError } = await supabase
    .from('forge_experience_elements')
    .select('*')
    .eq('id', data.elementId)
    .single()

  if (beforeError || !before) return { error: beforeError?.message ?? 'Experience element not found.' }

  const { data: after, error } = await supabase
    .from('forge_experience_elements')
    .update({
      name: data.name,
      default_label: data.defaultLabel || null,
      default_description: data.defaultDescription || null,
      category: data.category,
      platform_enabled: data.platformEnabled,
      tenant_edit_mode: data.tenantEditMode,
      location_edit_mode: data.locationEditMode,
      user_edit_mode: data.userEditMode,
      can_hide: data.canHide,
      can_rename: data.canRename,
      can_reorder: data.canReorder,
      updated_at: new Date().toISOString()
    })
    .eq('id', data.elementId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to save experience element.' }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    action: 'experience.element_updated',
    entity_type: 'experience_element',
    entity_id: data.elementId,
    before_value: before,
    after_value: after
  })

  revalidatePath('/admin/creator/experience')
  return { message: 'Experience element updated.' }
}
