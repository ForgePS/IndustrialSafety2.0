import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

export type WorkflowTimelineEvent = {
  id: string
  transition_key: string
  from_state_key: string | null
  to_state_key: string
  comment: string | null
  occurred_at: string
}

const formatKey = (value: string | null) => {
  if (!value) return '—'
  return value.replaceAll('_', ' ')
}

const WorkflowTimeline = ({ events }: { events: WorkflowTimelineEvent[] }) => {
  return (
    <Card data-testid='workflow-timeline'>
      <CardHeader>
        <CardTitle>Workflow History</CardTitle>
        <CardDescription>Shared workflow transitions for this record.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {events.length ? (
          events.map(event => (
            <div key={event.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>{formatKey(event.transition_key)}</div>
                <div className='text-textSecondary text-xs'>
                  {new Date(event.occurred_at).toLocaleString()}
                </div>
              </div>
              <div className='text-textSecondary mt-1 text-sm capitalize'>
                {formatKey(event.from_state_key)} → {formatKey(event.to_state_key)}
              </div>
              {event.comment ? (
                <div className='text-textSecondary mt-2 whitespace-pre-wrap text-sm'>
                  {event.comment}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className='text-textSecondary text-sm'>No workflow transitions yet.</div>
        )}
      </CardContent>
    </Card>
  )
}

export default WorkflowTimeline
