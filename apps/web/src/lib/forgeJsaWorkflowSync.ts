import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { JSA_WORKFLOW_KEY } from '@/lib/forgeRiskPreventionWorkflows'
import { canTransition, ensureWorkflowInstance } from '@/lib/forgeWorkflow'

/**
 * JSA status is SoR. Lifecycle transitions MUST go through
 * forge_perform_jsa_version_transition or forge_activate_jsa_revision
 * so domain + workflow + event + idempotency + audit stay atomic.
 */

export type JsaTransitionResult =
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

export type JsaLifecycleRpcResult = {
  ok?: boolean
  error?: string
  duplicate?: boolean
  conflict?: boolean
  event_id?: string
  jsa_status?: string
  workflow_state?: string
  instance_id?: string
  audit_id?: number
  row_version?: number
  prior_jsa_id?: string
  root_jsa_id?: string
}

const cleanComment = (value: string | null | undefined) => {
  if (!value) return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const TRANSITION_TO_STATUS: Record<string, string> = {
  submit: 'in_review',
  approve: 'approved',
  activate: 'active',
  supersede: 'superseded',
  retire_from_active: 'retired',
  retire_from_superseded: 'retired',
  retire_from_approved: 'retired'
}

export const ensureJsaWorkflowInstance = async ({
  organizationId,
  jsaId,
  status
}: {
  organizationId: string
  jsaId: string
  status: string
}) =>
  ensureWorkflowInstance({
    organizationId,
    resourceType: 'jsa',
    resourceId: jsaId,
    workflowKey: JSA_WORKFLOW_KEY,
    initialStateKey: status || 'draft'
  })

/**
 * Atomically transition JSA SoR + workflow. Activate uses forge_activate_jsa_revision.
 */
export const performJsaTransition = async ({
  organizationId,
  jsaId,
  transitionKey,
  actorUserId,
  comment = null,
  expectedRowVersion = null,
  userPermissionKeys = null,
  failAfterDomainUpdate = false,
  failAfterSupersede = false
}: {
  organizationId: string
  jsaId: string
  transitionKey: string
  actorUserId: string
  comment?: string | null
  expectedRowVersion?: number | null
  userPermissionKeys?: string[] | null
  failAfterDomainUpdate?: boolean
  failAfterSupersede?: boolean
}): Promise<JsaTransitionResult> => {
  const supabase = createServiceRoleClient() as any

  const { data: jsa, error: loadError } = await supabase
    .from('forge_jsas')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', jsaId)
    .maybeSingle()

  if (loadError) return { error: loadError.message }
  if (!jsa) return { error: 'JSA not found.' }
  if (jsa.archived_at) return { error: 'Archived JSAs cannot transition.' }

  if (expectedRowVersion != null && Number(jsa.row_version) !== Number(expectedRowVersion)) {
    return {
      error: 'This JSA changed after you opened it. Refresh before continuing.',
      conflict: true
    }
  }

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

  await ensureJsaWorkflowInstance({
    organizationId,
    jsaId,
    status: jsa.status || 'draft'
  })

  const eligibility = await canTransition({
    organizationId,
    resourceType: 'jsa',
    resourceId: jsaId,
    transitionKey,
    userPermissionKeys: permissionKeys
  })

  if (!eligibility.allowed) {
    return { error: eligibility.reason || 'Transition is not available.' }
  }

  const transition = eligibility.transition
  const cleanedComment = cleanComment(comment)

  if (transition.requires_comment && !cleanedComment) {
    return { error: 'A comment is required for this transition.' }
  }

  const toStatus = TRANSITION_TO_STATUS[transitionKey] || transition.to_state_key
  const idempotencyKey =
    'jsa-' + transitionKey + '-' + jsaId + '-' + String(jsa.row_version)

  if (transitionKey === 'activate' || toStatus === 'active') {
    const { data, error } = await supabase.rpc('forge_activate_jsa_revision', {
      p_organization_id: organizationId,
      p_jsa_id: jsaId,
      p_actor_user_id: actorUserId,
      p_comment: cleanedComment,
      p_metadata: { source: 'jsa_atomic', transition_key: transitionKey },
      p_idempotency_key: idempotencyKey,
      p_expected_row_version: expectedRowVersion ?? Number(jsa.row_version),
      p_fail_after_supersede: failAfterSupersede
    })

    if (error) return { error: error.message }

    const result = data as JsaLifecycleRpcResult
    if (!result?.ok) {
      return {
        error: result?.error || 'JSA activation failed.',
        conflict: Boolean(result?.conflict)
      }
    }

    return {
      ok: true,
      status: result.jsa_status || 'active',
      message: result.duplicate ? 'Activation already recorded.' : 'JSA activated.',
      duplicate: Boolean(result.duplicate),
      rowVersion: result.row_version
    }
  }

  const { data, error } = await supabase.rpc('forge_perform_jsa_version_transition', {
    p_organization_id: organizationId,
    p_jsa_id: jsaId,
    p_expected_status: jsa.status,
    p_to_status: toStatus,
    p_transition_key: transitionKey,
    p_actor_user_id: actorUserId,
    p_comment: cleanedComment,
    p_jsa_patch: {},
    p_metadata: { source: 'jsa_atomic' },
    p_idempotency_key: idempotencyKey,
    p_expected_row_version: expectedRowVersion ?? Number(jsa.row_version),
    p_fail_after_domain_update: failAfterDomainUpdate
  })

  if (error) return { error: error.message }

  const result = data as JsaLifecycleRpcResult
  if (!result?.ok) {
    return {
      error: result?.error || 'JSA lifecycle transition failed.',
      conflict: Boolean(result?.conflict)
    }
  }

  return {
    ok: true,
    status: result.jsa_status || toStatus,
    message: result.duplicate
      ? 'Transition already recorded.'
      : 'JSA transitioned to ' + (result.jsa_status || toStatus) + '.',
    duplicate: Boolean(result.duplicate),
    rowVersion: result.row_version
  }
}

export const performJsaExecutionTransition = async ({
  organizationId,
  executionId,
  fromStatus,
  toStatus,
  actorUserId,
  comment = null,
  patch = {},
  metadata = {},
  idempotencyKey = null,
  expectedRowVersion = null,
  failAfterDomainUpdate = false
}: {
  organizationId: string
  executionId: string
  fromStatus: string
  toStatus: string
  actorUserId: string
  comment?: string | null
  patch?: Record<string, unknown>
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
  expectedRowVersion?: number | null
  failAfterDomainUpdate?: boolean
}): Promise<
  | { ok: true; status: string; rowVersion?: number; jsaId?: string; message: string }
  | { ok?: false; error: string; conflict?: boolean }
> => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase.rpc('forge_perform_jsa_execution_transition', {
    p_organization_id: organizationId,
    p_execution_id: executionId,
    p_expected_status: fromStatus,
    p_to_status: toStatus,
    p_actor_user_id: actorUserId,
    p_comment: cleanComment(comment),
    p_patch: patch,
    p_metadata: metadata,
    p_idempotency_key: idempotencyKey,
    p_expected_row_version: expectedRowVersion,
    p_fail_after_domain_update: failAfterDomainUpdate
  })

  if (error) return { error: error.message }

  const result = data as {
    ok?: boolean
    error?: string
    conflict?: boolean
    execution_status?: string
    row_version?: number
    jsa_id?: string
  }

  if (!result?.ok) {
    return {
      error: result?.error || 'Execution transition failed.',
      conflict: Boolean(result?.conflict)
    }
  }

  return {
    ok: true,
    status: result.execution_status || toStatus,
    rowVersion: result.row_version,
    jsaId: result.jsa_id,
    message: 'Execution transitioned to ' + (result.execution_status || toStatus) + '.'
  }
}
