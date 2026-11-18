import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { personnelRecordWithinScope } from '@/lib/forgeScope'

/**
 * Attachments on training completions (1.0: certificate uploads on training records). Stored in the private
 * forge-training bucket under `<org>/completions/<completion>/<file>`.
 */

export const TRAINING_FILES_BUCKET = 'forge-training' as const

type Ctx = { user: { id: string }; activeOrganization: { id: string } }

export type CompletionAccess = { completion: any; person: any; canView: boolean; canEdit: boolean; own: boolean }

/**
 * What this user may do with one completion's attachments. View: Training View within scope, or their own
 * record. Edit (add / remove): Record Completion within scope.
 */
export const completionAccess = async (context: Ctx, completionId: string): Promise<CompletionAccess | null> => {
  if (!/^[0-9a-f-]{36}$/i.test(completionId)) return null

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: completion } = await supabase
    .from('forge_training_completions')
    .select('id, organization_id, personnel_id, course_id, archived_at, forge_personnel(id, organization_id, auth_user_id, supervisor_user_id, location_id, division_id)')
    .eq('organization_id', organizationId)
    .eq('id', completionId)
    .maybeSingle()

  if (!completion?.forge_personnel) return null

  const person = completion.forge_personnel
  const access = await getEffectiveTenantAccess({ organizationId, userId: context.user.id })
  const grant = (key: string) => access.effective.find(item => item.permissionKey === key && item.allowed)

  const inScope = async (key: string) => {
    const permission = grant(key)

    return permission ? personnelRecordWithinScope({ organizationId, userId: context.user.id, scope: permission.scope, record: person }) : false
  }

  const own = person.auth_user_id === context.user.id

  // An archived record is read-only: its attachments can be opened but not added or removed.
  const canEdit = !completion.archived_at && (await inScope('training.record_completion'))
  const canView = canEdit || own || (await inScope('training.view'))

  return canView ? { completion, person, canView, canEdit, own } : null
}

/** Live attachments for these completions, grouped by completion. */
export const getCompletionFiles = async (organizationId: string, completionIds: string[]) => {
  const result = new Map<string, Array<{ id: string; file_name: string; content_type: string; created_at: string }>>()

  if (!completionIds.length) return result

  const { data } = await (createServiceRoleClient() as any)
    .from('forge_training_completion_files')
    .select('id, completion_id, file_name, content_type, created_at')
    .eq('organization_id', organizationId)
    .in('completion_id', completionIds)
    .is('removed_at', null)
    .order('created_at')

  for (const row of data || []) {
    const list = result.get(row.completion_id) || []

    list.push(row)
    result.set(row.completion_id, list)
  }

  return result
}
