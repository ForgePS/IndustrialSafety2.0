import { createServiceRoleClient } from '@repo/supabase/server'
import { CAPA_WORKFLOW_KEY } from './forgeCapaWorkflowMap'
import { writeForgeAudit } from './forgeAudit'
import { writeRecordActivity } from './forgeRecordActivity'
import { getForgePlatformAccess } from './forgeCreatorAuth'
import {
  hasEffectivePermission,
  isForgeResourceType,
  requireForgePermissionForResource,
  requireForgeResourceView,
  resolveForgeResource,
  type ForgeResourceType
} from './forgeResourceRegistry'
import { getTenantContext } from './forgeTenantContext'
import { getEffectiveTenantAccess } from './forgeEffectiveAccess'

export type WorkflowDefinition = {
  id: string
  organization_id: string | null
  workflow_key: string
  name: string
  description: string | null
  resource_type: string
  version: number
  is_core: boolean
  is_active: boolean
}

export type WorkflowTransition = {
  id: string
  workflow_definition_id: string
  transition_key: string
  name: string
  from_state_key: string
  to_state_key: string
  required_permission: string | null
  requires_comment: boolean
  requires_confirmation: boolean
  requires_approval: boolean
  approval_type: string | null
  sort_order: number
  is_active: boolean
  rule_config: Record<string, unknown>
}

export type WorkflowInstance = {
  id: string
  organization_id: string
  workflow_definition_id: string
  workflow_version: number
  resource_type: string
  resource_id: string
  current_state_key: string
  started_at: string
  completed_at: string | null
  canceled_at: string | null
}

const cleanComment = (value: string | null | undefined) => {
  if (!value) return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const assertParentResourceInOrg = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => {
  if (!isForgeResourceType(resourceType)) return { error: 'Not found.' as const }
  const resolved = await resolveForgeResource({ organizationId, resourceType, resourceId })
  if (resolved.error || !resolved.resource) return { error: 'Not found.' as const }
  if (resolved.resource.organizationId !== organizationId) return { error: 'Not found.' as const }
  return { resource: resolved.resource }
}

export const getWorkflowDefinition = async ({
  workflowKey,
  version = 1,
  organizationId = null
}: {
  workflowKey: string
  version?: number
  organizationId?: string | null
}) => {
  const supabase = createServiceRoleClient() as any
  let query = supabase
    .from('forge_workflow_definitions')
    .select('*')
    .eq('workflow_key', workflowKey)
    .eq('version', version)
    .eq('is_active', true)

  query = organizationId
    ? query.eq('organization_id', organizationId)
    : query.is('organization_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as WorkflowDefinition | null
}

export const getWorkflowStates = async (workflowDefinitionId: string) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_workflow_states')
    .select('*')
    .eq('workflow_definition_id', workflowDefinitionId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data || []) as Array<Record<string, unknown>>
}

export const getWorkflowTransitions = async (workflowDefinitionId: string) => {
  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_workflow_transitions')
    .select('*')
    .eq('workflow_definition_id', workflowDefinitionId)
    .eq('is_active', true)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data || []) as WorkflowTransition[]
}

/**
 * Loads a workflow instance only after verifying the parent resource exists in the org.
 * Never expose instances by UUID alone — always go through resourceType + resourceId.
 */
export const getWorkflowInstance = async ({
  organizationId,
  resourceType,
  resourceId,
  workflowDefinitionId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
  workflowDefinitionId?: string
}) => {
  const parent = await assertParentResourceInOrg({ organizationId, resourceType, resourceId })
  if (parent.error) return null

  const supabase = createServiceRoleClient() as any
  let query = supabase
    .from('forge_workflow_instances')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)

  if (workflowDefinitionId) query = query.eq('workflow_definition_id', workflowDefinitionId)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as WorkflowInstance | null
}

