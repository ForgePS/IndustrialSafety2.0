import { createServiceRoleClient } from '@repo/supabase/server'

import { ensureCapaWorkflowInstance } from '@/lib/forgeCapaWorkflowSync'

/**
 * Creating a Corrective Action, shared by the user-facing create action and by system sources (an inspection
 * finding, an incident root-cause action) that must open a CAPA even when the person who triggered it cannot
 * create CAPAs themselves (1.0 did this on inspection completion). Callers check permissions and scope; this
 * file does the writes.
 */

type Supabase = any

export const capaActivity = async ({
  supabase,
  organizationId,
  correctiveActionId,
  userId,
  type,
  message,
  metadata = {}
}: {
  supabase: Supabase
  organizationId: string
  correctiveActionId: string
  userId: string | null
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

export const capaAudit = async ({
  supabase,
  actorUserId,
  organizationId,
  action,
  entityId,
  before,
  after
}: {
  supabase: Supabase
  actorUserId: string | null
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

export const taskActivity = async ({
  supabase,
  organizationId,
  taskId,
  userId,
  type,
  message,
  metadata = {}
}: {
  supabase: Supabase
  organizationId: string
  taskId: string
  userId: string | null
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

export const priorityForSeverity = (severity: string | null) => {
  if (severity === 'critical') return 'critical'
  if (severity === 'high') return 'high'
  if (severity === 'low') return 'low'

  return 'normal'
}

/** The active personnel record (and its login, if any) a CAPA is assigned to. */
export const resolveCapaAssignee = async ({ supabase, organizationId, personnelId }: { supabase: Supabase; organizationId: string; personnelId: string | null }) => {
  if (!personnelId) return { personnelId: null, userId: null }

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id, auth_user_id')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .is('archived_at', null)
    .maybeSingle()

  if (!person) return { error: 'Selected owner is not an active personnel record in this company.' }

  return { personnelId: person.id as string, userId: (person.auth_user_id as string) || null }
}

export type CapaInsertPayload = {
  title: string
  description: string
  action_type?: string | null
  severity?: string | null
  location_id?: string | null
  division_id?: string | null
  due_at?: string | null
  immediate_containment?: string | null
  action_plan?: string | null
  source_type?: string | null
  source_id?: string | null
  source_reference?: string | null
  [key: string]: unknown
}

/**
 * Inserts the CAPA and its linked Task, then writes activity, audit and the workflow instance. Rolls the CAPA back
 * if the Task cannot be created.
 */
export const insertCorrectiveAction = async ({
  supabase,
  organizationId,
  actorUserId,
  payload,
  assignee,
  createdMessage
}: {
  supabase: Supabase
  organizationId: string
  actorUserId: string
  payload: CapaInsertPayload
  assignee: { personnelId: string | null; userId: string | null }
  createdMessage?: string
}): Promise<{ id: string; actionNumber: string; record: any } | { error: string }> => {
  const { data: actionNumber, error: numberError } = await supabase.rpc('next_forge_corrective_action_number', { p_organization_id: organizationId })

  if (numberError || !actionNumber) return { error: numberError?.message || 'Unable to generate Corrective Action number.' }

  const { data: correctiveAction, error } = await supabase
    .from('forge_corrective_actions')
    .insert({
      organization_id: organizationId,
      action_number: actionNumber,
      ...payload,
      assigned_personnel_id: assignee.personnelId,
      assigned_user_id: assignee.userId,
      status: payload.action_plan ? 'in_progress' : 'open',
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select('*')
    .single()

  if (error || !correctiveAction) return { error: error?.message || 'Unable to create Corrective Action.' }

  const { data: taskNumber, error: taskNumberError } = await supabase.rpc('next_forge_task_number', { p_organization_id: organizationId })

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
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select('*')
    .single()

  if (taskError || !task) {
    await supabase.from('forge_corrective_actions').delete().eq('id', correctiveAction.id)

    return { error: taskError?.message || 'Unable to create linked Corrective Action Task.' }
  }

  const { data: after } = await supabase
    .from('forge_corrective_actions')
    .update({ linked_task_id: task.id, updated_at: new Date().toISOString() })
    .eq('id', correctiveAction.id)
    .select('*')
    .single()

  await capaActivity({
    supabase,
    organizationId,
    correctiveActionId: correctiveAction.id,
    userId: actorUserId,
    type: 'created',
    message: (createdMessage || 'Corrective Action created') + ' with linked Task ' + task.task_number + '.',
    metadata: { task_id: task.id, task_number: task.task_number, source_type: payload.source_type || null, source_id: payload.source_id || null }
  })

  await taskActivity({
    supabase,
    organizationId,
    taskId: task.id,
    userId: actorUserId,
    type: 'created_from_corrective_action',
    message: 'Task created from Corrective Action ' + correctiveAction.action_number + '.',
    metadata: { corrective_action_id: correctiveAction.id }
  })

  const record = after || correctiveAction

  await capaAudit({ supabase, actorUserId, organizationId, action: 'corrective_action.created', entityId: correctiveAction.id, after: record })
  await ensureCapaWorkflowInstance({ organizationId, capaId: record.id, status: record.status, actorUserId })

  return { id: correctiveAction.id as string, actionNumber: actionNumber as string, record }
}

export type CapaSource = {

  /** forge_corrective_actions.source_type, e.g. 'inspection' or 'incident'. */
  type: string
  id: string
  reference?: string | null

  /** Record-link source (forgeRelationshipRegistry 'generated_capa'), e.g. 'inspection_finding' or 'incident'. */
  linkResourceType?: string
  linkResourceId?: string
}

/**
 * Opens a CAPA for a source record without checking the actor's CAPA permissions (the caller has already
 * checked access to the source). Idempotent: if a live CAPA already exists for the same source record, that one
 * is returned with `existing: true`. Writes the `generated_capa` record link directly.
 */
export const createCapaForSource = async ({
  organizationId,
  actorUserId,
  source,
  values,
  createdMessage
}: {
  organizationId: string
  actorUserId: string
  source: CapaSource
  values: CapaInsertPayload & { assigned_personnel_id?: string | null }
  createdMessage?: string
}): Promise<{ id: string; actionNumber: string; existing: boolean } | { error: string }> => {
  const supabase = createServiceRoleClient() as any

  const { data: existing } = await supabase
    .from('forge_corrective_actions')
    .select('id, action_number')
    .eq('organization_id', organizationId)
    .eq('source_type', source.type)
    .eq('source_id', source.id)
    .is('archived_at', null)
    .neq('status', 'canceled')
    .limit(1)
    .maybeSingle()

  if (existing) return { id: existing.id, actionNumber: existing.action_number, existing: true }

  const { assigned_personnel_id: personnelId, ...rest } = values
  const assignee = await resolveCapaAssignee({ supabase, organizationId, personnelId: personnelId || null })

  // A source's owner may have left; open the CAPA unassigned rather than not at all.
  const owner = 'error' in assignee ? { personnelId: null, userId: null } : assignee

  const created = await insertCorrectiveAction({
    supabase,
    organizationId,
    actorUserId,
    payload: {
      action_type: 'corrective',
      severity: 'moderate',
      ...rest,
      title: String(rest.title).slice(0, 200),
      description: rest.description,
      source_type: source.type,
      source_id: source.id,
      source_reference: source.reference || null
    },
    assignee: owner,
    createdMessage
  })

  if ('error' in created) return created

  if (source.linkResourceType && source.linkResourceId) {
    const { error } = await supabase.from('forge_record_links').insert({
      organization_id: organizationId,
      source_resource_type: source.linkResourceType,
      source_resource_id: source.linkResourceId,
      target_resource_type: 'corrective_action',
      target_resource_id: created.id,
      relationship_type: 'generated_capa',
      created_by: actorUserId
    })

    if (error && error.code !== '23505') console.error('CAPA source link failed', error)
  }

  return { id: created.id, actionNumber: created.actionNumber, existing: false }
}
