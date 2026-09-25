import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

export type RecordActivityItem = {
  id: string
  activity_type: string
  message: string | null
  actor_user_id?: string | null
  created_at: string
}

const RecordActivityTimeline = ({
  activity,
  title = 'Shared Activity',
  description = 'Cross-module activity for this record.'
}: {
  activity: RecordActivityItem[]
  title?: string
  description?: string
}) => {
  return (
    <Card data-testid='record-activity'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {activity.length ? (
          activity.map(item => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='font-medium capitalize'>
                  {String(item.activity_type).replaceAll('_', ' ')}
                </div>
                <div className='text-textSecondary text-xs'>
                  {new Date(item.created_at).toLocaleString()}
                </div>
              </div>
              {item.message ? (
                <div className='text-textSecondary mt-1 text-sm'>{item.message}</div>
              ) : null}
            </div>
          ))
        ) : (
          <div className='text-textSecondary text-sm'>No shared activity yet.</div>
        )}
      </CardContent>
    </Card>
  )
}

export default RecordActivityTimeline
