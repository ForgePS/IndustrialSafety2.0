import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

export type AllowedWorkflowTransition = {
  transition_key: string
  name: string
  from_state_key: string
  to_state_key: string
  requires_comment?: boolean
  requires_approval?: boolean
}

/**
 * Read-only display of allowed transitions.
 * CAPA proof keeps lifecycle mutations on domain controls; this panel is informational.
 */
const WorkflowActionMenu = ({
  transitions,
  currentStateKey
}: {
  transitions: AllowedWorkflowTransition[]
  currentStateKey?: string | null
}) => {
  return (
    <Card data-testid='workflow-actions'>
      <CardHeader>
        <CardTitle>Allowed Transitions</CardTitle>
        <CardDescription>
          Transitions available from the current workflow state
          {currentStateKey ? ` (${currentStateKey.replaceAll('_', ' ')})` : ''}.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-2'>
        {transitions.length ? (
          transitions.map(transition => (
            <div
              key={transition.transition_key}
              className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
            >
              <div>
                <div className='font-medium'>{transition.name}</div>
                <div className='text-textSecondary mt-1 text-xs capitalize'>
                  {transition.from_state_key.replaceAll('_', ' ')} →{' '}
                  {transition.to_state_key.replaceAll('_', ' ')}
                </div>
              </div>
              <div className='flex flex-wrap gap-1'>
                {transition.requires_comment ? (
                  <Badge size='sm' variant='outline'>
                    Comment
                  </Badge>
                ) : null}
                {transition.requires_approval ? (
                  <Badge size='sm' variant='secondary'>
                    Approval
                  </Badge>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className='text-textSecondary text-sm'>No transitions available.</div>
        )}
      </CardContent>
    </Card>
  )
}

export default WorkflowActionMenu
