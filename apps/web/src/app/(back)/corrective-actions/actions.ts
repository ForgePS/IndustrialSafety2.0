'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { correctiveActionWithinScope } from '@/lib/forgeCorrectiveActions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type CorrectiveActionFormValues = Record<string, string | boolean | null>

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

const toBoolean = (value: unknown) =>
  value === true || value === 'true' || value === 'on' || value === '1'

const priorityForSeverity = (severity: string | null) => {
  if (severity === 'critical') return 'critical'
  if (severity === 'high') return 'high'
  if (severity === 'low') return 'low'
  return 'normal'
}

const validateCorrectiveActionForm = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: CorrectiveActionFormValues
}) => {
  const form = await getEffectiveForm({
    organizationId,
    formKey: 'corrective_actions.action'
  })

  if (!form) return { error: 'Corrective Action form is not configured.' }

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

const activity = async ({
  supabase,
  organizationId,
  correctiveActionId,
  userId,
  type,
  message,
  metadata = {}
}: {
  supabase: any
  organizationId: string
  correctiveActionId: string
  userId: string
  type: string
  message: string
  metadata?: Record<string, unknown>
}) => {
  await supabase.from('forge_corrective_action_activity').insert({
    organization_id: organizationId,
    corrective_action_id: correctiveActionId,
    activity_type: type,
    message,
    actor_user_id: userId,
    metadata
  })
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
    entity_type: 'corrective_action',
    entity_id: entityId,
    before_value: before ?? null,
    after_value: after ?? null
  })
}

