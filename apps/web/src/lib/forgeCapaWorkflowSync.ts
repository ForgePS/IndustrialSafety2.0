import { createServiceRoleClient } from '@repo/supabase/server'
import {
  CAPA_WORKFLOW_KEY,
  capaStatusToWorkflowState,
  isCapaLifecycleStatus,
  type CapaLifecycleStatus
} from './forgeCapaWorkflowMap'
import { ensureWorkflowInstance } from './forgeWorkflow'

/**
 * CAPA remains the system of record for forge_corrective_actions.status.
 * Lifecycle transitions that change status MUST go through
 * forge_perform_capa_lifecycle_transition so CAPA + workflow + event +
 * idempotency + audit stay atomic.
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
  event_id?: string
  capa_status?: string
  workflow_state?: string
  instance_id?: string
  audit_id?: number
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
}): Promise<{ error?: string; result?: CapaLifecycleTransitionResult }> => {
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
    // Forced failure path raises NX01H_FORCED_FAILURE — surface as error with rollback
    return { error: error.message }
  }

  const result = data as CapaLifecycleTransitionResult
  if (!result?.ok) {
    return { error: result?.error || 'CAPA lifecycle transition failed.', result }
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
