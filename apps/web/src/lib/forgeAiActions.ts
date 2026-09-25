import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { inspectionWithinScope } from '@/lib/forgeInspections'
import { assetWithinScope } from '@/lib/forgeAssets'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export type ForgeAiBoundRecordContext = {
  type: 'incident' | 'inspection' | 'asset' | 'personnel' | 'training_course' | 'qr' | 'loto' | 'task'
  id: string
  humanReference: string
  title: string
}

export type ForgeAiAvailableAction = {
  id: string
  action_key: string
  name: string
  description: string | null
  category: string
  target_type: string
  required_permission_key: string
  risk_level: 'normal' | 'sensitive' | 'critical'
  requires_approval: boolean
  allow_self_approval: boolean
  payload_schema: Record<string, unknown>
}

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const permissionFor = (
  permissionByKey: Map<string, EffectivePermission>,
  key: string
) => {
  const permission = permissionByKey.get(key)
  return permission?.allowed ? permission : null
}

const validateTargetScope = async ({
  organizationId,
  userId,
  permission,
  recordContext
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  recordContext: ForgeAiBoundRecordContext
}) => {
  const supabase = createServiceRoleClient() as any

  if (recordContext.type === 'inspection') {
    const { data: inspection } = await supabase
      .from('forge_inspections')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', recordContext.id)
      .maybeSingle()

    if (!inspection) return false

    return inspectionWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      inspection
    })
  }

  if (recordContext.type === 'asset') {
    const { data: asset } = await supabase
      .from('forge_assets')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', recordContext.id)
      .maybeSingle()

    if (!asset) return false

    return assetWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      asset
    })
  }

  return false
}

export const getAvailableForgeAiActions = async ({
  organizationId,
  userId,
  recordContext,
  permissionByKey
}: {
  organizationId: string
  userId: string
  recordContext: ForgeAiBoundRecordContext | null
  permissionByKey: Map<string, EffectivePermission>
}) => {
  if (!recordContext) return []

  const supabase = createServiceRoleClient() as any
  const [{ data: actions }, { data: overrides }] = await Promise.all([
    supabase
      .from('forge_ai_action_registry')
      .select('*')
      .eq('platform_enabled', true)
      .eq('target_type', recordContext.type)
      .order('sort_order'),
    supabase
      .from('forge_ai_tenant_actions')
      .select('*')
      .eq('organization_id', organizationId)
  ])

  const overrideByAction = new Map<string, any>(
    (overrides || []).map((item: any) => [item.action_id, item])
  )

  const available: ForgeAiAvailableAction[] = []

  for (const action of actions || []) {
    const override = overrideByAction.get(action.id)
    if (!override?.enabled) continue

    const permission = permissionFor(permissionByKey, action.required_permission_key)
    if (!permission) continue

    const withinScope = await validateTargetScope({
      organizationId,
      userId,
      permission,
      recordContext
    })

    if (!withinScope) continue

    available.push(action as ForgeAiAvailableAction)
  }

  return available
}

const validateInspectionFindingPayload = async ({
  organizationId,
  payload
}: {
  organizationId: string
  payload: Record<string, unknown>
}) => {
  const title = cleanText(payload.title)
  const description = cleanText(payload.description)
  const severity = cleanText(payload.severity)
  const dueDate = cleanText(payload.due_date)

  if (!title) return { error: 'Finding title is required.' }
  if (!severity) return { error: 'Finding severity is required.' }

  const severityLookup = await getEffectiveLookup({
    organizationId,
    lookupKey: 'inspections.finding_severity'
  })

  if (!severityLookup.options.some(option => option.key === severity)) {
    return { error: 'Finding severity is not valid for this tenant.' }
  }

  if (dueDate && Number.isNaN(new Date(dueDate + 'T00:00:00').getTime())) {
    return { error: 'Finding due date is invalid.' }
  }

  return {
    payload: {
      title,
      description,
      severity,
      due_date: dueDate
    }
  }
}