export const getAuthorizedWorkflowInstance = async ({
  resourceType,
  resourceId,
  workflowDefinitionId
}: {
  resourceType: string
  resourceId: string
  workflowDefinitionId?: string
}) => {
  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok) return { error: 'Not found.' as const, instance: null }

  const instance = await getWorkflowInstance({
    organizationId: auth.resource.organizationId,
    resourceType,
    resourceId,
    workflowDefinitionId
  })

  return { instance, resource: auth.resource, access: auth.access, context: auth.context }
}

export const ensureWorkflowInstance = async ({
  organizationId,
  resourceType,
  resourceId,
  workflowKey = CAPA_WORKFLOW_KEY,
  initialStateKey
}: {
  organizationId: string
  resourceType: ForgeResourceType | string
  resourceId: string
  workflowKey?: string
  initialStateKey: string
}) => {
  const parent = await assertParentResourceInOrg({ organizationId, resourceType, resourceId })
  if (parent.error) throw new Error('Parent resource not found for workflow instance.')

  const definition = await getWorkflowDefinition({ workflowKey, version: 1 })
  if (!definition) throw new Error('Workflow definition not found: ' + workflowKey)

  const existing = await getWorkflowInstance({
    organizationId,
    resourceType,
    resourceId,
    workflowDefinitionId: definition.id
  })
  if (existing) return existing

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_workflow_instances')
    .insert({
      organization_id: organizationId,
      workflow_definition_id: definition.id,
      workflow_version: definition.version,
      resource_type: resourceType,
      resource_id: resourceId,
      current_state_key: initialStateKey
    })
    .select('*')
    .single()

  if (error?.code === '23505') {
    const again = await getWorkflowInstance({
      organizationId,
      resourceType,
      resourceId,
      workflowDefinitionId: definition.id
    })
    if (again) return again
  }

  if (error || !data) throw new Error(error?.message || 'Unable to create workflow instance.')

  await supabase.from('forge_workflow_events').insert({
    organization_id: organizationId,
    workflow_instance_id: data.id,
    resource_type: resourceType,
    resource_id: resourceId,
    transition_key: 'initialize',
    from_state_key: null,
    to_state_key: initialStateKey,
    comment: 'Workflow instance created.',
    metadata: { source: 'ensureWorkflowInstance' }
  })

  return data as WorkflowInstance
}

export const getAllowedTransitions = async ({
  organizationId,
  resourceType,
  resourceId,
  userPermissionKeys
}: {
  organizationId: string
  resourceType: string
  resourceId: string
  userPermissionKeys: string[]
}) => {
  const instance = await getWorkflowInstance({ organizationId, resourceType, resourceId })
  if (!instance) return []

  const transitions = await getWorkflowTransitions(instance.workflow_definition_id)
  return transitions.filter(transition => {
    if (transition.from_state_key !== instance.current_state_key) return false
    if (!transition.required_permission) return true
    return userPermissionKeys.includes(transition.required_permission)
  })
}

export const canTransition = async ({
  organizationId,
  resourceType,
  resourceId,
  transitionKey,
  userPermissionKeys
}: {
  organizationId: string
  resourceType: string
  resourceId: string
  transitionKey: string
  userPermissionKeys: string[]
}) => {
  const allowed = await getAllowedTransitions({
    organizationId,
    resourceType,
    resourceId,
    userPermissionKeys
  })
  const transition = allowed.find(item => item.transition_key === transitionKey)
  if (!transition) return { allowed: false as const, reason: 'Transition is not available.' }
  return { allowed: true as const, transition }
}

export const getWorkflowHistory = async ({
  organizationId,
  resourceType,
  resourceId
}: {
  organizationId: string
  resourceType: string
  resourceId: string
}) => {
  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok || auth.resource.organizationId !== organizationId) {
    return []
  }

  const instance = await getWorkflowInstance({ organizationId, resourceType, resourceId })
  if (!instance) return []

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_workflow_events')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('workflow_instance_id', instance.id)
    .order('occurred_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data || []) as Array<Record<string, unknown>>
}

