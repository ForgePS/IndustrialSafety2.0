import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { OBSERVATION_WORKFLOW_KEY } from '@/lib/forgeRiskPreventionWorkflows'
import { canTransition, ensureWorkflowInstance } from '@/lib/forgeWorkflow'

/**
 * Observation remains the system of record for forge_observations.status.
 * Lifecycle transitions that change status MUST go through
 * forge_perform_observation_lifecycle_transition so observation + workflow +
 * event + idempotency + audit stay atomic.
 *
 * Form field saves MUST go through forge_update_observation_transactionally —
 * never write status from generic updates.
 */

const TRANSITION_TO_STATUS: Record<string, string> = {
  submit: 'submitted',
  begin_review: 'review',
  return_for_info: 'submitted',
  require_action: 'action_required',
  no_action: 'no_action',
  close_from_action: 'closed',
  close_no_action: 'closed'
}

export const resolveObservationToStatus = (transitionKey: string) =>
  TRANSITION_TO_STATUS[transitionKey] || null

export const ensureObservationWorkflowInstance = async ({
  organizationId,
  observationId,
  status
}: {
  organizationId: string
  observationId: string
  status: string
}) =>
  ensureWorkflowInstance({
    organizationId,
    resourceType: 'observation',
    resourceId: observationId,
    workflowKey: OBSERVATION_WORKFLOW_KEY,
    initialStateKey: status
  })

export type ObservationLifecycleTransitionResult = {
  ok?: boolean
  error?: string
  duplicate?: boolean
  conflict?: boolean
  observation_id?: string
  status?: string
  row_version?: number
  event_id?: string
  workflow_state?: string
  instance_id?: string
  audit_id?: number
}

export type ObservationTransactionalUpdateResult = {
  ok?: boolean
  error?: string
  conflict?: boolean
  observation_id?: string
  status?: string
  row_version?: number
  activity_id?: number
  audit_id?: number
}

export type ObservationTransitionResult =
  | {
      ok: true
      status: string
      rowVersion: number
      message: string
      duplicate?: boolean
      eventId?: string
    }
  | {
      ok?: false
      error: string
      conflict?: boolean
    }

const cleanComment = (value: string | null | undefined) => {
  if (!value) return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

/**
 * Atomically transition observation SoR + workflow instance + event + idempotency + audit.
 * Caller must have already performed Forge authz / scope checks.
 */
export const performAtomicObservationLifecycleTransition = async ({
  organizationId,
  observationId,
  expectedStatus,
  expectedRowVersion,
  transitionKey,
  actorUserId,
  comment = null,
  closureSummary = null,
  metadata = {},
  idempotencyKey = null,
  failAfterDomainUpdate = false
}: {
  organizationId: string
  observationId: string
  expectedStatus: string
  expectedRowVersion: number
  transitionKey: string
  actorUserId: string
  comment?: string | null
  closureSummary?: string | null
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
  failAfterDomainUpdate?: boolean
}): Promise<{
  error?: string
  conflict?: boolean
  result?: ObservationLifecycleTransitionResult
}> => {
  const toStatus = resolveObservationToStatus(transitionKey)
  if (!toStatus) {
    return { error: 'Unknown observation transition: ' + transitionKey }
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_perform_observation_lifecycle_transition', {
    p_organization_id: organizationId,
    p_observation_id: observationId,
    p_expected_status: expectedStatus,
    p_expected_row_version: expectedRowVersion,
    p_transition_key: transitionKey,
    p_to_status: toStatus,
    p_actor_user_id: actorUserId,
    p_comment: comment,
    p_metadata: { ...metadata, source: 'observation_atomic' },
    p_idempotency_key: idempotencyKey,
    p_fail_after_domain_update: failAfterDomainUpdate,
    p_closure_summary: closureSummary
  })

  if (error) {
    return { error: error.message }
  }

  const result = data as ObservationLifecycleTransitionResult
  if (!result?.ok) {
    return {
      error: result?.error || 'Observation lifecycle transition failed.',
      conflict: Boolean(result?.conflict),
      result
    }
  }

  return { result }
}

/**
 * Atomic observation form save: whitelisted field patch only. Never accepts status.
 */
