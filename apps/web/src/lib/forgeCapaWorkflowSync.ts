import { createServiceRoleClient } from '@repo/supabase/server'
import {
  CAPA_WORKFLOW_KEY,
  capaStatusToWorkflowState,
  isCapaLifecycleStatus
} from './forgeCapaWorkflowMap'
import { ensureWorkflowInstance } from './forgeWorkflow'

/**
 * CAPA remains the system of record for forge_corrective_actions.status.
 * Lifecycle transitions that change status MUST go through
 * forge_perform_capa_lifecycle_transition so CAPA + workflow + event +
 * idempotency + audit stay atomic.
 *
 * Form field saves (with optional open→in_progress) MUST go through
 * forge_update_capa_transactionally — never write status from generic updates.
 */

const TRANSITION_MAP: Record<string, string> = {
  'open>in_progress': 'start_work',
  'open>pending_verification': 'submit_for_verification',
  'in_progress>pending_verification': 'submit_for_verification_from_progress',
  'pending_verification>verified': 'verify_effective',
  'pending_verification>in_progress': 'verify_ineffective',
  'verified>closed': 'close',
  'open>canceled': 'cancel_from_open',
  'in_progress>canceled': 'cancel_from_progress',
  'pending_verification>canceled': 'cancel_from_pending'
}

export const resolveCapaTransitionKey = (fromStatus: string, toStatus: string) =>
  TRANSITION_MAP[fromStatus + '>' + toStatus] || null

export const ensureCapaWorkflowInstance = async ({
  organizationId,
  capaId,
  status,
  actorUserId
}: {
  organizationId: string
  capaId: string
  status: string
  actorUserId: string
}) => {
  const workflowState = capaStatusToWorkflowState(status)
  if (!workflowState) throw new Error('Unsupported CAPA status for workflow: ' + status)

  return ensureWorkflowInstance({
    organizationId,
    resourceType: 'corrective_action',
    resourceId: capaId,
    workflowKey: CAPA_WORKFLOW_KEY,
    initialStateKey: workflowState
  })
}

export type CapaLifecycleTransitionResult = {
  ok?: boolean
  error?: string
  duplicate?: boolean
  conflict?: boolean
  event_id?: string
  capa_status?: string
  workflow_state?: string
  instance_id?: string
  audit_id?: number
  row_version?: number
}

export type CapaTransactionalUpdateResult = {
  ok?: boolean
  error?: string
  duplicate?: boolean
  conflict?: boolean
  capa_status?: string
  row_version?: number
  event_id?: string | null
  activity_id?: number
  audit_id?: number
  transitioned?: boolean
}

/**
 * Atomically transition CAPA SoR + workflow instance + event + idempotency + audit.
 * Caller must have already performed Forge authz / scope / business rules.
 */
export const performAtomicCapaLifecycleTransition = async ({
  organizationId,
  capaId,
  fromStatus,
  toStatus,
  actorUserId,
  comment = null,
  capaPatch = {},
  metadata = {},
  idempotencyKey = null,
  failAfterCapaUpdate = false
}: {
  organizationId: string
  capaId: string
  fromStatus: string
  toStatus: string
  actorUserId: string
  comment?: string | null
  capaPatch?: Record<string, unknown>
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
  failAfterCapaUpdate?: boolean
}): Promise<{ error?: string; conflict?: boolean; result?: CapaLifecycleTransitionResult }> => {
  if (!isCapaLifecycleStatus(fromStatus) || !isCapaLifecycleStatus(toStatus)) {
    return { error: 'Invalid CAPA lifecycle status.' }
  }

  const transitionKey = resolveCapaTransitionKey(fromStatus, toStatus)
  if (!transitionKey) {
    return {
      error: 'No workflow transition mapped for CAPA status change ' + fromStatus + ' → ' + toStatus + '.'
    }
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_perform_capa_lifecycle_transition', {
    p_organization_id: organizationId,
    p_capa_id: capaId,
    p_expected_capa_status: fromStatus,
    p_to_capa_status: toStatus,
    p_transition_key: transitionKey,
    p_actor_user_id: actorUserId,
    p_comment: comment,
    p_capa_patch: capaPatch,
    p_metadata: { ...metadata, source: 'capa_atomic' },
    p_idempotency_key: idempotencyKey,
    p_fail_after_capa_update: failAfterCapaUpdate
  })

  if (error) {
    return { error: error.message }
  }

  const result = data as CapaLifecycleTransitionResult
  if (!result?.ok) {
    return {
      error: result?.error || 'CAPA lifecycle transition failed.',
      conflict: Boolean(result?.conflict),
      result
    }
  }

  return { result }
}

/**
 * Atomic CAPA form save: whitelisted field patch + optional open→in_progress.
 * Never accepts status inside fields. Linked task sync is included when present.
 */
export const performTransactionalCapaUpdate = async ({
  organizationId,
  capaId,
  expectedRowVersion,
  expectedStatus,
  actorUserId,
  fields,
  toStatus = null,
  transitionKey = null,
  assignmentChanged = false,
  idempotencyKey,
  failAfterFields = false
}: {
  organizationId: string
  capaId: string
  expectedRowVersion: number
  expectedStatus: string
  actorUserId: string
  fields: Record<string, unknown>
  toStatus?: string | null
  transitionKey?: string | null
  assignmentChanged?: boolean
  idempotencyKey: string
  failAfterFields?: boolean
}): Promise<{ error?: string; conflict?: boolean; result?: CapaTransactionalUpdateResult }> => {
  if ('status' in fields || 'row_version' in fields) {
    return { error: 'Lifecycle status cannot be updated through field patch.' }
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_update_capa_transactionally', {
    p_organization_id: organizationId,
    p_capa_id: capaId,
    p_expected_row_version: expectedRowVersion,
    p_expected_status: expectedStatus,
    p_actor_user_id: actorUserId,
    p_fields: fields,
    p_to_status: toStatus,
    p_transition_key: transitionKey,
    p_assignment_changed: assignmentChanged,
    p_idempotency_key: idempotencyKey,
    p_fail_after_fields: failAfterFields
  })

  if (error) {
    return { error: error.message }
  }

  const result = data as CapaTransactionalUpdateResult
  if (!result?.ok) {
    return {
      error: result?.error || 'Unable to update Corrective Action.',
      conflict: Boolean(result?.conflict),
      result
    }
  }

  return { result }
}

export const listCapaWorkflowDivergences = async (organizationId?: string) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_reconcile_capa_workflow_states', {
    p_organization_id: organizationId || null
  })
  if (error) throw new Error(error.message)
  return (data || []) as Array<{
    organization_id: string
    capa_id: string
    capa_status: string
    workflow_state: string | null
    instance_id: string | null
  }>
}

/** @deprecated Prefer performAtomicCapaLifecycleTransition for status-changing ops */
export const syncCapaWorkflowState = async ({
  organizationId,
  capaId,
  fromStatus,
  toStatus,
  actorUserId,
  comment = null,
  metadata = {},
  idempotencyKey = null
}: {
  organizationId: string
  capaId: string
  fromStatus: string
  toStatus: string
  actorUserId: string
  comment?: string | null
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
}) =>
  performAtomicCapaLifecycleTransition({
    organizationId,
    capaId,
    fromStatus,
    toStatus,
    actorUserId,
    comment,
    metadata,
    idempotencyKey
  })