/**
 * Migration / repair / diagnostics only — do NOT use for normal CAPA lifecycle
 * commands. Prefer performAtomicCapaLifecycleTransition (or domain-specific atomic
 * RPCs) so status + workflow stay consistent in one transaction.
 */
export const syncWorkflowState = async ({
  organizationId,
  resourceType,
  resourceId,
  toStateKey,
  transitionKey,
  actorUserId,
  comment = null,
  metadata = {},
  idempotencyKey = null
}: {
  organizationId: string
  resourceType: string
  resourceId: string
  toStateKey: string
  transitionKey: string
  actorUserId: string
  comment?: string | null
  metadata?: Record<string, unknown>
  idempotencyKey?: string | null
}) => {
  const parent = await assertParentResourceInOrg({ organizationId, resourceType, resourceId })
  if (parent.error) return { error: 'Not found.' }

  let instance = await getWorkflowInstance({ organizationId, resourceType, resourceId })
  if (!instance) {
    instance = await ensureWorkflowInstance({
      organizationId,
      resourceType,
      resourceId,
      initialStateKey: toStateKey === 'open' ? 'open' : toStateKey
    })
  }

  if (instance.current_state_key === toStateKey) {
    return { result: { ok: true, duplicate: true, event_id: null } }
  }

  const complete = ['closed', 'canceled'].includes(toStateKey)
  const cancel = toStateKey === 'canceled'
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase.rpc('forge_perform_workflow_transition', {
    p_organization_id: organizationId,
    p_instance_id: instance.id,
    p_expected_state: instance.current_state_key,
    p_transition_key: transitionKey,
    p_to_state: toStateKey,
    p_actor_user_id: actorUserId,
    p_comment: comment,
    p_metadata: metadata,
    p_idempotency_key: idempotencyKey,
    p_complete: complete,
    p_cancel: cancel
  })

  if (error) throw new Error(error.message)
  if (!data?.ok) {
    if (data?.current_state) {
      const { data: retry, error: retryError } = await supabase.rpc('forge_perform_workflow_transition', {
        p_organization_id: organizationId,
        p_instance_id: instance.id,
        p_expected_state: data.current_state,
        p_transition_key: transitionKey,
        p_to_state: toStateKey,
        p_actor_user_id: actorUserId,
        p_comment: comment,
        p_metadata: metadata,
        p_idempotency_key: idempotencyKey,
        p_complete: complete,
        p_cancel: cancel
      })
      if (retryError) throw new Error(retryError.message)
      if (!retry?.ok) return { error: retry?.error || 'Unable to sync workflow state.', result: retry }
      return { result: retry }
    }
    return { error: data?.error || 'Unable to sync workflow state.', result: data }
  }

  return { result: data }
}

