'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { trainingErrorMessage } from '@/lib/forgeTrainingLms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

// Form inputs arrive as text; accept text or numbers and convert.
const numeric = (inner: z.ZodNumber) => z.union([z.string(), z.number()]).pipe(inner)

const wholeNumber = (min: number, max: number, message?: string) =>
  numeric(z.coerce.number().int(message).min(min, message).max(max, message))

type Result = { error?: string; message?: string; id?: string }

const text = (max: number) =>
  z
    .string()
    .max(max)
    .transform(value => value.trim() || null)

const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .transform(value => (value.trim() === '' ? null : Number(value)))
    .refine(value => value === null || (Number.isInteger(value) && value >= min && value <= max), `${label} must be a whole number from ${min} to ${max}.`)

/** Confirms the version belongs to the active company and returns it with the course id. */
const loadVersion = async (versionId: string) => {
  const context = await requireTenantPermission('training.manage_content')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: version } = await supabase
    .from('forge_training_course_versions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', versionId)
    .maybeSingle()

  if (!version) return { error: 'Version not found.' as const }

  return { context, organizationId, supabase, version }
}

const refresh = (courseId: string) => {
  revalidatePath(`/training/courses/${courseId}/content`)
  revalidatePath(`/training/courses/${courseId}`)
}

const audit = (context: any, organizationId: string, action: string, entityId: string, afterValue?: Record<string, unknown>) =>
  writeForgeAudit({ actorUserId: context.user.id, organizationId, action, entityType: 'training_course_version', entityId, afterValue })

export const createTrainingDraft = async ({ courseId }: { courseId: string }): Promise<Result> => {
  const context = await requireTenantPermission('training.manage_content')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: course } = await supabase.from('forge_training_courses').select('id').eq('organization_id', organizationId).eq('id', courseId).maybeSingle()

  if (!course) return { error: 'Course not found.' }

  const { data: versions } = await supabase.from('forge_training_course_versions').select('id, status, version_number').eq('course_id', courseId).order('version_number', { ascending: false })

  if ((versions || []).some((item: any) => item.status === 'draft')) return { error: 'This course already has a draft.' }

  const latest = (versions || []).find((item: any) => item.status === 'published') || (versions || [])[0]

  if (latest) {
    const { data, error } = await supabase.rpc('forge_clone_training_version', { p_organization_id: organizationId, p_version_id: latest.id, p_actor_user_id: context.user.id })

    if (error) return { error: trainingErrorMessage(error) }

    await audit(context, organizationId, 'training.version_drafted', data.id, { course_id: courseId, cloned_from: latest.id })
    refresh(courseId)

    return { id: data.id, message: `Draft version ${data.version_number} created from version ${latest.version_number}.` }
  }

  const { data, error } = await supabase
    .from('forge_training_course_versions')
    .insert({ organization_id: organizationId, course_id: courseId, version_number: 1, created_by: context.user.id, updated_by: context.user.id })
    .select('id')
    .single()

  if (error) return { error: trainingErrorMessage(error) }

  await audit(context, organizationId, 'training.version_drafted', data.id, { course_id: courseId })
  refresh(courseId)

  return { id: data.id, message: 'Draft version 1 created.' }
}

const settingsSchema = z.object({
  label: text(120),
  passing_percent: wholeNumber(1, 100, 'Passing score must be a whole number from 1 to 100.'),
  quiz_question_count: optionalInt(1, 500, 'Questions per quiz'),
  max_attempts: optionalInt(1, 50, 'Attempts allowed'),
  requires_acknowledgement: z.boolean(),
  acknowledgement_text: text(2000),
  effective_date: z
    .string()
    .transform(value => value.trim() || null)
    .refine(value => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter the effective date as YYYY-MM-DD.')
})

export type TrainingVersionSettings = z.input<typeof settingsSchema>

export const saveVersionSettings = async ({ versionId, values }: { versionId: string; values: TrainingVersionSettings }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }

  const parsed = settingsSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the settings.' }

  const { error } = await target.supabase
    .from('forge_training_course_versions')
    .update({ ...parsed.data, updated_by: target.context.user.id })
    .eq('id', versionId)

  if (error) return { error: trainingErrorMessage(error) }

  refresh(target.version.course_id)

  return { message: 'Settings saved.' }
}

const sectionSchema = z.object({
  title: z.string().trim().min(1, 'Section title is required.').max(300),
  body: text(20000),
  material_id: z
    .string()
    .transform(value => value.trim() || null)
    .refine(value => value === null || z.string().uuid().safeParse(value).success, 'Choose a material from this course.'),
  sort_order: wholeNumber(0, 10000),
  is_required: z.boolean(),
  estimated_minutes: optionalInt(1, 1440, 'Estimated minutes')
})

export type TrainingSectionValues = z.input<typeof sectionSchema>

