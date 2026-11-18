'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { trainingErrorMessage, trainingTodayIso } from '@/lib/forgeTrainingLms'
import { parsePaperResults } from '@/lib/forgeTrainingRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type PaperResultOutcome = { line: number; employeeNumber: string; name: string | null; ok: boolean; message: string }

/**
 * Records paper quiz results for a course (1.0 applyPaperResults): one line per employee with their
 * employee number and percentage, optionally the quiz date. People without an open assignment get one.
 */
export const recordPaperResults = async ({ courseId, raw, defaultDate }: { courseId: string; raw: string; defaultDate: string }) => {
  const context = await requireTenantPermission('training.record_completion')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: course } = await supabase.from('forge_training_courses').select('id, title').eq('organization_id', organizationId).eq('id', courseId).maybeSingle()

  if (!course) return { error: 'Course not found.', outcomes: [] as PaperResultOutcome[] }

  const today = trainingTodayIso()
  const fallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(defaultDate) ? defaultDate : today

  if (fallbackDate > today) return { error: 'The quiz date cannot be in the future.', outcomes: [] }

  const { rows, errors } = parsePaperResults(raw)

  if (errors.length) return { error: errors.join(' '), outcomes: [] }
  if (!rows.length) return { error: 'Enter at least one result.', outcomes: [] }

  const outcomes: PaperResultOutcome[] = []

  for (const row of rows) {
    const { data: matches } = await supabase.rpc('forge_find_personnel_by_employee_number', {
      p_organization_id: organizationId,
      p_employee_number: row.employeeNumber
    })

    const person = (matches || [])[0]

    // Same rule as recording a completion by hand: only people inside the recorder's scope. People outside it
    // get the same answer as an unknown number, so the result does not reveal who exists elsewhere.
    const inScope = person
      ? !person.archived_at && (await personnelRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record: person }))
      : false

    if (!person || !inScope) {
      outcomes.push({ line: row.line, employeeNumber: row.employeeNumber, name: null, ok: false, message: 'Employee number not found.' })
      continue
    }

    const name = `${person.first_name} ${person.last_name}`

    let { data: assignment } = await supabase
      .from('forge_training_assignments')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('course_id', courseId)
      .eq('personnel_id', person.id)
      .in('status', ['assigned', 'in_progress', 'overdue'])
      .order('assigned_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!assignment) {
      const { data: created, error: assignError } = await supabase
        .from('forge_training_assignments')
        .insert({ organization_id: organizationId, course_id: courseId, personnel_id: person.id, status: 'assigned', assigned_by: context.user.id, notes: 'Created when a paper quiz result was entered.' })
        .select('id')
        .single()

      if (assignError) {
        outcomes.push({ line: row.line, employeeNumber: row.employeeNumber, name, ok: false, message: trainingErrorMessage(assignError) })
        continue
      }

      assignment = created
    }

    const { data: attempt, error } = await supabase.rpc('forge_record_paper_training_result', {
      p_organization_id: organizationId,
      p_assignment_id: assignment.id,
      p_percent: row.percent,
      p_completed_on: row.date || fallbackDate,
      p_actor_user_id: context.user.id
    })

    outcomes.push(
      error
        ? { line: row.line, employeeNumber: row.employeeNumber, name, ok: false, message: trainingErrorMessage(error) }
        : { line: row.line, employeeNumber: row.employeeNumber, name, ok: true, message: attempt.passed ? `Passed (${row.percent}%)` : `Did not pass (${row.percent}%, needs ${attempt.passing_percent}%)` }
    )
  }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'training.paper_results_recorded',
    entityType: 'training_course',
    entityId: courseId,
    afterValue: { recorded: outcomes.filter(item => item.ok).length, failed: outcomes.filter(item => !item.ok).length }
  })

  revalidatePath('/training')
  revalidatePath('/training/matrix')

  return { message: `${outcomes.filter(item => item.ok).length} of ${outcomes.length} results recorded.`, outcomes }
}
