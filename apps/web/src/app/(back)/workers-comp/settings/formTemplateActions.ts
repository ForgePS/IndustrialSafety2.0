'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

/** Removes a company form: it stops being offered on cases. Forms already filled on it keep printing from it. */
export const archiveWcFormTemplate = async (templateId: string): Promise<{ error?: string; message?: string }> => {
  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_wc_form_templates')
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', templateId)
    .eq('is_active', true)
    .select('id, form_key')

  if (error) return { error: 'Unable to remove the form.' }
  if (!data?.length) return { error: 'Form not found.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.form_template_archived',
    entityType: 'workers_comp_form_template',
    entityId: templateId,
    afterValue: { form_key: data[0].form_key }
  })

  revalidatePath('/workers-comp/settings')

  return { message: 'Form removed. Forms already filled on it are kept.' }
}
