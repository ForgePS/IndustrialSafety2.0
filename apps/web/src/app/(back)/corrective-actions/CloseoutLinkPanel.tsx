import { getCloseoutLinkState } from '@/lib/forgeCapaCloseout'

import CloseoutLinkControls from './CloseoutLinkControls'

/** Closeout link card on the CAPA detail page, for people who may edit the CAPA. */
const CloseoutLinkPanel = async ({
  organizationId,
  correctiveActionId,
  status,
  archived,
  canManage
}: {
  organizationId: string
  correctiveActionId: string
  status: string
  archived: boolean
  canManage: boolean
}) => {
  if (!canManage) return null

  const state = await getCloseoutLinkState({ organizationId, correctiveActionId })
  const canIssue = !archived && ['open', 'in_progress'].includes(status)

  if (!canIssue && !state.active && !state.lastSubmission) return null

  return <CloseoutLinkControls correctiveActionId={correctiveActionId} canIssue={canIssue} state={state} />
}

export default CloseoutLinkPanel
