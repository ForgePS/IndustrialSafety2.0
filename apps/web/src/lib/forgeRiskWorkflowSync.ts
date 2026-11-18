import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { RISK_REGISTER_WORKFLOW_KEY } from '@/lib/forgeRiskPreventionWorkflows'
import { canTransition, ensureWorkflowInstance } from '@/lib/forgeWorkflow'

/**
 * Risk remains the system of record for forge_risks.status.
 * Lifecycle transitions MUST go through forge_perform_risk_lifecycle_transition
 * so risk + workflow + event + idempotency + audit stay atomic.
 */

const TRANSITION_TO_STATUS: Record<string, string> = {
  submit_assessment: 'assessment',
  submit_for_review: 'review',
  activate: 'active',
  send_to_review: 'review',
  close: 'closed',
  reopen: 'review'
}

export const resolveRiskToStatus = (transitionKey: string) =>
  TRANSITION_TO_STATUS[transitionKey] || null

export type RiskTransitionResult =
  | {
      ok: true
      status: string
      message: string
      duplicate?: boolean
      rowVersion?: number
    }
  | {
      ok?: false
      error: string
      conflict?: boolean
    }

export type RiskLifecycleRpcResult = {
  ok?: boolean
  error?: string
  duplicate?: boolean
  conflict?: boolean
  event_id?: string
  risk_id?: string
  status?: string
  workflow_state?: string
  instance_id?: string
  audit_id?: number
  row_version?: number
}

const cleanComment = (value: string | null | undefined) => {
  if (!value) return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

export const ensureRiskWorkflowInstance = async ({
  organizationId,
  riskId,
  status
}: {
  organizationId: string
  riskId: string
  status: string
}) =>
  ensureWorkflowInstance({
    organizationId,
    resourceType: 'risk_register',
    resourceId: riskId,
    workflowKey: RISK_REGISTER_WORKFLOW_KEY,
    initialStateKey: status
  })

export const performAtomicRiskLifecycleTransition = async ({
  organizationId,
  riskId,
  fromStatus,
  toStatus,
  transitionKey,
  actorUserId,
  expectedRowVersion,
  comment = null,
  metadata = {},
  idempotencyKey = null,
  failAfterDomainUpdate = false,
  closureSummary = null
}: {
  organizationId: string
  riskId: string
  fromStatus: string
  toStatus: string
  transitionKey: string
  actorUserId: string
  expectedRowVersion: number
  comment?: string | null
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
  failAfterDomainUpdate?: boolean
  closureSummary?: string | null
}): Promise<{ error?: string; conflict?: boolean; result?: RiskLifecycleRpcResult }> => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_perform_risk_lifecycle_transition', {
    p_organization_id: organizationId,
    p_risk_id: riskId,
    p_expected_status: fromStatus,
    p_expected_row_version: expectedRowVersion,
    p_transition_key: transitionKey,
    p_to_status: toStatus,
    p_actor_user_id: actorUserId,
    p_comment: comment,
    p_metadata: { ...metadata, source: 'risk_atomic' },
    p_idempotency_key: idempotencyKey,
    p_fail_after_domain_update: failAfterDomainUpdate,
    p_closure_summary: closureSummary
  })

  if (error) {
    if (String(error.message || '').includes('NX02H_FORCED_FAILURE')) {
      return { error: 'Forced failure for rollback test.' }
    }
    return { error: error.message }
  }

  const result = data as RiskLifecycleRpcResult
  if (!result?.ok) {
    return {
      error: result?.error || 'Risk lifecycle transition failed.',
      conflict: Boolean(result?.conflict),
      result
    }
  }

  return { result }
}

/**
 * Domain status is SoR. Validates eligibility, then performs the atomic RPC.
 */