export const performTransition = async ({
  resourceType,
  resourceId,
  transitionKey,
  comment = null,
  idempotencyKey = null,
  metadata = {}
}: {
  resourceType: string
  resourceId: string
  transitionKey: string
  comment?: string | null
  idempotencyKey?: string | null
  metadata?: Record<string, unknown>
}) => {
  if (!isForgeResourceType(resourceType)) return { error: 'Not found.' }

  const auth = await requireForgeResourceView({ resourceType, resourceId })
  if (!auth.ok) return { error: 'Not found.' }

  const transitionPerm = await requireForgePermissionForResource({
    permissionKey: 'workflow.transition',
    resource: auth.resource,
    access: auth.access,
    organizationId: auth.context.activeOrganization.id,
    userId: auth.context.user.id
  })
  if (!transitionPerm.ok) return { error: 'Not found.' }

  const organizationId = auth.resource.organizationId
  const instance = await getWorkflowInstance({ organizationId, resourceType, resourceId })
  if (!instance) return { error: 'Workflow instance not found.' }

  const transitions = await getWorkflowTransitions(instance.workflow_definition_id)
  const transition = transitions.find(
    item => item.transition_key === transitionKey && item.from_state_key === instance.current_state_key
  )
  if (!transition) return { error: 'Transition is not available from the current state.' }

  if (transition.required_permission) {
    const requiredPerm = await requireForgePermissionForResource({
      permissionKey: transition.required_permission,
      resource: auth.resource,
      access: auth.access,
      organizationId: auth.context.activeOrganization.id,
      userId: auth.context.user.id
    })
    if (!requiredPerm.ok) return { error: 'Not found.' }
  }

  if (transition.requires_comment && !cleanComment(comment)) {
    return { error: 'A comment is required for this transition.' }
  }

  if (transition.requires_approval) {
    return { error: 'This transition requires an approval request before it can complete.' }
  }

  const states = await getWorkflowStates(instance.workflow_definition_id)
  const currentState = states.find(state => state.state_key === instance.current_state_key)
  if (currentState?.is_terminal && !transitionKey.startsWith('reopen')) {
    return { error: 'Terminal workflow state cannot transition without a reopen path.' }
  }

  const complete = Boolean(
    states.find(state => state.state_key === transition.to_state_key)?.is_terminal
  )
  const cancel = transition.to_state_key === 'canceled'
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase.rpc('forge_perform_workflow_transition', {
    p_organization_id: organizationId,
    p_instance_id: instance.id,
    p_expected_state: instance.current_state_key,
    p_transition_key: transition.transition_key,
    p_to_state: transition.to_state_key,
    p_actor_user_id: auth.context.user.id,
    p_comment: comment,
    p_metadata: metadata,
    p_idempotency_key: idempotencyKey,
    p_complete: complete,
    p_cancel: cancel
  })

  if (error) return { error: error.message }
  if (!data?.ok) return { error: data?.error || 'Transition failed.' }

  await writeRecordActivity({
    organizationId,
    resourceType,
    resourceId,
    activityType: 'workflow_transition',
    message: 'Workflow transitioned to ' + transition.to_state_key + '.',
    actorUserId: auth.context.user.id,
    metadata: {
      transition_key: transition.transition_key,
      from_state: instance.current_state_key,
      to_state: transition.to_state_key,
      event_id: data.event_id,
      duplicate: Boolean(data.duplicate)
    }
  })

  if (!data.duplicate) {
    await writeForgeAudit({
      actorUserId: auth.context.user.id,
      organizationId,
      action: 'workflow.transitioned',
      entityType: 'workflow_instance',
      entityId: instance.id,
      beforeValue: { current_state_key: instance.current_state_key },
      afterValue: { current_state_key: transition.to_state_key, transition_key: transition.transition_key }
    })
  }

  return {
    message: data.duplicate ? 'Transition already applied.' : 'Workflow transitioned.',
    toState: transition.to_state_key,
    eventId: data.event_id,
    duplicate: Boolean(data.duplicate)
  }
}

export const listWorkflowDefinitions = async () => {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) return []

  const access = await getEffectiveTenantAccess({
    organizationId: context.activeOrganization.id,
    userId: context.user.id
  })
  if (!hasEffectivePermission(access, 'workflow.view')) return []

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_workflow_definitions')
    .select('*')
    .order('workflow_key')
    .order('version', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as WorkflowDefinition[]
}

const PLATFORM_WORKFLOW_VIEW_ROLES = [
  'forge_owner',
  'forge_creator',
  'forge_read_only'
] as const

/** Platform Creator diagnostic loader — no tenant context or workflow.view required. */
export const listPlatformWorkflowDefinitions = async () => {
  const { user, platformRole } = await getForgePlatformAccess()
  if (
    !user ||
    !platformRole ||
    !(PLATFORM_WORKFLOW_VIEW_ROLES as readonly string[]).includes(platformRole)
  ) {
    return [] as WorkflowDefinition[]
  }

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_workflow_definitions')
    .select('*')
    .order('workflow_key')
    .order('version', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as WorkflowDefinition[]
}