export const performTransactionalObservationUpdate = async ({
  organizationId,
  observationId,
  expectedRowVersion,
  actorUserId,
  fields,
  failAfterFields = false
}: {
  organizationId: string
  observationId: string
  expectedRowVersion: number
  actorUserId: string
  fields: Record<string, unknown>
  failAfterFields?: boolean
}): Promise<{
  error?: string
  conflict?: boolean
  result?: ObservationTransactionalUpdateResult
}> => {
  if ('status' in fields || 'row_version' in fields) {
    return { error: 'Lifecycle status cannot be updated through field patch.' }
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_update_observation_transactionally', {
    p_organization_id: organizationId,
    p_observation_id: observationId,
    p_expected_row_version: expectedRowVersion,
    p_actor_user_id: actorUserId,
    p_fields: fields,
    p_fail_after_fields: failAfterFields
  })

  if (error) {
    return { error: error.message }
  }

  const result = data as ObservationTransactionalUpdateResult
  if (!result?.ok) {
    return {
      error: result?.error || 'Unable to update Observation.',
      conflict: Boolean(result?.conflict),
      result
    }
  }

  return { result }
}

/**
 * Domain status is SoR. Validates eligibility, then performs the atomic RPC.
 */
export const performObservationTransition = async ({
  organizationId,
  observationId,
  transitionKey,
  actorUserId,
  comment = null,
  expectedRowVersion,
  expectedStatus = null,
  userPermissionKeys = null,
  idempotencyKey = null
}: {
  organizationId: string
  observationId: string
  transitionKey: string
  actorUserId: string
  comment?: string | null
  expectedRowVersion: number
  expectedStatus?: string | null
  userPermissionKeys?: string[] | null
  idempotencyKey?: string | null
}): Promise<ObservationTransitionResult> => {
  const supabase = createServiceRoleClient() as any

  const { data: observation, error: loadError } = await supabase
    .from('forge_observations')
    .select('id, status, row_version, archived_at')
    .eq('organization_id', organizationId)
    .eq('id', observationId)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!observation) return { error: 'Observation not found.' }
  if (observation.archived_at) return { error: 'Archived observations cannot transition.' }

  if (Number(observation.row_version) !== Number(expectedRowVersion)) {
    return {
      error: 'This observation changed after you opened it. Refresh before continuing.',
      conflict: true
    }
  }

  if (expectedStatus != null && observation.status !== expectedStatus) {
    return {
      error: 'This observation changed after you opened it. Refresh before continuing.',
      conflict: true
    }
  }

  await ensureObservationWorkflowInstance({
    organizationId,
    observationId,
    status: observation.status
  })

  let permissionKeys = userPermissionKeys
  if (!permissionKeys) {
    const access = await getEffectiveTenantAccess({
      organizationId,
      userId: actorUserId
    })
    permissionKeys = access.effective
      .filter(item => item.allowed)
      .map(item => item.permissionKey)
  }

  const eligibility = await canTransition({
    organizationId,
    resourceType: 'observation',
    resourceId: observationId,
    transitionKey,
    userPermissionKeys: permissionKeys
  })

  if (!eligibility.allowed) {
    return { error: eligibility.reason || 'Transition is not available.' }
  }

  const cleanedComment = cleanComment(comment)
  if (eligibility.transition.requires_comment && !cleanedComment) {
    return { error: 'A comment is required for this transition.' }
  }

  const toStatus = resolveObservationToStatus(transitionKey)
  if (!toStatus) {
    return { error: 'Unknown observation transition: ' + transitionKey }
  }

  const key =
    idempotencyKey ||
    'observation-' +
      transitionKey +
      '-' +
      observationId +
      '-' +
      String(expectedRowVersion)

  const atomic = await performAtomicObservationLifecycleTransition({
    organizationId,
    observationId,
    expectedStatus: observation.status,
    expectedRowVersion: Number(observation.row_version),
    transitionKey,
    actorUserId,
    comment: cleanedComment,
    closureSummary: transitionKey.startsWith('close') ? cleanedComment : null,
    metadata: {
      source: 'observation_domain_control',
      from_status: observation.status,
      to_status: toStatus
    },
    idempotencyKey: key
  })

  if (atomic.error || !atomic.result?.ok) {
    return {
      error: atomic.error || 'Observation lifecycle transition failed.',
      conflict: Boolean(atomic.conflict || atomic.result?.conflict)
    }
  }

  return {
    ok: true,
    status: String(atomic.result.status || toStatus),
    rowVersion: Number(atomic.result.row_version),
    message: atomic.result.duplicate
      ? 'Observation transition already applied.'
      : 'Observation transitioned.',
    duplicate: Boolean(atomic.result.duplicate),
    eventId: atomic.result.event_id
  }
}