const validateAssetMaintenancePayload = async ({
  organizationId,
  payload
}: {
  organizationId: string
  payload: Record<string, unknown>
}) => {
  const maintenanceType = cleanText(payload.maintenance_type)
  const status = cleanText(payload.status) || 'scheduled'
  const description = cleanText(payload.description)
  const scheduledFor = cleanText(payload.scheduled_for)
  const performedOn = cleanText(payload.performed_on)
  const nextDueDate = cleanText(payload.next_due_date)

  if (!maintenanceType) return { error: 'Maintenance type is required.' }
  if (!description) return { error: 'Maintenance description is required.' }

  const [maintenanceTypes, maintenanceStatuses] = await Promise.all([
    getEffectiveLookup({
      organizationId,
      lookupKey: 'assets.maintenance_type'
    }),
    getEffectiveLookup({
      organizationId,
      lookupKey: 'assets.maintenance_status'
    })
  ])

  if (!maintenanceTypes.options.some(option => option.key === maintenanceType)) {
    return { error: 'Maintenance type is not valid for this tenant.' }
  }

  if (!maintenanceStatuses.options.some(option => option.key === status)) {
    return { error: 'Maintenance status is not valid for this tenant.' }
  }

  for (const [name, value] of [
    ['Scheduled date', scheduledFor],
    ['Performed date', performedOn],
    ['Next due date', nextDueDate]
  ] as const) {
    if (value && Number.isNaN(new Date(value + 'T00:00:00').getTime())) {
      return { error: name + ' is invalid.' }
    }
  }

  return {
    payload: {
      maintenance_type: maintenanceType,
      status,
      scheduled_for: scheduledFor,
      performed_on: performedOn,
      description,
      vendor: cleanText(payload.vendor),
      technician: cleanText(payload.technician),
      findings: cleanText(payload.findings),
      corrective_action: cleanText(payload.corrective_action),
      next_due_date: nextDueDate
    }
  }
}

export const prepareForgeAiAction = async ({
  organizationId,
  userId,
  conversationId,
  toolRunId,
  recordContext,
  permissionByKey,
  actionKey,
  rawPayload
}: {
  organizationId: string
  userId: string
  conversationId: string
  toolRunId: number | null
  recordContext: ForgeAiBoundRecordContext | null
  permissionByKey: Map<string, EffectivePermission>
  actionKey: string
  rawPayload: Record<string, unknown>
}) => {
  if (!recordContext) {
    return { error: 'AI actions require a Forge record to be open in the contextual assistant.' }
  }

  const availableActions = await getAvailableForgeAiActions({
    organizationId,
    userId,
    recordContext,
    permissionByKey
  })

  const action = availableActions.find(item => item.action_key === actionKey)
  if (!action) {
    return { error: 'This AI action is not enabled or permitted for the current record.' }
  }

  let validated:
    | { payload: Record<string, unknown> }
    | { error: string }

  if (action.action_key === 'inspection.create_finding') {
    validated = await validateInspectionFindingPayload({
      organizationId,
      payload: rawPayload
    })
  } else if (action.action_key === 'asset.add_maintenance') {
    validated = await validateAssetMaintenancePayload({
      organizationId,
      payload: rawPayload
    })
  } else {
    return { error: 'This AI action does not have an executor yet.' }
  }

  if ('error' in validated) return validated

  const supabase = createServiceRoleClient() as any
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const riskSummary =
    action.risk_level === 'normal'
      ? 'This will create a new Forge record after human approval.'
      : 'This action affects sensitive or critical Forge data and requires careful review.'

  const { data: approval, error } = await supabase
    .from('forge_ai_action_approvals')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      tool_run_id: toolRunId,
      requested_by: userId,
      action_key: action.action_key,
      target_type: recordContext.type,
      target_id: recordContext.id,
      request_payload: validated.payload,
      risk_summary: riskSummary,
      status: 'pending',
      approval_expires_at: expiresAt
    })
    .select('*')
    .single()

  if (error || !approval) {
    return { error: error?.message || 'Unable to create AI action approval request.' }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: userId,
    organization_id: organizationId,
    action: 'forge_ai.action_requested',
    entity_type: 'forge_ai_action_approval',
    entity_id: approval.id,
    after_value: {
      action_key: action.action_key,
      action_name: action.name,
      target_type: recordContext.type,
      target_reference: recordContext.humanReference,
      request_payload: validated.payload,
      approval_expires_at: expiresAt
    }
  })

  return {
    pending_approval: true,
    approval_id: approval.id,
    action_key: action.action_key,
    action_name: action.name,
    target_reference: recordContext.humanReference,
    proposed_changes: validated.payload,
    risk_summary: riskSummary,
    expires_at: expiresAt,
    instruction: 'Tell the user the action has been prepared but NOT executed. They must review and approve it in Forge AI Actions.'
  }
}

const loadTargetForScope = async ({
  supabase,
  organizationId,
  approval
}: {
  supabase: any
  organizationId: string
  approval: any
}) => {
  if (approval.target_type === 'inspection') {
    const { data } = await supabase
      .from('forge_inspections')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', approval.target_id)
      .maybeSingle()

    return data
  }

  if (approval.target_type === 'asset') {
    const { data } = await supabase
      .from('forge_assets')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', approval.target_id)
      .maybeSingle()

    return data
  }

  return null
}

