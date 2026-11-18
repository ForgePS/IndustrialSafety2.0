'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveForm } from '@/lib/forgeForms'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type TrainingFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const cleanNumber = (value: unknown) => {
  if (value === '' || value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const validateConfiguredForm = async ({
  organizationId,
  formKey,
  values
}: {
  organizationId: string
  formKey: string
  values: TrainingFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey })
  if (!form) return { error: 'Training form is not configured.' }

  for (const field of form.fields) {
    const value = values[field.key]

    if (field.required && (value == null || value === '')) {
      return { error: `${field.label} is required.` }
    }

    if (field.fieldType === 'select' && field.lookupOptions.length && value) {
      if (!field.lookupOptions.some(option => option.key === value)) {
        return { error: `${field.label} contains an invalid option.` }
      }
    }
  }

  return { form }
}

const audit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityType,
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityType: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

export const createTrainingCourse = async (values: TrainingFormValues) => {
  const context = await requireTenantPermission('training.create_course')
  const organizationId = context.activeOrganization.id
  const validation = await validateConfiguredForm({
    organizationId,
    formKey: 'training.course',
    values
  })

  if ('error' in validation) return validation

  const title = cleanText(values.title)
  if (!title) return { error: 'Course Title is required.' }

  const supabase = createServiceRoleClient() as any
  const payload = {
    organization_id: organizationId,
    course_code: cleanText(values.course_code),
    title,
    description: cleanText(values.description),
    category_key: cleanText(values.category_key),
    delivery_method: cleanText(values.delivery_method),
    duration_minutes: cleanNumber(values.duration_minutes),
    validity_months: cleanNumber(values.validity_months),
    is_active: true,
    created_by: context.user.id,
    updated_by: context.user.id
  }

  const { data: course, error } = await supabase
    .from('forge_training_courses')
    .insert(payload)
    .select('*')
    .single()

  if (error || !course) return { error: error?.message ?? 'Unable to create training course.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'training.course_created',
    entityType: 'training_course',
    entityId: course.id,
    after: course
  })

  revalidatePath('/training')
  return { id: course.id, message: 'Training course created.' }
}

export const updateTrainingCourse = async ({
  courseId,
  values
}: {
  courseId: string
  values: TrainingFormValues
}) => {
  const context = await requireTenantPermission('training.create_course')
  const organizationId = context.activeOrganization.id
  const validation = await validateConfiguredForm({
    organizationId,
    formKey: 'training.course',
    values
  })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: before } = await supabase
    .from('forge_training_courses')
    .select('*')
    .eq('id', courseId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!before) return { error: 'Training course not found.' }

  const title = cleanText(values.title)
  if (!title) return { error: 'Course Title is required.' }

  const { data: after, error } = await supabase
    .from('forge_training_courses')
    .update({
      course_code: cleanText(values.course_code),
      title,
      description: cleanText(values.description),
      category_key: cleanText(values.category_key),
      delivery_method: cleanText(values.delivery_method),
      duration_minutes: cleanNumber(values.duration_minutes),
      validity_months: cleanNumber(values.validity_months),
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', courseId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update training course.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'training.course_updated',
    entityType: 'training_course',
    entityId: courseId,
    before,
    after
  })

  revalidatePath('/training')
  revalidatePath(`/training/courses/${courseId}`)
  return { message: 'Training course updated.' }
}

const loadPersonnelForPermission = async ({
  supabase,
  organizationId,
  personnelId,
  userId,
  scope
}: {
  supabase: any
  organizationId: string
  personnelId: string
  userId: string
  scope: string | null
}) => {
  const { data: personnel } = await supabase
    .from('forge_personnel')
    .select('*')
    .eq('id', personnelId)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .maybeSingle()

  if (!personnel) return { error: 'Personnel record not found.' }

  const allowed = await personnelRecordWithinScope({
    organizationId,
    userId,
    scope,
    record: personnel
  })

  if (!allowed) return { error: 'Selected personnel is outside your Training access scope.' }

  return { personnel }
}

const loadCourse = async ({
  supabase,
  organizationId,
  courseId
}: {
  supabase: any
  organizationId: string
  courseId: string
}) => {
  const { data: course } = await supabase
    .from('forge_training_courses')
    .select('*')
    .eq('id', courseId)
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .maybeSingle()

  return course
}

