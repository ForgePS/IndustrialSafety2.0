'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import {
  ensureCapaWorkflowInstance,
  performAtomicCapaLifecycleTransition,
  performTransactionalCapaUpdate
} from '@/lib/forgeCapaWorkflowSync'
import { correctiveActionWithinScope } from '@/lib/forgeCorrectiveActions'
import { getEffectiveForm } from '@/lib/forgeForms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type CorrectiveActionFormValues = Record<string, string | boolean | number | null>

export type CorrectiveActionUpdateResult =
  | {
      ok: true
      success?: true
      id: string
      message: string
      duplicate?: boolean
      rowVersion: number
      status: string
    }
  | {
      ok?: false
      success?: false
      error: string
      conflict?: boolean
    }

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

  const created = after || correctiveAction
  await ensureCapaWorkflowInstance({
    organizationId,
    capaId: created.id,
    status: created.status,
    actorUserId: context.user.id
  })

  revalidatePath('/corrective-actions')
  revalidatePath('/tasks')
  return { id: correctiveAction.id, message: 'Corrective Action created.' }
}

export const updateCorrectiveAction = async ({
  correctiveActionId,
  values,
  expectedRowVersion,
  expectedStatus,
  requestId
}: {
  correctiveActionId: string
  values: CorrectiveActionFormValues
  expectedRowVersion: number
  expectedStatus: string
  requestId: string
}): Promise<CorrectiveActionUpdateResult> => {
  const context = await requireTenantPermission('corrective_actions.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateCorrectiveActionForm({ organizationId, values })

  if ('error' in validation && validation.error) {
    return { ok: false as const, error: validation.error }
  }

  if (!requestId || !String(requestId).trim()) {
    return { ok: false as const, error: 'Missing request identity. Refresh and try again.' }
  }

  if (!Number.isFinite(expectedRowVersion) || expectedRowVersion < 1) {
    return { ok: false as const, error: 'Missing record version. Refresh and try again.' }
  }

  const supabase = createServiceRoleClient() as any
  const before = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })

  if (!before) return { ok: false as const, error: 'Corrective Action not found.' }
  if (before.archived_at) {
    return { ok: false as const, error: 'Archived Corrective Actions are read-only.' }
  }

  if (
    before.row_version !== expectedRowVersion ||
    before.status !== expectedStatus
  ) {
    return {
      ok: false as const,
      error: 'This record changed after you opened it. Refresh the record before saving your changes.',
      conflict: true as const
    }
  }

  if (!['open', 'in_progress'].includes(before.status)) {
    return {
      ok: false as const,
      error: 'This Corrective Action is read-only in its current workflow status.'
    }
  }

  const mayEdit = await correctiveActionWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    action: before
  })
  if (!mayEdit) {
    return { ok: false as const, error: 'This Corrective Action is outside your edit scope.' }
  }

  const payload = buildPayload(values)
  if (!payload.title || !payload.description) {
    return { ok: false as const, error: 'Title and Issue / Nonconformance are required.' }
  }

  const assignmentError = await validateOrgAssignment({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })
  if (assignmentError) return { ok: false as const, error: assignmentError }

  const assignee = await resolveAssignee({
    supabase,
    organizationId,
    personnelId: payload.assigned_personnel_id
  })
  if ('error' in assignee && assignee.error) {
    return { ok: false as const, error: assignee.error }
  }

  const assignmentChanged =
    payload.assigned_personnel_id !== before.assigned_personnel_id ||
    payload.location_id !== before.location_id ||
    payload.division_id !== before.division_id

  if (assignmentChanged) {
    const assignPermission = context.access.effective.find(
      item => item.permissionKey === 'corrective_actions.assign' && item.allowed
    )

    if (!assignPermission) {
      return {
        ok: false as const,
        error: 'You do not have permission to change Corrective Action assignment.'
      }
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
      return {
        ok: false as const,
        error: 'The new Corrective Action assignment is outside your assignment scope.'
      }
    }
  }

  const shouldStartWork = before.status === 'open' && Boolean(payload.action_plan)

  // Never include status — lifecycle is an explicit transition parameter only.
  const fields = {
    title: payload.title,
    description: payload.description,
    action_type: payload.action_type,
    severity: payload.severity,
    source_type: payload.source_type,
    source_reference: payload.source_reference,
    assigned_personnel_id: assignee.personnelId,
    assigned_user_id: assignee.userId,
    location_id: payload.location_id,
    division_id: payload.division_id,
    due_at: payload.due_at,
    immediate_containment: payload.immediate_containment,
    root_cause_required: payload.root_cause_required,
    root_cause: payload.root_cause,
    action_plan: payload.action_plan,
    preventive_action: payload.preventive_action,
    verification_due_at: payload.verification_due_at,
    effectiveness_review_due_at: payload.effectiveness_review_due_at,
    effectiveness_notes: payload.effectiveness_notes
  }

  const idempotencyKey =
    'capa:' +
    correctiveActionId +
    ':update:' +
    expectedRowVersion +
    ':' +
    String(requestId).trim()

  const updated = await performTransactionalCapaUpdate({
    organizationId,
    capaId: correctiveActionId,
    expectedRowVersion,
    expectedStatus: before.status,
    actorUserId: context.user.id,
    fields,
    toStatus: shouldStartWork ? 'in_progress' : null,
    transitionKey: shouldStartWork ? 'start_work' : null,
    assignmentChanged,
    idempotencyKey
  })

  if (updated.conflict) {
    return {
      ok: false as const,
      error: 'This record changed after you opened it. Refresh the record before saving your changes.',
      conflict: true as const
    }
  }

  if (updated.error || !updated.result?.ok) {
    return { ok: false as const, error: updated.error || 'Unable to update Corrective Action.' }
  }

  const nextRowVersion = Number(updated.result.row_version)
  const nextStatus = String(updated.result.capa_status || '')
  if (!Number.isFinite(nextRowVersion) || nextRowVersion < 1 || !nextStatus) {
    return { ok: false as const, error: 'Update succeeded but concurrency tokens were missing.' }
  }

  revalidatePath('/corrective-actions')
  revalidatePath('/corrective-actions/' + correctiveActionId)
  revalidatePath('/tasks')
  if (before.linked_task_id) revalidatePath('/tasks/' + before.linked_task_id)

  return {
    ok: true as const,
    success: true as const,
    id: correctiveActionId,
    message: updated.result.duplicate
      ? 'Corrective Action update already applied.'
      : 'Corrective Action updated.',
    duplicate: Boolean(updated.result.duplicate),
    rowVersion: nextRowVersion,
    status: nextStatus
  }
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
  const transition = await performAtomicCapaLifecycleTransition({
    organizationId,
    capaId: correctiveActionId,
    fromStatus: before.status,
    toStatus: 'pending_verification',
    actorUserId: context.user.id,
    capaPatch: {
      completed_at: now,
      completed_by: context.user.id
    },
    metadata: { source: 'capa_submit' },
    idempotencyKey: 'capa-submit-' + correctiveActionId + '-' + now
  })

  if (transition.error || !transition.result?.ok) {
    return { error: transition.error || 'Unable to submit Corrective Action.' }
  }

  const after = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })
  if (!after) return { error: 'Unable to load Corrective Action after transition.' }

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
  const toStatus = effective ? 'verified' : 'in_progress'

  const transition = await performAtomicCapaLifecycleTransition({
    organizationId,
    capaId: correctiveActionId,
    fromStatus: before.status,
    toStatus,
    actorUserId: context.user.id,
    comment: verificationNotes,
    capaPatch: {
      verification_result: result,
      verification_notes: verificationNotes,
      verified_at: effective ? now : null,
      verified_by: effective ? context.user.id : '',
      completed_at: effective ? before.completed_at : null,
      completed_by: effective ? before.completed_by : ''
    },
    metadata: { source: 'capa_verify', verification_result: result },
    idempotencyKey: 'capa-verify-' + correctiveActionId + '-' + result + '-' + now
  })

  if (transition.error || !transition.result?.ok) {
    return { error: transition.error || 'Unable to verify Corrective Action.' }
  }

  const after = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })
  if (!after) return { error: 'Unable to load Corrective Action after transition.' }

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
  const transition = await performAtomicCapaLifecycleTransition({
    organizationId,
    capaId: correctiveActionId,
    fromStatus: before.status,
    toStatus: 'closed',
    actorUserId: context.user.id,
    comment: notes,
    capaPatch: {
      closure_notes: notes,
      closed_at: now,
      closed_by: context.user.id
    },
    metadata: { source: 'capa_close' },
    idempotencyKey: 'capa-close-' + correctiveActionId + '-' + now
  })

  if (transition.error || !transition.result?.ok) {
    return { error: transition.error || 'Unable to close Corrective Action.' }
  }

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
  const transition = await performAtomicCapaLifecycleTransition({
    organizationId,
    capaId: correctiveActionId,
    fromStatus: before.status,
    toStatus: 'canceled',
    actorUserId: context.user.id,
    comment: notes,
    capaPatch: {
      closure_notes: notes,
      closed_at: now,
      closed_by: context.user.id
    },
    metadata: { source: 'capa_cancel' },
    idempotencyKey: 'capa-cancel-' + correctiveActionId + '-' + now
  })

  if (transition.error || !transition.result?.ok) {
    return { error: transition.error || 'Unable to cancel Corrective Action.' }
  }

  const after = await loadCorrectiveAction({ supabase, organizationId, correctiveActionId })
  if (!after) return { error: 'Unable to load Corrective Action after transition.' }

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