const validatePermissionAtExecution = async ({
  organizationId,
  userId,
  action,
  target
}: {
  organizationId: string
  userId: string
  action: ForgeAiAvailableAction
  target: any
}) => {
  const access = await getEffectiveTenantAccess({ organizationId, userId })
  const permission = access.effective.find(
    item => item.permissionKey === action.required_permission_key && item.allowed
  )

  if (!permission) return false

  if (action.target_type === 'inspection') {
    return inspectionWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      inspection: target
    })
  }

  if (action.target_type === 'asset') {
    return assetWithinScope({
      organizationId,
      userId,
      scope: permission.scope,
      asset: target
    })
  }

  return false
}

const executeInspectionFinding = async ({
  supabase,
  organizationId,
  approval,
  actorUserId
}: {
  supabase: any
  organizationId: string
  approval: any
  actorUserId: string
}) => {
  const payload = approval.request_payload || {}

  const validated = await validateInspectionFindingPayload({
    organizationId,
    payload
  })
  if ('error' in validated) throw new Error(validated.error)

  const { data: finding, error } = await supabase
    .from('forge_inspection_findings')
    .insert({
      organization_id: organizationId,
      inspection_id: approval.target_id,
      inspection_item_id: null,
      title: validated.payload.title,
      description: validated.payload.description,
      severity: validated.payload.severity,
      status: 'open',
      due_date: validated.payload.due_date,
      created_by: approval.requested_by,
      updated_by: actorUserId
    })
    .select('*')
    .single()

  if (error || !finding) {
    throw new Error(error?.message || 'Unable to create inspection finding.')
  }

  await supabase.from('forge_inspection_activity').insert({
    organization_id: organizationId,
    inspection_id: approval.target_id,
    activity_type: 'finding_created',
    message: 'Finding created through an approved Forge AI action: ' + finding.title,
    actor_user_id: actorUserId,
    metadata: {
      finding_id: finding.id,
      forge_ai_approval_id: approval.id,
      requested_by: approval.requested_by
    }
  })

  return {
    entity_type: 'inspection_finding',
    entity_id: finding.id,
    message: 'Inspection finding created.'
  }
}

const executeAssetMaintenance = async ({
  supabase,
  organizationId,
  approval,
  actorUserId
}: {
  supabase: any
  organizationId: string
  approval: any
  actorUserId: string
}) => {
  const payload = approval.request_payload || {}

  const validated = await validateAssetMaintenancePayload({
    organizationId,
    payload
  })
  if ('error' in validated) throw new Error(validated.error)

  const { data: record, error } = await supabase
    .from('forge_asset_maintenance')
    .insert({
      organization_id: organizationId,
      asset_id: approval.target_id,
      maintenance_type: validated.payload.maintenance_type,
      status: validated.payload.status,
      scheduled_for: validated.payload.scheduled_for,
      performed_on: validated.payload.performed_on,
      vendor: validated.payload.vendor,
      technician: validated.payload.technician,
      description: validated.payload.description,
      findings: validated.payload.findings,
      corrective_action: validated.payload.corrective_action,
      next_due_date: validated.payload.next_due_date,
      created_by: approval.requested_by,
      updated_by: actorUserId
    })
    .select('*')
    .single()

  if (error || !record) {
    throw new Error(error?.message || 'Unable to create asset maintenance record.')
  }

  await supabase.from('forge_asset_activity').insert({
    organization_id: organizationId,
    asset_id: approval.target_id,
    activity_type: 'maintenance_recorded',
    message: 'Maintenance record created through an approved Forge AI action: ' + record.description,
    actor_user_id: actorUserId,
    metadata: {
      maintenance_id: record.id,
      forge_ai_approval_id: approval.id,
      requested_by: approval.requested_by
    }
  })

  return {
    entity_type: 'asset_maintenance',
    entity_id: record.id,
    message: 'Asset maintenance record created.'
  }
}

