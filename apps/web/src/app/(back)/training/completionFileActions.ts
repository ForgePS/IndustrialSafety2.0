'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { completionAccess } from '@/lib/forgeTrainingFiles'
import { getTenantContext } from '@/lib/forgeTenantContext'

/** Removes a training attachment. The file stays in storage and the row stays for the audit trail. */
export const removeCompletionFile = async ({ id }: { id: string }) => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization || !/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Attachment not found.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const { data: file } = await supabase.from('forge_training_completion_files').select('id, completion_id, file_name').eq('organization_id', organizationId).eq('id', id).is('removed_at', null).maybeSingle()

  if (!file) return { error: 'Attachment not found.' }

  const access = await completionAccess({ user: context.user, activeOrganization: context.activeOrganization }, file.completion_id)

  if (!access?.canEdit) return { error: 'Attachment not found.' }

  const { error } = await supabase.from('forge_training_completion_files').update({ removed_at: new Date().toISOString(), removed_by: context.user.id }).eq('id', id)

  if (error) return { error: 'Unable to remove the attachment.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'training.completion_file_removed',
    entityType: 'training_completion',
    entityId: file.completion_id,
    afterValue: { file_id: id, file_name: file.file_name }
  })
  revalidatePath('/personnel/' + access.person.id)
  revalidatePath('/training/reports')

  return { message: 'Attachment removed.' }
}