export const submitCorrectiveActionForVerificationForm = async (formData: FormData) => {
  await submitCorrectiveActionForVerification(String(formData.get('correctiveActionId') || ''))
}

export const verifyCorrectiveActionForm = async (formData: FormData) => {
  const result = String(formData.get('verification_result') || 'effective')
  await verifyCorrectiveAction({
    correctiveActionId: String(formData.get('correctiveActionId') || ''),
    result:
      result === 'ineffective' || result === 'follow_up_required' ? result : 'effective',
    notes: String(formData.get('verification_notes') || '')
  })
}

export const closeCorrectiveActionForm = async (formData: FormData) => {
  await closeCorrectiveAction({
    correctiveActionId: String(formData.get('correctiveActionId') || ''),
    closureNotes: String(formData.get('closure_notes') || '')
  })
}

export const cancelCorrectiveActionForm = async (formData: FormData) => {
  await cancelCorrectiveAction({
    correctiveActionId: String(formData.get('correctiveActionId') || ''),
    cancellationNotes: String(formData.get('cancellation_notes') || '')
  })
}

export const archiveCorrectiveActionForm = async (formData: FormData) => {
  await archiveCorrectiveAction(String(formData.get('correctiveActionId') || ''))
}

export const addCorrectiveActionCommentForm = async (formData: FormData) => {
  await addCorrectiveActionComment({
    correctiveActionId: String(formData.get('correctiveActionId') || ''),
    comment: String(formData.get('comment') || '')
  })
}
