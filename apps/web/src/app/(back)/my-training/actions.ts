'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { completeLearnerSection, materialSignedUrl, startLearnerQuiz, submitLearnerQuiz } from '@/lib/forgeTrainingLms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; url?: string; passed?: boolean; completionId?: string | null }

/** The signed-in employee may only work on their own assignments. */
const loadOwnAssignment = async (assignmentId: string) => {
  const context = await requireTenantPermission('my_training.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', context.user.id)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) return { error: 'Your login is not linked to a personnel record.' as const }

  const { data: assignment } = await supabase
    .from('forge_training_assignments')
    .select('id, course_id, personnel_id')
    .eq('organization_id', organizationId)
    .eq('id', assignmentId)
    .eq('personnel_id', person.id)
    .maybeSingle()

  if (!assignment) return { error: 'Training not found.' as const }

  return { context, organizationId, assignment }
}

const refresh = (assignmentId: string) => {
  revalidatePath(`/my-training/${assignmentId}`)
  revalidatePath('/my-training')
}

export const myCompleteSection = async (assignmentId: string, sectionId: string): Promise<Result> => {
  const target = await loadOwnAssignment(assignmentId)

  if ('error' in target) return { error: target.error }

  const result = await completeLearnerSection(target.organizationId, assignmentId, sectionId)

  refresh(assignmentId)

  return result
}

export const myStartQuiz = async (assignmentId: string): Promise<Result> => {
  const target = await loadOwnAssignment(assignmentId)

  if ('error' in target) return { error: target.error }

  const result = await startLearnerQuiz(target.organizationId, assignmentId, 'online', target.context.user.id)

  refresh(assignmentId)

  return result
}

export const mySubmitQuiz = async (assignmentId: string, attemptId: string, answers: number[], acknowledged: boolean): Promise<Result> => {
  const target = await loadOwnAssignment(assignmentId)

  if ('error' in target) return { error: target.error }

  const supabase = createServiceRoleClient() as any
  const { data: attempt } = await supabase.from('forge_training_attempts').select('id').eq('id', attemptId).eq('assignment_id', assignmentId).maybeSingle()

  if (!attempt) return { error: 'Quiz not found.' }

  const result = await submitLearnerQuiz(target.organizationId, attemptId, answers, acknowledged, target.context.user.id)

  refresh(assignmentId)

  return result
}

export const myOpenMaterial = async (assignmentId: string, materialId: string): Promise<Result> => {
  const target = await loadOwnAssignment(assignmentId)

  if ('error' in target) return { error: target.error }

  return materialSignedUrl(target.organizationId, target.assignment.course_id, materialId)
}