const taskActivity = async ({
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

const loadCorrectiveAction = async ({
  supabase,
  organizationId,
  correctiveActionId
}: {
  supabase: any
  organizationId: string
  correctiveActionId: string
}) => {
  const { data } = await supabase
    .from('forge_corrective_actions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', correctiveActionId)
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

  if (!person) {
    return { error: 'Selected owner is not an active personnel record in this company.' }
  }

  return {
    personnelId: person.id,
    userId: person.auth_user_id || null
  }
}

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

const buildPayload = (values: CorrectiveActionFormValues) => ({
  title: cleanText(values.title),
  description: cleanText(values.description),
  action_type: cleanText(values.action_type) || 'corrective',
  severity: cleanText(values.severity) || 'moderate',
  source_type: cleanText(values.source_type) || 'manual',
  source_reference: cleanText(values.source_reference),
  assigned_personnel_id: cleanText(values.assigned_personnel_id),
  location_id: cleanText(values.location_id),
  division_id: cleanText(values.division_id),
  due_at: toIso(values.due_at),
  immediate_containment: cleanText(values.immediate_containment),
  root_cause_required: toBoolean(values.root_cause_required),
  root_cause: cleanText(values.root_cause),
  action_plan: cleanText(values.action_plan),
  preventive_action: cleanText(values.preventive_action),
  verification_due_at: toIso(values.verification_due_at),
  effectiveness_review_due_at: toIso(values.effectiveness_review_due_at),
  effectiveness_notes: cleanText(values.effectiveness_notes)
})

export const createCorrectiveAction = async (values: CorrectiveActionFormValues) => {
  const context = await requireTenantPermission('corrective_actions.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateCorrectiveActionForm({ organizationId, values })

  if ('error' in validation) return validation

  const payload = buildPayload(values)
  if (!payload.title || !payload.description) {
    return { error: 'Title and Issue / Nonconformance are required.' }
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

  const assigningOtherUser = assignee.userId && assignee.userId !== context.user.id
  const assignPermission = context.access.effective.find(
    item => item.permissionKey === 'corrective_actions.assign' && item.allowed
  )

  if (assigningOtherUser && !assignPermission) {
    return { error: 'You do not have permission to assign Corrective Actions to other personnel.' }
  }

  const effectiveScope = assigningOtherUser
    ? assignPermission?.scope || context.permission.scope
    : context.permission.scope

  const candidate = {
    organization_id: organizationId,
    assigned_user_id: assignee.userId,
    created_by: context.user.id,
    location_id: payload.location_id,
    division_id: payload.division_id
  }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: effectiveScope,
    action: candidate
  })

  if (!allowed) {
    return { error: 'The selected Corrective Action assignment is outside your permission scope.' }
  }

  const { data: actionNumber, error: numberError } = await supabase.rpc(
    'next_forge_corrective_action_number',
    { p_organization_id: organizationId }
  )

  if (numberError || !actionNumber) {
    return { error: numberError?.message || 'Unable to generate Corrective Action number.' }
  }

  const { data: correctiveAction, error } = await supabase
    .from('forge_corrective_actions')
    .insert({
      organization_id: organizationId,
      action_number: actionNumber,
      ...payload,
      assigned_personnel_id: assignee.personnelId,
      assigned_user_id: assignee.userId,
      status: payload.action_plan ? 'in_progress' : 'open',
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !correctiveAction) {
    return { error: error?.message || 'Unable to create Corrective Action.' }
  }

  const { data: taskNumber, error: taskNumberError } = await supabase.rpc(
    'next_forge_task_number',
    { p_organization_id: organizationId }
  )

  if (taskNumberError || !taskNumber) {
    await supabase.from('forge_corrective_actions').delete().eq('id', correctiveAction.id)
    return { error: taskNumberError?.message || 'Unable to create linked Task number.' }
  }

  const { data: task, error: taskError } = await supabase
    .from('forge_tasks')
    .insert({
      organization_id: organizationId,
      task_number: taskNumber,
      title: correctiveAction.title,
      description: correctiveAction.action_plan || correctiveAction.description,
      status: correctiveAction.status === 'in_progress' ? 'in_progress' : 'open',
      priority: priorityForSeverity(correctiveAction.severity),
      assigned_personnel_id: correctiveAction.assigned_personnel_id,
      assigned_user_id: correctiveAction.assigned_user_id,
      location_id: correctiveAction.location_id,
      division_id: correctiveAction.division_id,
      due_at: correctiveAction.due_at,
      source_type: 'corrective_action',
      source_id: correctiveAction.id,
      source_reference: correctiveAction.action_number,
      corrective_action: true,
      verification_required: true,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (taskError || !task) {
    await supabase.from('forge_corrective_actions').delete().eq('id', correctiveAction.id)
    return { error: taskError?.message || 'Unable to create linked Corrective Action Task.' }
  }

  const { data: after } = await supabase
    .from('forge_corrective_actions')
    .update({
      linked_task_id: task.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', correctiveAction.id)
    .select('*')
    .single()

  await activity({
    supabase,
    organizationId,
    correctiveActionId: correctiveAction.id,
    userId: context.user.id,
    type: 'created',
    message: 'Corrective Action created with linked Task ' + task.task_number + '.',
    metadata: { task_id: task.id, task_number: task.task_number }
  })

  await taskActivity({
    supabase,
    organizationId,
    taskId: task.id,
    userId: context.user.id,
    type: 'created_from_corrective_action',
    message: 'Task created from Corrective Action ' + correctiveAction.action_number + '.',
    metadata: { corrective_action_id: correctiveAction.id }
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'corrective_action.created',
    entityId: correctiveAction.id,
    after: after || correctiveAction
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/tasks')
  return { id: correctiveAction.id, message: 'Corrective Action created.' }
}

export const updateCorrectiveAction = async ({
  correctiveActionId,
  values
}: {
  correctiveActionId: string
  values: CorrectiveActionFormValues
}) => {
  const context = await requireTenantPermission('corrective_actions.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateCorrectiveActionForm({ organizationId, values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { error: 'Corrective Action not found.' }
  if (before.archived_at) return { error: 'Archived Corrective Actions are read-only.' }
  if (!['open', 'in_progress'].includes(before.status)) {
    return { error: 'This Corrective Action is read-only in its current workflow status.' }
  }

  const mayEdit = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!mayEdit) return { error: 'This Corrective Action is outside your edit scope.' }

  const payload = buildPayload(values)
  if (!payload.title || !payload.description) {
    return { error: 'Title and Issue / Nonconformance are required.' }
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

  if (assignmentChanged) {
    const assignPermission = context.access.effective.find(
      item => item.permissionKey === 'corrective_actions.assign' && item.allowed
    )

    if (!assignPermission) {
      return { error: 'You do not have permission to change Corrective Action assignment.' }
    }

    const assignmentAllowed = await correctiveActionWithinScope({
      organizationId,
      userId: context.user.id,
      scope: assignPermission.scope,
      action: {
        organization_id: organizationId,
        assigned_user_id: assignee.userId,
        created_by: before.created_by,
        location_id: payload.location_id,
        division_id: payload.division_id
      }
    })

    if (!assignmentAllowed) {
      return { error: 'The new Corrective Action assignment is outside your assignment scope.' }
    }
  }

  const nextStatus = before.status === 'open' && payload.action_plan ? 'in_progress' : before.status

  const { data: after, error } = await supabase
    .from('forge_corrective_actions')
    .update({
      ...payload,
      assigned_personnel_id: assignee.personnelId,
      assigned_user_id: assignee.userId,
      status: nextStatus,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', correctiveActionId)
    .select('*')
    .single()

  if (error || !after) {
    return { error: error?.message || 'Unable to update Corrective Action.' }
  }

  if (after.linked_task_id) {
    await supabase
      .from('forge_tasks')
      .update({
        title: after.title,
        description: after.action_plan || after.description,
        status: nextStatus === 'in_progress' ? 'in_progress' : 'open',
        priority: priorityForSeverity(after.severity),
        assigned_personnel_id: after.assigned_personnel_id,
        assigned_user_id: after.assigned_user_id,
        location_id: after.location_id,
        division_id: after.division_id,
        due_at: after.due_at,
        updated_by: context.user.id,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId)
      .eq('id', after.linked_task_id)

    await taskActivity({
      supabase,
      organizationId,
      taskId: after.linked_task_id,
      userId: context.user.id,
      type: 'synced_from_corrective_action',
      message: 'Task synchronized from Corrective Action ' + after.action_number + '.'
    })
  }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: assignmentChanged ? 'assignment_changed' : 'updated',
    message: assignmentChanged
      ? 'Corrective Action details and assignment updated.'
      : 'Corrective Action details updated.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'corrective_action.updated',
    entityId: correctiveActionId,
    before,
    after
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)
  revalidatePath('/tasks')
  if (after.linked_task_id) revalidatePath('/tasks/' + after.linked_task_id)

  return { message: 'Corrective Action updated.' }
}

export const addCorrectiveActionComment = async ({
  correctiveActionId,
  comment
}: {
  correctiveActionId: string
  comment: string
}) => {
  const context = await requireTenantPermission('corrective_actions.view')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const record = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!record) return { error: 'Corrective Action not found.' }

  const mayView = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: record
  })
  if (!mayView) return { error: 'This Corrective Action is outside your scope.' }

  const text = comment.trim()
  if (!text) return { error: 'Comment is required.' }

  const { error } = await supabase.from('forge_corrective_action_comments').insert({
    organization_id: organizationId,
    corrective_action_id: correctiveActionId,
    comment: text,
    created_by: context.user.id
  })

  if (error) return { error: error.message }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: 'comment_added',
    message: 'Comment added.'
  })

  revalidatePath('/corrective-actions/' + correctiveActionId)
  return { message: 'Comment added.' }
}

export const submitCorrectiveActionForVerification = async (correctiveActionId: string) => {
  const context = await requireTenantPermission('corrective_actions.submit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { error: 'Corrective Action not found.' }
  if (!['open', 'in_progress'].includes(before.status)) {
    return { error: 'Only open or in-progress Corrective Actions can be submitted for verification.' }
  }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!allowed) return { error: 'This Corrective Action is outside your submit scope.' }

  if (!before.assigned_personnel_id) return { error: 'Assign an owner before submitting for verification.' }
  if (!before.due_at) return { error: 'Set a due date before submitting for verification.' }
  if (!before.action_plan) return { error: 'Document the Corrective Action Plan before submitting for verification.' }
  if (before.root_cause_required && !before.root_cause) {
    return { error: 'Document the Root Cause before submitting for verification.' }
  }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_corrective_actions')
    .update({
      status: 'pending_verification',
      completed_at: now,
      completed_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', correctiveActionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to submit Corrective Action.' }

  if (after.linked_task_id) {
    await supabase
      .from('forge_tasks')
      .update({
        status: 'completed',
        completed_at: now,
        completed_by: context.user.id,
        verification_notes: 'Corrective work completed; CAPA verification pending.',
        updated_by: context.user.id,
        updated_at: now
      })
      .eq('organization_id', organizationId)
      .eq('id', after.linked_task_id)

    await taskActivity({
      supabase,
      organizationId,
      taskId: after.linked_task_id,
      userId: context.user.id,
      type: 'corrective_action_work_completed',
      message: 'Corrective work submitted for CAPA verification.'
    })
  }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: 'submitted_for_verification',
    message: 'Corrective work submitted for independent verification.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'corrective_action.submitted_for_verification',
    entityId: correctiveActionId,
    before,
    after
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)
  revalidatePath('/tasks')
  if (after.linked_task_id) revalidatePath('/tasks/' + after.linked_task_id)

  return { message: 'Corrective Action submitted for verification.' }
}

export const verifyCorrectiveAction = async ({
  correctiveActionId,
  result,
  notes
}: {
  correctiveActionId: string
  result: 'effective' | 'ineffective' | 'follow_up_required'
  notes: string
}) => {
  const context = await requireTenantPermission('corrective_actions.verify')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { error: 'Corrective Action not found.' }
  if (before.status !== 'pending_verification') {
    return { error: 'Only Corrective Actions pending verification can be verified.' }
  }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!allowed) return { error: 'This Corrective Action is outside your verification scope.' }

  if (!['effective', 'ineffective', 'follow_up_required'].includes(result)) {
    return { error: 'Select a valid verification result.' }
  }

  const verificationNotes = notes.trim()
  if (!verificationNotes) return { error: 'Verification notes are required.' }

  const now = new Date().toISOString()
  const effective = result === 'effective'

  const { data: after, error } = await supabase
    .from('forge_corrective_actions')
    .update({
      status: effective ? 'verified' : 'in_progress',
      verification_result: result,
      verification_notes: verificationNotes,
      verified_at: effective ? now : null,
      verified_by: effective ? context.user.id : null,
      completed_at: effective ? before.completed_at : null,
      completed_by: effective ? before.completed_by : null,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', correctiveActionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to verify Corrective Action.' }

  if (after.linked_task_id && !effective) {
    await supabase
      .from('forge_tasks')
      .update({
        status: 'in_progress',
        completed_at: null,
        completed_by: null,
        verification_notes: 'CAPA verification requires follow-up: ' + verificationNotes,
        updated_by: context.user.id,
        updated_at: now
      })
      .eq('organization_id', organizationId)
      .eq('id', after.linked_task_id)

    await taskActivity({
      supabase,
      organizationId,
      taskId: after.linked_task_id,
      userId: context.user.id,
      type: 'reopened_from_verification',
      message: 'Task reopened because CAPA verification requires follow-up.'
    })
  }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: effective ? 'verified' : 'verification_returned',
    message: effective
      ? 'Corrective Action verified as effective.'
      : 'Verification requires additional corrective work.',
    metadata: { verification_result: result }
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: effective
      ? 'corrective_action.verified'
      : 'corrective_action.verification_returned',
    entityId: correctiveActionId,
    before,
    after
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)
  revalidatePath('/tasks')
  if (after.linked_task_id) revalidatePath('/tasks/' + after.linked_task_id)

  return {
    message: effective
      ? 'Corrective Action verified.'
      : 'Corrective Action returned for follow-up.'
  }
}

export const closeCorrectiveAction = async ({
  correctiveActionId,
  closureNotes
}: {
  correctiveActionId: string
  closureNotes: string
}) => {
  const context = await requireTenantPermission('corrective_actions.close')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { error: 'Corrective Action not found.' }
  if (before.status !== 'verified') {
    return { error: 'Only verified Corrective Actions can be closed.' }
  }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!allowed) return { error: 'This Corrective Action is outside your close scope.' }

  const notes = closureNotes.trim()
  if (!notes) return { error: 'Closure notes are required.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_corrective_actions')
    .update({
      status: 'closed',
      closure_notes: notes,
      closed_at: now,
      closed_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', correctiveActionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to close Corrective Action.' }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: 'closed',
    message: 'Corrective Action closed.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'corrective_action.closed',
    entityId: correctiveActionId,
    before,
    after
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)

  return { message: 'Corrective Action closed.' }
}

export const cancelCorrectiveAction = async ({
  correctiveActionId,
  cancellationNotes
}: {
  correctiveActionId: string
  cancellationNotes: string
}) => {
  const context = await requireTenantPermission('corrective_actions.close')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { error: 'Corrective Action not found.' }
  if (before.archived_at) return { error: 'Archived Corrective Actions cannot be canceled.' }
  if (['closed', 'canceled'].includes(before.status)) {
    return { error: 'This Corrective Action is already closed or canceled.' }
  }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!allowed) return { error: 'This Corrective Action is outside your cancel scope.' }

  const notes = cancellationNotes.trim()
  if (!notes) return { error: 'Cancellation notes are required.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_corrective_actions')
    .update({
      status: 'canceled',
      closure_notes: notes,
      closed_at: now,
      closed_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', correctiveActionId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to cancel Corrective Action.' }

  if (after.linked_task_id) {
    await supabase
      .from('forge_tasks')
      .update({
        status: 'canceled',
        completed_at: null,
        completed_by: null,
        updated_by: context.user.id,
        updated_at: now
      })
      .eq('organization_id', organizationId)
      .eq('id', after.linked_task_id)

    await taskActivity({
      supabase,
      organizationId,
      taskId: after.linked_task_id,
      userId: context.user.id,
      type: 'canceled_from_capa',
      message: 'Task canceled because the linked Corrective Action was canceled.'
    })
  }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: 'canceled',
    message: 'Corrective Action canceled.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'corrective_action.canceled',
    entityId: correctiveActionId,
    before,
    after
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)
  revalidatePath('/tasks')
  if (after.linked_task_id) revalidatePath('/tasks/' + after.linked_task_id)

  return { message: 'Corrective Action canceled.' }
}

export const archiveCorrectiveAction = async (correctiveActionId: string) => {
  const context = await requireTenantPermission('corrective_actions.archive')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { error: 'Corrective Action not found.' }
  if (!['closed', 'canceled'].includes(before.status)) {
    return { error: 'Only closed or canceled Corrective Actions can be archived.' }
  }

  const allowed = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!allowed) return { error: 'This Corrective Action is outside your archive scope.' }

  const now = new Date().toISOString()
  const { data: after, error } = await supabase
    .from('forge_corrective_actions')
    .update({
      archived_at: now,
      archived_by: context.user.id,
      updated_by: context.user.id,
      updated_at: now
    })
    .eq('id', correctiveActionId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message || 'Unable to archive Corrective Action.' }

  await activity({
    supabase,
    organizationId,
    correctiveActionId,
    userId: context.user.id,
    type: 'archived',
    message: 'Corrective Action archived.'
  })

  await audit({
    supabase,
    actorUserId: context.user.id,
    organizationId,
    action: 'corrective_action.archived',
    entityId: correctiveActionId,
    before,
    after
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)

  return { message: 'Corrective Action archived.' }
}