export const performRiskTransition = async ({
  organizationId,
  riskId,
  transitionKey,
  actorUserId,
  comment = null,
  expectedRowVersion,
  userPermissionKeys = null,
  idempotencyKey = null
}: {
  organizationId: string
  riskId: string
  transitionKey: string
  actorUserId: string
  comment?: string | null
  expectedRowVersion: number
  userPermissionKeys?: string[] | null
  idempotencyKey?: string | null
}): Promise<RiskTransitionResult> => {
  const supabase = createServiceRoleClient() as any

  const { data: risk, error: loadError } = await supabase
    .from('forge_risks')
    .select('id, status, row_version, archived_at')
    .eq('organization_id', organizationId)
    .eq('id', riskId)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!risk) return { error: 'Risk not found.' }
  if (risk.archived_at) return { error: 'Archived risks cannot transition.' }

  if (Number(risk.row_version) !== Number(expectedRowVersion)) {
    return {
      error: 'This risk changed after you opened it. Refresh before continuing.',
      conflict: true
    }
  }

  await ensureRiskWorkflowInstance({
    organizationId,
    riskId,
    status: risk.status
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
    resourceType: 'risk_register',
    resourceId: riskId,
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

  const toStatus = resolveRiskToStatus(transitionKey)
  if (!toStatus) {
    return { error: 'Unsupported risk transition: ' + transitionKey }
  }

  const atomic = await performAtomicRiskLifecycleTransition({
    organizationId,
    riskId,
    fromStatus: risk.status,
    toStatus,
    transitionKey,
    actorUserId,
    expectedRowVersion: Number(risk.row_version),
    comment: cleanedComment,
    idempotencyKey:
      idempotencyKey ||
      'risk:' + riskId + ':' + transitionKey + ':' + String(risk.row_version),
    closureSummary: transitionKey === 'close' ? cleanedComment : null
  })

  if (atomic.error || !atomic.result?.ok) {
    return {
      error: atomic.error || atomic.result?.error || 'Risk transition failed.',
      conflict: Boolean(atomic.conflict || atomic.result?.conflict)
    }
  }

  return {
    ok: true,
    status: String(atomic.result.status || toStatus),
    rowVersion: Number(atomic.result.row_version || Number(risk.row_version) + 1),
    message: atomic.result.duplicate
      ? 'Transition already applied.'
      : 'Risk transitioned to ' + (atomic.result.status || toStatus) + '.',
    duplicate: Boolean(atomic.result.duplicate)
  }
}

export const performAtomicRiskReview = async ({
  organizationId,
  riskId,
  expectedRowVersion,
  actorUserId,
  reviewNotes = null,
  nextReviewAt = null,
  failAfterReviewInsert = false
}: {
  organizationId: string
  riskId: string
  expectedRowVersion: number
  actorUserId: string
  reviewNotes?: string | null
  nextReviewAt?: string | null
  failAfterReviewInsert?: boolean
}) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_create_risk_review', {
    p_organization_id: organizationId,
    p_risk_id: riskId,
    p_expected_row_version: expectedRowVersion,
    p_actor_user_id: actorUserId,
    p_review_notes: reviewNotes,
    p_next_review_at: nextReviewAt,
    p_fail_after_review_insert: failAfterReviewInsert
  })

  if (error) {
    if (String(error.message || '').includes('NX02H_FORCED_FAILURE')) {
      return { error: 'Forced failure for rollback test.' }
    }
    return { error: error.message }
  }

  if (!data?.ok) {
    return {
      error: data?.error || 'Unable to create risk review.',
      conflict: Boolean(data?.conflict)
    }
  }

  return { result: data }
}

export const performAtomicRiskAcceptance = async ({
  organizationId,
  riskId,
  expectedRowVersion,
  actorUserId,
  acceptanceComment
}: {
  organizationId: string
  riskId: string
  expectedRowVersion: number
  actorUserId: string
  acceptanceComment: string
}) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_accept_risk', {
    p_organization_id: organizationId,
    p_risk_id: riskId,
    p_expected_row_version: expectedRowVersion,
    p_actor_user_id: actorUserId,
    p_acceptance_comment: acceptanceComment
  })

  if (error) return { error: error.message }
  if (!data?.ok) {
    return {
      error: data?.error || 'Unable to accept risk.',
      conflict: Boolean(data?.conflict)
    }
  }

  return { result: data }
}
