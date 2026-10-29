import { createServiceRoleClient } from '@repo/supabase/server'
import { writeForgeAudit } from './forgeAudit'
import { writeRecordActivity } from './forgeRecordActivity'
import {
  requireForgePermissionForResource,
  requireForgeResourceManage,
  requireForgeResourceView
} from './forgeResourceRegistry'
import { getTenantContext } from './forgeTenantContext'

export const requestApproval = async ({
  resourceType,
  resourceId,
  approvalType,
  workflowInstanceId = null,
  approverUserId = null,
  comment = null
}: {
  resourceType: string
  resourceId: string
  approvalType: string
  workflowInstanceId?: string | null
  approverUserId?: string | null
  comment?: string | null
}) => {
  const auth = await requireForgeResourceManage({ resourceType, resourceId })
  if (!auth.ok) return { error: 'Not found.' }

  const approvePerm = await requireForgePermissionForResource({
    permissionKey: 'workflow.approve',
    resource: auth.resource,
    access: auth.access,
    organizationId: auth.context.activeOrganization.id,
    userId: auth.context.user.id
  })
  if (!approvePerm.ok) return { error: 'Not found.' }

  const organizationId = auth.resource.organizationId
  const supabase = createServiceRoleClient() as any
  const { data: request, error } = await supabase
    .from('forge_approval_requests')
    .insert({
      organization_id: organizationId,
      resource_type: resourceType,
      resource_id: resourceId,
      workflow_instance_id: workflowInstanceId,
      approval_type: approvalType,
      status: 'pending',
      requested_by: auth.context.user.id
    })
    .select('*')
    .single()

  if (error || !request) return { error: error?.message || 'Unable to create approval request.' }

  const { data: step, error: stepError } = await supabase
    .from('forge_approval_steps')
    .insert({
      organization_id: organizationId,
      approval_request_id: request.id,
      step_order: 1,
      approver_user_id: approverUserId,
      status: 'pending',
      comment
    })
    .select('*')
    .single()

  if (stepError || !step) return { error: stepError?.message || 'Unable to create approval step.' }

  await writeRecordActivity({
    organizationId,
    resourceType,
    resourceId,
    activityType: 'approval_requested',
    message: 'Approval requested (' + approvalType + ').',
    actorUserId: auth.context.user.id,
    metadata: { approval_request_id: request.id }
  })

  await writeForgeAudit({
    actorUserId: auth.context.user.id,
    organizationId,
    action: 'approval.requested',
    entityType: 'approval_request',
    entityId: request.id,
    afterValue: request
  })

  return {
    request: request as Record<string, unknown>,
    step: step as Record<string, unknown>,
    message: 'Approval requested.'
  }
}

export const decideApprovalStep = async ({
  stepId,
  decision,
  comment = null
}: {
  stepId: string
  decision: 'approved' | 'rejected'
  comment?: string | null
}) => {
  const context = await getTenantContext()
  if (!context.user || !context.activeOrganization) return { error: 'Not found.' }

  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: step } = await supabase
    .from('forge_approval_steps')
    .select('*, forge_approval_requests(*)')
    .eq('organization_id', organizationId)
    .eq('id', stepId)
    .maybeSingle()

  if (!step) return { error: 'Not found.' }
  if (step.status !== 'pending') return { error: 'Approval step is no longer pending.' }

  if (step.approver_user_id && step.approver_user_id !== context.user.id) {
    return { error: 'You are not the assigned approver for this step.' }
  }

  const request = Array.isArray(step.forge_approval_requests)
    ? step.forge_approval_requests[0]
    : step.forge_approval_requests

  if (!request) return { error: 'Not found.' }

  if (request.requested_by === context.user.id) {
    return { error: 'Requester cannot approve their own approval request.' }
  }

  const parentAuth = await requireForgeResourceView({
    resourceType: request.resource_type,
    resourceId: request.resource_id
  })
  if (!parentAuth.ok) return { error: 'Not found.' }

  const approvePerm = await requireForgePermissionForResource({
    permissionKey: 'workflow.approve',
    resource: parentAuth.resource,
    access: parentAuth.access,
    organizationId: parentAuth.context.activeOrganization.id,
    userId: parentAuth.context.user.id
  })
  if (!approvePerm.ok) return { error: 'Not found.' }

  const now = new Date().toISOString()
  const { data: updatedStep, error } = await supabase
    .from('forge_approval_steps')
    .update({
      status: decision,
      decision,
      comment,
      decided_by: context.user.id,
      decided_at: now
    })
    .eq('id', stepId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !updatedStep) return { error: error?.message || 'Unable to record decision.' }

  const { data: updatedRequest } = await supabase
    .from('forge_approval_requests')
    .update({
      status: decision === 'approved' ? 'approved' : 'rejected',
      completed_at: now,
      updated_at: now
    })
    .eq('id', step.approval_request_id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  await writeRecordActivity({
    organizationId,
    resourceType: request.resource_type,
    resourceId: request.resource_id,
    activityType: 'approval_' + decision,
    message: 'Approval ' + decision + '.',
    actorUserId: context.user.id,
    metadata: { approval_request_id: request.id, step_id: stepId }
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'approval.' + decision,
    entityType: 'approval_request',
    entityId: request.id,
    afterValue: { request: updatedRequest, step: updatedStep }
  })

  return {
    request: updatedRequest as Record<string, unknown>,
    step: updatedStep as Record<string, unknown>,
    message: 'Approval ' + decision + '.'
  }
}

export const listApprovalsForResource = async ({
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

  const supabase = createServiceRoleClient() as any
  const { data, error } = await supabase
    .from('forge_approval_requests')
    .select('*, forge_approval_steps(*)')
    .eq('organization_id', organizationId)
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .order('requested_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as Array<{
    id: string
    approval_type: string
    status: string
    requested_at?: string | null
    completed_at?: string | null
    forge_approval_steps?: Array<{
      id: string
      step_order: number
      status: string
      decision?: string | null
      comment?: string | null
      decided_at?: string | null
    }>
  }>
}