export const approveAndExecuteForgeAiAction = async ({
  organizationId,
  approverUserId,
  approvalId
}: {
  organizationId: string
  approverUserId: string
  approvalId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: approval }, { data: actions }] = await Promise.all([
    supabase
      .from('forge_ai_action_approvals')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', approvalId)
      .maybeSingle(),
    supabase
      .from('forge_ai_action_registry')
      .select('*')
      .eq('platform_enabled', true)
  ])

  if (!approval) return { error: 'AI action approval request not found.' }
  if (approval.status !== 'pending') return { error: 'This AI action is no longer pending approval.' }

  if (
    approval.approval_expires_at &&
    new Date(approval.approval_expires_at).getTime() <= Date.now()
  ) {
    await supabase
      .from('forge_ai_action_approvals')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('id', approval.id)

    return { error: 'This AI action approval request has expired.' }
  }

  const action = (actions || []).find((item: any) => item.action_key === approval.action_key) as ForgeAiAvailableAction | undefined
  if (!action) return { error: 'The requested AI action is no longer enabled.' }

  if (!action.allow_self_approval && approval.requested_by === approverUserId) {
    return { error: 'This action requires approval from a different authorized user.' }
  }

  const target = await loadTargetForScope({
    supabase,
    organizationId,
    approval
  })
  if (!target) return { error: 'The target Forge record no longer exists.' }

  const [requesterStillAllowed, approverAllowed] = await Promise.all([
    validatePermissionAtExecution({
      organizationId,
      userId: approval.requested_by,
      action,
      target
    }),
    validatePermissionAtExecution({
      organizationId,
      userId: approverUserId,
      action,
      target
    })
  ])

  if (!requesterStillAllowed) {
    return { error: 'The requesting user no longer has the underlying Forge permission for this action.' }
  }

  if (!approverAllowed) {
    return { error: 'You do not have the underlying Forge permission and scope required to approve this action.' }
  }

  const now = new Date().toISOString()

  const { data: lockedApproval, error: lockError } = await supabase
    .from('forge_ai_action_approvals')
    .update({
      status: 'executing',
      approved_by: approverUserId,
      approved_at: now,
      updated_at: now
    })
    .eq('id', approval.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (lockError) return { error: lockError.message }
  if (!lockedApproval) {
    return { error: 'This AI action was already reviewed or is currently being processed.' }
  }

  try {
    let result: any

    if (approval.action_key === 'inspection.create_finding') {
      result = await executeInspectionFinding({
        supabase,
        organizationId,
        approval,
        actorUserId: approverUserId
      })
    } else if (approval.action_key === 'asset.add_maintenance') {
      result = await executeAssetMaintenance({
        supabase,
        organizationId,
        approval,
        actorUserId: approverUserId
      })
    } else {
      throw new Error('No executor exists for this AI action.')
    }

    const executedAt = new Date().toISOString()

    await Promise.all([
      supabase
        .from('forge_ai_action_approvals')
        .update({
          status: 'executed',
          execution_result: result,
          executed_at: executedAt,
          updated_at: executedAt
        })
        .eq('id', approval.id),
      supabase.from('forge_creator_audit_log').insert({
        actor_user_id: approverUserId,
        organization_id: organizationId,
        action: 'forge_ai.action_executed',
        entity_type: 'forge_ai_action_approval',
        entity_id: approval.id,
        before_value: {
          status: 'pending',
          action_key: approval.action_key,
          request_payload: approval.request_payload
        },
        after_value: {
          status: 'executed',
          result
        }
      })
    ])

    return {
      message: result.message,
      result,
      target_type: approval.target_type,
      target_id: approval.target_id
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI action execution failed.'

    await supabase
      .from('forge_ai_action_approvals')
      .update({
        status: 'failed',
        execution_result: { error: message },
        updated_at: new Date().toISOString()
      })
      .eq('id', approval.id)

    return { error: message }
  }
}

export const rejectForgeAiAction = async ({
  organizationId,
  approverUserId,
  approvalId,
  reason
}: {
  organizationId: string
  approverUserId: string
  approvalId: string
  reason: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: approval } = await supabase
    .from('forge_ai_action_approvals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', approvalId)
    .maybeSingle()

  if (!approval) return { error: 'AI action approval request not found.' }
  if (approval.status !== 'pending') return { error: 'This AI action is no longer pending approval.' }

  const now = new Date().toISOString()

  const { data: rejectedApproval, error } = await supabase
    .from('forge_ai_action_approvals')
    .update({
      status: 'rejected',
      rejected_by: approverUserId,
      rejected_at: now,
      rejection_reason: reason.trim() || null,
      updated_at: now
    })
    .eq('id', approvalId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!rejectedApproval) {
    return { error: 'This AI action was already reviewed or is currently being processed.' }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: approverUserId,
    organization_id: organizationId,
    action: 'forge_ai.action_rejected',
    entity_type: 'forge_ai_action_approval',
    entity_id: approvalId,
    before_value: {
      status: 'pending',
      action_key: approval.action_key
    },
    after_value: {
      status: 'rejected',
      reason: reason.trim() || null
    }
  })

  return { message: 'AI action rejected.' }
}
