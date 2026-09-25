'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveForm } from '@/lib/forgeForms'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { taskWithinScope } from '@/lib/forgeTasks'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type TaskFormValues = Record<string, string | boolean | null>

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const toIso = (value: unknown) => {
  const text = cleanText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const validateTaskForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: TaskFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey: 'tasks.task' })
  if (!form) return { error: 'Task form is not configured.' }

  for (const field of form.fields) {
    const value = values[field.key]

    if (field.required && (value == null || value === '')) {
      return { error: field.label + ' is required.' }
    }

    if (field.fieldType === 'select' && field.lookupOptions.length && value) {
      if (!field.lookupOptions.some(option => option.key === value)) {
        return { error: field.label + ' contains an invalid option.' }
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
  entityId,
  before,
  after
}: {
  supabase: any
  actorUserId: string
  organizationId: string
  action: string
  entityId: string
  before?: unknown
  after?: unknown
}) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'task',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const activity = async ({
  supabase,
  organizationId,
  taskId,
  userId,
  type,
  message,
  metadata = {}
}: {
  supabase: any
  organizationId: string
  taskId: string
  userId: string
  type: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  await supabase.from('forge_task_activity').insert({
    organization_id: organizationId,
    task_id: taskId,
    activity_type: type,
    message,
    actor_user_id: userId,
    metadata
  })
}

const loadTask = async ({
  supabase,
  organizationId,
  taskId
}: {
  supabase: any
  organizationId: string
  taskId: string
}) => {
  const { data } = await supabase
    .from('forge_tasks')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', taskId)
    .maybeSingle()

  return data || null
}

const resolveAssignee = async ({
  supabase,
  organizationId,
  personnelId
}: {
  supabase: any
  organizationId: string
  personnelId: string | null
}) => {
  if (!personnelId) return { personnelId: null, userId: null }

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id, auth_user_id')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) return { error: 'Selected assignee is not an active personnel record in this company.' }

  return {
    personnelId: person.id,
    userId: person.auth_user_id || null
  }
}

const taskPayload = (values: TaskFormValues) => ({
  title: cleanText(values.title),
  description: cleanText(values.description),
  priority: cleanText(values.priority) || 'normal',
  status: cleanText(values.status) || 'open',
  assigned_personnel_id: cleanText(values.assigned_personnel_id),
  location_id: cleanText(values.location_id),
  division_id: cleanText(values.division_id),
  start_at: toIso(values.start_at),
  due_at: toIso(values.due_at),
  verification_notes: cleanText(values.verification_notes)
})

const validateOrgAssignment = async ({
  supabase,
  organizationId,
  locationId,
  divisionId
}: {
  supabase: any
  organizationId: string
  locationId: string | null
  divisionId: string | null
}) => {
  if (locationId) {
    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', locationId)
      .eq('is_active', true)
      .maybeSingle()
    if (!data) return 'Selected Location does not belong to this company.'
  }

  if (divisionId) {
    const { data } = await supabase
      .from('divisions')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('id', divisionId)
      .eq('is_active', true)
      .maybeSingle()
    if (!data) return 'Selected Division does not belong to this company.'
  }

  return null
}

export const createTask = async (values: TaskFormValues) => {
  const context = await requireTenantPermission('tasks.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateTaskForm({ organizationId, values })
  if ('error' in validation) return validation

  const payload = taskPayload(values)
  if (!payload.title) return { error: 'Task Title is required.' }

  if (payload.status === 'completed') {
    return { error: 'Create the Task first, then use the Complete Task workflow.' }
  }

  const supabase = createServiceRoleClient() as any
  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })
  if (assignmentError) return { error: assignmentError }

  const assignee = await resolveAssignee({
    supabase,
    organizationId,
    personnelId: payload.assigned_personnel_id
  })
  if ('error' in assignee) return assignee

  let assignedUserId = assignee.userId
  let assignedPersonnelId = assignee.personnelId

  if (!assignedPersonnelId) {
    const { data: selfPersonnel } = await supabase
      .from('forge_personnel')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('auth_user_id', context.user.id)
      .is('archived_at', null)
      .maybeSingle()

    assignedPersonnelId = selfPersonnel?.id || null
    assignedUserId = context.user.id
  }

  const assigningOtherUser = assignedUserId && assignedUserId !== context.user.id
  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'tasks.assign' && item.allowed
  )

  if (assigningOtherUser && !assignPermission) {
    return { error: 'You do not have permission to assign Tasks to other personnel.' }
  }

  const effectiveScope = assigningOtherUser
    ? assignPermission?.scope || context.permission.scope
    : context.permission.scope

  const candidate = {
    organization_id: organizationId,
    assigned_user_id: assignedUserId,
    created_by: context.user.id,
    location_id: payload.location_id,
    division_id: payload.division_id
  }

  const allowed = await taskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: effectiveScope,
    task: candidate
  })

  if (!allowed) return { error: 'The selected Task assignment is outside your permission scope.' }

  const { data: taskNumber, error: numberError } = await supabase.rpc('next_forge_task_number', {
    p_organization_id: organizationId
  })
  if (numberError || !taskNumber) return { error: numberError?.message || 'Unable to generate Task number.' }

  const { data: task, error } = await supabase
    .from('forge_tasks')
    .insert({
      organization_id: organizationId,
      task_number: taskNumber,
      ...payload,
      assigned_personnel_id: assignedPersonnelId,
      assigned_user_id: assignedUserId,
      source_type: 'manual',
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !task) return { error: error?.message || 'Unable to create Task.' }

  await activity({
    supabase,
    organizationId,
    taskId: task.id,
    userId: context.user.id,
    type: 'created',
    message: 'Task created.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'task.created',
    entityId: task.id,
    after: task
  })

  revalidatePath('/tasks')
  return { id: task.id, message: 'Task created.' }
}

