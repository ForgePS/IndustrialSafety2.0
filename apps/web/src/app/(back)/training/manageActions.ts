'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { trainingErrorMessage, trainingTodayIso } from '@/lib/forgeTrainingLms'
import { assignmentManageable, parseAssignmentEdit, parseReason, parseRecordEdit } from '@/lib/forgeTrainingManageRules'

/**
 * Batch 1 training management (1.0 PATCH/archive on assignments and records, course archive). Every action checks
 * the permission, the person's scope for it, and writes an audit row with before and after.
 */

type Result = { error?: string; message?: string }

const UUID = /^[0-9a-f-]{36}$/i

const PERSON_COLUMNS = 'id, organization_id, auth_user_id, supervisor_user_id, location_id, division_id, archived_at'

const refresh = (personnelId?: string) => {
  revalidatePath('/training')
  revalidatePath('/training/matrix')
  revalidatePath('/training/reports')
  revalidatePath('/my-training')
  if (personnelId) revalidatePath('/personnel/' + personnelId)
}

/** Loads one row of `table` with its person, and checks the person is inside the permission's scope. */
const loadInScope = async (permissionKey: string, table: 'forge_training_assignments' | 'forge_training_completions', id: string, notFound: string) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id

  if (!UUID.test(id)) return { error: notFound }

  const supabase = createServiceRoleClient() as any
  const { data: row } = await supabase.from(table).select(`*, forge_personnel(${PERSON_COLUMNS})`).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!row?.forge_personnel) return { error: notFound }

  const allowed = await personnelRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record: row.forge_personnel })

  // Out of scope reads as not found, so the action never confirms a record exists.
  if (!allowed) return { error: notFound }

  const { forge_personnel: person, ...before } = row

  return { context, organizationId, supabase, before, person }
}

// ---------------------------------------------------------------------------
// Assignments (training.assign)
// ---------------------------------------------------------------------------

export const updateTrainingAssignment = async ({ assignmentId, dueDate, notes }: { assignmentId: string; dueDate: string | null; notes: string | null }): Promise<Result> => {
  const target = await loadInScope('training.assign', 'forge_training_assignments', assignmentId, 'Assignment not found.')

  if ('error' in target) return { error: target.error }
  if (!assignmentManageable(target.before.status)) return { error: target.before.status === 'completed' ? 'A completed assignment cannot be edited.' : 'A canceled assignment cannot be edited.' }

  const parsed = parseAssignmentEdit({ dueDate, notes })

  if ('error' in parsed) return { error: parsed.error }

  const { data: after, error } = await target.supabase
    .from('forge_training_assignments')
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('organization_id', target.organizationId)
    .select('*')
    .single()

  if (error || !after) return { error: error ? trainingErrorMessage(error) : 'Unable to update the assignment.' }

  await writeForgeAudit({
    actorUserId: target.context.user.id,
    organizationId: target.organizationId,
    action: 'training.assignment_updated',
    entityType: 'training_assignment',
    entityId: assignmentId,
    beforeValue: target.before,
    afterValue: after
  })
  refresh(target.before.personnel_id)

  return { message: 'Assignment updated.' }
}

/** Cancels one person's assignment (1.0 "delete" and "remove assignee"). Completed assignments cannot be canceled. */
export const cancelTrainingAssignment = async ({ assignmentId, reason }: { assignmentId: string; reason: string | null }): Promise<Result> => {
  const target = await loadInScope('training.assign', 'forge_training_assignments', assignmentId, 'Assignment not found.')

  if ('error' in target) return { error: target.error }
  if (target.before.status === 'completed') return { error: 'A completed assignment cannot be canceled.' }
  if (target.before.status === 'canceled') return { error: 'This assignment is already canceled.' }

  const parsedReason = parseReason(reason, false)

  if ('error' in parsedReason) return { error: parsedReason.error }

  const { data: after, error } = await target.supabase.rpc('forge_cancel_training_assignment', {
    p_organization_id: target.organizationId,
    p_assignment_id: assignmentId,
    p_actor_user_id: target.context.user.id,
    p_reason: parsedReason.value
  })

  if (error || !after) return { error: error ? trainingErrorMessage(error) : 'Unable to cancel the assignment.' }

  await writeForgeAudit({
    actorUserId: target.context.user.id,
    organizationId: target.organizationId,
    action: 'training.assignment_canceled',
    entityType: 'training_assignment',
    entityId: assignmentId,
    beforeValue: target.before,
    afterValue: after,
    reason: parsedReason.value
  })
  refresh(target.before.personnel_id)

  return { message: 'Assignment canceled.' }
}

