/**
 * Explicit CAPA status ↔ workflow state mapping.
 * Keys are identical today but must remain an intentional bridge — never assume
 * forge_corrective_actions.status and workflow state_key stay coupled by coincidence.
 */

export const CAPA_WORKFLOW_KEY = 'corrective_actions.lifecycle'

export const CAPA_LIFECYCLE_STATUSES = [
  'open',
  'in_progress',
  'pending_verification',
  'verified',
  'closed',
  'canceled'
] as const

export type CapaLifecycleStatus = (typeof CAPA_LIFECYCLE_STATUSES)[number]

const CAPA_TO_WORKFLOW: Record<CapaLifecycleStatus, CapaLifecycleStatus> = {
  open: 'open',
  in_progress: 'in_progress',
  pending_verification: 'pending_verification',
  verified: 'verified',
  closed: 'closed',
  canceled: 'canceled'
}

const WORKFLOW_TO_CAPA: Record<CapaLifecycleStatus, CapaLifecycleStatus> = {
  open: 'open',
  in_progress: 'in_progress',
  pending_verification: 'pending_verification',
  verified: 'verified',
  closed: 'closed',
  canceled: 'canceled'
}

export const isCapaLifecycleStatus = (value: string): value is CapaLifecycleStatus =>
  (CAPA_LIFECYCLE_STATUSES as readonly string[]).includes(value)

export const capaStatusToWorkflowState = (status: string): CapaLifecycleStatus | null => {
  if (!isCapaLifecycleStatus(status)) return null
  return CAPA_TO_WORKFLOW[status]
}

export const workflowStateToCapaStatus = (stateKey: string): CapaLifecycleStatus | null => {
  if (!isCapaLifecycleStatus(stateKey)) return null
  return WORKFLOW_TO_CAPA[stateKey]
}