export const updateTask = async ({
  taskId,
  values
}: {
  taskId: string
  values: TaskFormValues
}) => {
  const context = await requireTenantPermission('tasks.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateTaskForm({ organizationId, values })
  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const before = await loadTask({ supabase, organizationId, taskId })
  if (!before) return { error: 'Task not found.' }
  if (before.archived_at) return { error: 'Archived Tasks are read-only.' }
  if (before.source_type === 'corrective_action') {
    return { error: 'This Task is managed by its linked Corrective Action. Update the CAPA record instead.' }
  }

  const allowed = await taskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    task: before
  })
  if (!allowed) return { error: 'This Task is outside your edit scope.' }

  const payload = taskPayload(values)
  if (!payload.title) return { error: 'Task Title is required.' }
  if (payload.status === 'completed' && before.status !== 'completed') {
    return { error: 'Use the Complete Task workflow to complete this Task.' }
  }

  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })
  if (assignmentError) return { error: assignmentError }

  const assignee = await resolveAssignee({
    supabase,
    organizationId,
    personnelId: payload.assigned_personnel_id
  })
  if ('error' in assignee) return assignee

  const assignmentChanged =
    payload.assigned_personnel_id !== before.assigned_personnel_id ||
    payload.location_id !== before.location_id ||
    payload.division_id !== before.division_id

  let assignedPersonnelId = assignee.personnelId
  let assignedUserId = assignee.userId

  if (!payload.assigned_personnel_id) {
    assignedPersonnelId = before.assigned_personnel_id
    assignedUserId = before.assigned_user_id
  }

  if (assignmentChanged) {
    const assignPermission = context.access.effective.find(
      item => item.permissionKey === 'tasks.assign' && item.allowed
    )

    if (!assignPermission) return { error: 'You do not have permission to change Task assignment.' }

    const assignmentAllowed = await taskWithinScope({
      organizationId,
      userId: context.user.id,
      scope: assignPermission.scope,
      task: {
        organization_id: organizationId,
        assigned_user_id: assignedUserId,
        created_by: before.created_by,
        location_id: payload.location_id,
        division_id: payload.division_id
      }
    })

    if (!assignmentAllowed) return { error: 'The new Task assignment is outside your assignment scope.' }
  }

  const { data: after, error } = await supabase
    .from('forge_tasks')
    .update({
      ...payload,
      assigned_personnel_id: assignedPersonnelId,
      assigned_user_id: assignedUserId,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to update Task.' }

  await activity({
    supabase,
    organizationId,
    taskId,
    userId: context.user.id,
    type: assignmentChanged ? 'assignment_changed' : 'updated',
    message: assignmentChanged ? 'Task details and assignment updated.' : 'Task details updated.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'task.updated',
    entityId: taskId,
    before,
    after
  })

  revalidatePath('/tasks')
  revalidatePath('/tasks/' + taskId)
  return { message: 'Task updated.' }
}

export const completeTask = async ({
  taskId,
  verificationNotes
}: {
  taskId: string
  verificationNotes?: string
}) => {
  const context = await requireTenantPermission('tasks.complete')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadTask({ supabase, organizationId, taskId })

  if (!before) return { error: 'Task not found.' }
  if (before.archived_at) return { error: 'Archived Tasks cannot be completed.' }
  if (before.source_type === 'corrective_action') {
    return { error: 'This Task is managed by its linked Corrective Action. Submit the CAPA for verification instead.' }
  }

  const allowed = await taskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    task: before
  })
  if (!allowed) return { error: 'This Task is outside your completion scope.' }

  if (before.status === 'completed') return { error: 'Task is already completed.' }

  if (before.verification_required && !cleanText(verificationNotes)) {
    return { error: 'Verification / Closure Notes are required for this Task.' }
  }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_tasks')
    .update({
      status: 'completed',
      completed_at: now,
      completed_by: context.user.id,
      verification_notes: cleanText(verificationNotes) || before.verification_notes,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', taskId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to complete Task.' }

  await activity({
    supabase,
    organizationId,
    taskId,
    userId: context.user.id,
    type: 'completed',
    message: 'Task completed.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'task.completed',
    entityId: taskId,
    before,
    after
  })

  revalidatePath('/tasks')
  revalidatePath('/tasks/' + taskId)
  return { message: 'Task completed.' }
}