// ---------------------------------------------------------------------------
// Training records (training.record_completion)
// ---------------------------------------------------------------------------

export type TrainingRecordEditInput = {
  completionId: string
  score: string | null
  instructor: string | null
  completedDate: string
  expiresAt: string | null
  notes: string | null
}

/** Edits a training record. Approval status and the certificate number are never changed here. */
export const updateTrainingRecord = async (input: TrainingRecordEditInput): Promise<Result> => {
  const target = await loadInScope('training.record_completion', 'forge_training_completions', input.completionId, 'Training record not found.')

  if ('error' in target) return { error: target.error }

  const parsed = parseRecordEdit(target.before, input, trainingTodayIso())

  if ('error' in parsed) return { error: parsed.error }

  const { data: after, error } = await target.supabase
    .from('forge_training_completions')
    .update({ ...parsed.value, updated_by: target.context.user.id, updated_at: new Date().toISOString() })
    .eq('id', input.completionId)
    .eq('organization_id', target.organizationId)
    .is('archived_at', null)
    .select('*')
    .single()

  if (error || !after) return { error: error ? trainingErrorMessage(error) : 'Unable to update the training record.' }

  await writeForgeAudit({
    actorUserId: target.context.user.id,
    organizationId: target.organizationId,
    action: 'training.completion_updated',
    entityType: 'training_completion',
    entityId: input.completionId,
    beforeValue: target.before,
    afterValue: after
  })
  refresh(target.before.personnel_id)

  return { message: 'Training record updated.' }
}

/** Archives a training record with a reason. It stays for the audit trail and stops counting everywhere. */
export const archiveTrainingRecord = async ({ completionId, reason }: { completionId: string; reason: string }): Promise<Result> => {
  const target = await loadInScope('training.record_completion', 'forge_training_completions', completionId, 'Training record not found.')

  if ('error' in target) return { error: target.error }
  if (target.before.archived_at) return { error: 'This training record is already archived.' }

  const parsedReason = parseReason(reason, true)

  if ('error' in parsedReason) return { error: parsedReason.error }

  const now = new Date().toISOString()

  const { data: after, error } = await target.supabase
    .from('forge_training_completions')
    .update({ archived_at: now, archived_by: target.context.user.id, archive_reason: parsedReason.value, updated_by: target.context.user.id, updated_at: now })
    .eq('id', completionId)
    .eq('organization_id', target.organizationId)
    .is('archived_at', null)
    .select('*')
    .single()

  if (error || !after) return { error: error ? trainingErrorMessage(error) : 'Unable to archive the training record.' }

  await writeForgeAudit({
    actorUserId: target.context.user.id,
    organizationId: target.organizationId,
    action: 'training.completion_archived',
    entityType: 'training_completion',
    entityId: completionId,
    beforeValue: target.before,
    afterValue: after,
    reason: parsedReason.value
  })
  refresh(target.before.personnel_id)

  return { message: 'Training record archived.' }
}

// ---------------------------------------------------------------------------
// Course lifecycle (training.create_course)
// ---------------------------------------------------------------------------

/** Archives or reactivates a course. Archived courses take no new assignments and drop out of group auto-assign. */
export const setTrainingCourseActive = async ({ courseId, active }: { courseId: string; active: boolean }): Promise<Result> => {
  const context = await requireTenantPermission('training.create_course')
  const organizationId = context.activeOrganization.id

  if (!UUID.test(courseId)) return { error: 'Training course not found.' }

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase.from('forge_training_courses').select('*').eq('id', courseId).eq('organization_id', organizationId).maybeSingle()

  if (!before) return { error: 'Training course not found.' }
  if (before.is_active === active) return { message: active ? 'Course is already active.' : 'Course is already archived.' }

  const { data: after, error } = await supabase
    .from('forge_training_courses')
    .update({ is_active: active, updated_by: context.user.id, updated_at: new Date().toISOString() })
    .eq('id', courseId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update the course.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: active ? 'training.course_reactivated' : 'training.course_archived',
    entityType: 'training_course',
    entityId: courseId,
    beforeValue: before,
    afterValue: after
  })

  revalidatePath('/training')
  revalidatePath('/training/courses/' + courseId)
  revalidatePath('/training/matrix')
  revalidatePath('/training/groups')

  return { message: active ? 'Course reactivated.' : 'Course archived. Open assignments stay; no new ones can be made.' }
}