export const assignTraining = async (values: TrainingFormValues) => {
  const context = await requireTenantPermission('training.assign')
  const organizationId = context.activeOrganization.id
  const validation = await validateConfiguredForm({
    organizationId,
    formKey: 'training.assignment',
    values
  })

  if ('error' in validation) return validation

  const courseId = cleanText(values.course_id)
  const personnelId = cleanText(values.personnel_id)
  if (!courseId || !personnelId) return { error: 'Course and Personnel are required.' }

  const supabase = createServiceRoleClient() as any
  const course = await loadCourse({ supabase, organizationId, courseId })
  if (!course) return { error: 'Training course not found.' }

  const personnelResult = await loadPersonnelForPermission({
    supabase,
    organizationId,
    personnelId,
    userId: context.user.id,
    scope: context.permission.scope
  })

  if ('error' in personnelResult) return personnelResult

  const { data: assignment, error } = await supabase
    .from('forge_training_assignments')
    .insert({
      organization_id: organizationId,
      course_id: courseId,
      personnel_id: personnelId,
      status: 'assigned',
      due_date: cleanText(values.due_date),
      notes: cleanText(values.notes),
      assigned_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !assignment) return { error: error?.message ?? 'Unable to assign training.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'training.assigned',
    entityType: 'training_assignment',
    entityId: assignment.id,
    after: assignment
  })

  revalidatePath('/training')
  revalidatePath('/my-training')
  return { id: assignment.id, message: 'Training assigned.' }
}

export const recordTrainingCompletion = async (values: TrainingFormValues) => {
  const context = await requireTenantPermission('training.record_completion')
  const organizationId = context.activeOrganization.id
  const validation = await validateConfiguredForm({
    organizationId,
    formKey: 'training.completion',
    values
  })

  if ('error' in validation) return validation

  const courseId = cleanText(values.course_id)
  const personnelId = cleanText(values.personnel_id)
  const completedAt = cleanText(values.completed_at)
  if (!courseId || !personnelId || !completedAt) return { error: 'Course, Personnel, and Completed Date & Time are required.' }

  const supabase = createServiceRoleClient() as any
  const course = await loadCourse({ supabase, organizationId, courseId })
  if (!course) return { error: 'Training course not found.' }

  const personnelResult = await loadPersonnelForPermission({
    supabase,
    organizationId,
    personnelId,
    userId: context.user.id,
    scope: context.permission.scope
  })

  if ('error' in personnelResult) return personnelResult

  const completedDate = new Date(completedAt)
  if (Number.isNaN(completedDate.getTime())) return { error: 'Completed Date & Time is invalid.' }

  const expiresAt =
    course.validity_months && course.validity_months > 0
      ? new Date(Date.UTC(
          completedDate.getUTCFullYear(),
          completedDate.getUTCMonth() + course.validity_months,
          completedDate.getUTCDate()
        )).toISOString().slice(0, 10)
      : null

  const { data: matchingAssignment } = await supabase
    .from('forge_training_assignments')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('course_id', courseId)
    .eq('personnel_id', personnelId)
    .in('status', ['assigned','in_progress','overdue'])
    .order('assigned_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: completion, error } = await supabase
    .from('forge_training_completions')
    .insert({
      organization_id: organizationId,
      assignment_id: matchingAssignment?.id || null,
      course_id: courseId,
      personnel_id: personnelId,
      completed_at: completedDate.toISOString(),
      hours: cleanNumber(values.hours),
      score: cleanNumber(values.score),
      instructor: cleanText(values.instructor),
      result: cleanText(values.result) || 'completed',
      approval_status: 'pending',
      certificate_number: cleanText(values.certificate_number),
      expires_at: expiresAt,
      notes: cleanText(values.notes),
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !completion) return { error: error?.message ?? 'Unable to record training completion.' }

  if (matchingAssignment?.id) {
    await supabase
      .from('forge_training_assignments')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', matchingAssignment.id)
  }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'training.completion_recorded',
    entityType: 'training_completion',
    entityId: completion.id,
    after: completion
  })

  revalidatePath('/training')
  revalidatePath('/my-training')
  return { id: completion.id, message: 'Training completion recorded.' }
}

export const approveTrainingCompletion = async (completionId: string) => {
  const context = await requireTenantPermission('training.approve')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_training_completions')
    .select('*, forge_personnel(*)')
    .eq('id', completionId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!before) return { error: 'Training completion not found.' }

  const personnel = before.forge_personnel
  if (!personnel) return { error: 'Personnel record not found.' }

  const allowed = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: personnel
  })

  if (!allowed) return { error: 'This completion is outside your approval scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_training_completions')
    .update({
      approval_status: 'approved',
      approved_by: context.user.id,
      approved_at: now,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', completionId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to approve completion.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'training.completion_approved',
    entityType: 'training_completion',
    entityId: completionId,
    before,
    after
  })

  revalidatePath('/training')
  revalidatePath('/my-training')
  return { message: 'Training completion approved.' }
}