export const addTaskComment = async ({
  taskId,
  comment
}: {
  taskId: string
  comment: string
}) => {
  const context = await requireTenantPermission('tasks.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const task = await loadTask({ supabase, organizationId, taskId })

  if (!task) return { error: 'Task not found.' }

  const allowed = await taskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    task
  })
  if (!allowed) return { error: 'This Task is outside your access scope.' }

  const text = comment.trim()
  if (!text) return { error: 'Comment cannot be empty.' }
  if (text.length > 4000) return { error: 'Comment is too long.' }

  const { data: record, error } = await supabase
    .from('forge_task_comments')
    .insert({
      organization_id: organizationId,
      task_id: taskId,
      comment: text,
      created_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !record) return { error: error?.message || 'Unable to add comment.' }

  await activity({
    supabase,
    organizationId,
    taskId,
    userId: context.user.id,
    type: 'comment_added',
    message: 'Comment added.'
  })

  revalidatePath('/tasks/' + taskId)
  return { message: 'Comment added.' }
}

export const archiveTask = async (taskId: string) => {
  const context = await requireTenantPermission('tasks.archive')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadTask({ supabase, organizationId, taskId })

  if (!before) return { error: 'Task not found.' }
  if (before.archived_at) return { error: 'Task is already archived.' }
  if (before.source_type === 'corrective_action') {
    return { error: 'This Task is managed by its linked Corrective Action and cannot be archived independently.' }
  }

  const allowed = await taskWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    task: before
  })
  if (!allowed) return { error: 'This Task is outside your archive scope.' }

  if (!['completed','canceled'].includes(before.status)) {
    return { error: 'Complete or cancel the Task before archiving it.' }
  }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_tasks')
    .update({
      archived_at: now,
      archived_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', taskId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to archive Task.' }

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'task.archived',
    entityId: taskId,
    before,
    after
  })

  revalidatePath('/tasks')
  revalidatePath('/tasks/' + taskId)
  return { message: 'Task archived.' }
}
