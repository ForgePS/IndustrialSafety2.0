'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { assignGroupRequirements, trainingErrorMessage } from '@/lib/forgeTrainingLms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; id?: string }

const load = async (groupId?: string) => {
  const context = await requireTenantPermission('training.manage_groups')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  if (groupId) {
    const { data } = await supabase.from('forge_training_groups').select('*').eq('organization_id', organizationId).eq('id', groupId).maybeSingle()

    if (!data) return { error: 'Group not found.' as const }

    return { context, organizationId, supabase, group: data }
  }

  return { context, organizationId, supabase, group: null }
}

const refresh = () => {
  revalidatePath('/training/groups')
  revalidatePath('/training/matrix')
}

const groupSchema = z.object({
  name: z.string().trim().min(1, 'Group name is required.').max(200),
  description: z
    .string()
    .max(1000)
    .transform(value => value.trim() || null)
})

export const saveTrainingGroup = async ({ groupId, values }: { groupId?: string; values: z.input<typeof groupSchema> }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  const parsed = groupSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the group.' }

  const userId = target.context.user.id

  const query = groupId
    ? target.supabase.from('forge_training_groups').update({ ...parsed.data, updated_by: userId, updated_at: new Date().toISOString() }).eq('id', groupId)
    : target.supabase.from('forge_training_groups').insert({ ...parsed.data, organization_id: target.organizationId, created_by: userId, updated_by: userId })

  const { data, error } = await query.select('id').single()

  if (error) return { error: trainingErrorMessage(error) }

  await writeForgeAudit({ actorUserId: userId, organizationId: target.organizationId, action: groupId ? 'training.group_updated' : 'training.group_created', entityType: 'training_group', entityId: data.id, afterValue: parsed.data })
  refresh()

  return { id: data.id, message: groupId ? 'Group saved.' : 'Group created.' }
}

export const setTrainingGroupActive = async ({ groupId, active }: { groupId: string; active: boolean }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  const { error } = await target.supabase.from('forge_training_groups').update({ is_active: active, updated_by: target.context.user.id, updated_at: new Date().toISOString() }).eq('id', groupId)

  if (error) return { error: trainingErrorMessage(error) }

  refresh()

  return { message: active ? 'Group reactivated.' : 'Group deactivated. Its requirements no longer count in the matrix.' }
}

export const addGroupMembers = async ({ groupId, personnelIds }: { groupId: string; personnelIds: string[] }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  const ids = Array.from(new Set(personnelIds.filter(id => z.string().uuid().safeParse(id).success)))

  if (!ids.length) return { error: 'Choose at least one person.' }

  const { error } = await target.supabase.from('forge_training_group_members').upsert(
    ids.map(personnelId => ({ group_id: groupId, personnel_id: personnelId, organization_id: target.organizationId, added_by: target.context.user.id })),
    { onConflict: 'group_id,personnel_id', ignoreDuplicates: true }
  )

  if (error) return { error: trainingErrorMessage(error) }

  refresh()

  return { message: `${ids.length} ${ids.length === 1 ? 'person' : 'people'} added.` }
}

export const removeGroupMember = async ({ groupId, personnelId }: { groupId: string; personnelId: string }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  const { error } = await target.supabase.from('forge_training_group_members').delete().eq('group_id', groupId).eq('personnel_id', personnelId)

  if (error) return { error: trainingErrorMessage(error) }

  refresh()

  return { message: 'Removed from group.' }
}

export const addGroupRequirement = async ({ groupId, courseId }: { groupId: string; courseId: string }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  const { error } = await target.supabase
    .from('forge_training_group_requirements')
    .upsert({ group_id: groupId, course_id: courseId, organization_id: target.organizationId, added_by: target.context.user.id }, { onConflict: 'group_id,course_id', ignoreDuplicates: true })

  if (error) return { error: trainingErrorMessage(error) }

  await writeForgeAudit({ actorUserId: target.context.user.id, organizationId: target.organizationId, action: 'training.group_requirement_added', entityType: 'training_group', entityId: groupId, afterValue: { course_id: courseId } })
  refresh()

  return { message: 'Required course added.' }
}

export const removeGroupRequirement = async ({ groupId, courseId }: { groupId: string; courseId: string }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  const { error } = await target.supabase.from('forge_training_group_requirements').delete().eq('group_id', groupId).eq('course_id', courseId)

  if (error) return { error: trainingErrorMessage(error) }

  await writeForgeAudit({ actorUserId: target.context.user.id, organizationId: target.organizationId, action: 'training.group_requirement_removed', entityType: 'training_group', entityId: groupId, afterValue: { course_id: courseId } })
  refresh()

  return { message: 'Required course removed.' }
}

/** Assigns every required course to members who are missing it, expired, or expiring within 30 days. */
export const assignGroupTraining = async ({ groupId, dueDate }: { groupId: string; dueDate: string }): Promise<Result> => {
  const target = await load(groupId)

  if ('error' in target) return { error: target.error }

  // Assigning also needs the general assign permission.
  const assign = target.context.access.effective.find(item => item.permissionKey === 'training.assign' && item.allowed)

  if (!assign) return { error: 'Assigning training needs the Assign Training permission.' }
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Enter the due date as YYYY-MM-DD.' }

  const result = await assignGroupRequirements({ organizationId: target.organizationId, groupId, dueDate: dueDate || null, actorUserId: target.context.user.id })

  await writeForgeAudit({
    actorUserId: target.context.user.id,
    organizationId: target.organizationId,
    action: 'training.group_assigned',
    entityType: 'training_group',
    entityId: groupId,
    afterValue: { created: result.created, skipped: result.skipped, due_date: dueDate || null }
  })

  revalidatePath('/training')
  refresh()

  return { message: `${result.created} assignment${result.created === 1 ? '' : 's'} created; ${result.skipped} already current or assigned.` }
}