export const saveSection = async ({ versionId, sectionId, values }: { versionId: string; sectionId?: string; values: TrainingSectionValues }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }

  const parsed = sectionSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the section.' }

  const query = sectionId
    ? target.supabase.from('forge_training_sections').update(parsed.data).eq('id', sectionId).eq('version_id', versionId)
    : target.supabase.from('forge_training_sections').insert({ ...parsed.data, organization_id: target.organizationId, version_id: versionId })

  const { error } = await query

  if (error) return { error: trainingErrorMessage(error) }

  refresh(target.version.course_id)

  return { message: sectionId ? 'Section saved.' : 'Section added.' }
}

export const deleteSection = async ({ versionId, sectionId }: { versionId: string; sectionId: string }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }

  const { error } = await target.supabase.from('forge_training_sections').delete().eq('id', sectionId).eq('version_id', versionId)

  if (error) return { error: trainingErrorMessage(error) }

  refresh(target.version.course_id)

  return { message: 'Section removed.' }
}

const questionSchema = z.object({
  stem: z.string().trim().min(1, 'Enter the question.').max(2000),
  choices: z
    .array(z.string().trim().max(500))
    .transform(values => values.filter(value => value.length > 0))
    .refine(values => values.length >= 2 && values.length <= 6, 'Questions need 2 to 6 answers.'),
  correct_index: wholeNumber(0, 5),
  explanation: text(2000),
  sort_order: wholeNumber(0, 10000),
  is_active: z.boolean()
})

export type TrainingQuestionValues = z.input<typeof questionSchema>

export const saveQuestion = async ({ versionId, questionId, values }: { versionId: string; questionId?: string; values: TrainingQuestionValues }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }

  // Blank answers are dropped, so the correct answer is chosen against the filled-in list.
  const filled = values.choices.map((choice, index) => ({ choice: choice.trim(), index })).filter(item => item.choice)
  const correctPosition = filled.findIndex(item => item.index === Number(values.correct_index))

  if (correctPosition < 0) return { error: 'Choose which answer is correct.' }

  const parsed = questionSchema.safeParse({ ...values, correct_index: correctPosition })

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the question.' }

  const query = questionId
    ? target.supabase.from('forge_training_questions').update(parsed.data).eq('id', questionId).eq('version_id', versionId)
    : target.supabase.from('forge_training_questions').insert({ ...parsed.data, organization_id: target.organizationId, version_id: versionId })

  const { error } = await query

  if (error) return { error: trainingErrorMessage(error) }

  refresh(target.version.course_id)

  return { message: questionId ? 'Question saved.' : 'Question added.' }
}

export const deleteQuestion = async ({ versionId, questionId }: { versionId: string; questionId: string }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }

  const { error } = await target.supabase.from('forge_training_questions').delete().eq('id', questionId).eq('version_id', versionId)

  if (error) return { error: trainingErrorMessage(error) }

  refresh(target.version.course_id)

  return { message: 'Question removed.' }
}

export const publishVersion = async ({ versionId }: { versionId: string }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }

  const { data, error } = await target.supabase.rpc('forge_publish_training_version', {
    p_organization_id: target.organizationId,
    p_version_id: versionId,
    p_actor_user_id: target.context.user.id
  })

  if (error) return { error: trainingErrorMessage(error) }

  await audit(target.context, target.organizationId, 'training.version_published', versionId, { course_id: data.course_id, version_number: data.version_number })
  refresh(target.version.course_id)

  return { message: `Version ${data.version_number} published. Earlier versions are retired; open attempts keep their questions.` }
}

export const discardDraft = async ({ versionId }: { versionId: string }): Promise<Result> => {
  const target = await loadVersion(versionId)

  if ('error' in target) return { error: target.error }
  if (target.version.status !== 'draft') return { error: 'Only drafts can be discarded.' }

  const { error } = await target.supabase.from('forge_training_course_versions').delete().eq('id', versionId)

  if (error) return { error: trainingErrorMessage(error) }

  await audit(target.context, target.organizationId, 'training.version_discarded', versionId, { course_id: target.version.course_id })
  refresh(target.version.course_id)

  return { message: 'Draft discarded.' }
}

export const archiveMaterial = async ({ courseId, materialId }: { courseId: string; materialId: string }): Promise<Result> => {
  const context = await requireTenantPermission('training.manage_content')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_training_materials')
    .update({ archived_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('course_id', courseId)
    .eq('id', materialId)
    .is('archived_at', null)
    .select('id, storage_path')
    .maybeSingle()

  if (error) return { error: trainingErrorMessage(error) }
  if (!data) return { error: 'Material not found.' }

  // The file stays in storage: past attempts and certificates may still refer to the version that used it.
  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'training.material_archived', entityType: 'training_material', entityId: materialId })

  refresh(courseId)

  return { message: 'Material archived. Sections that used it no longer show it.' }
}
