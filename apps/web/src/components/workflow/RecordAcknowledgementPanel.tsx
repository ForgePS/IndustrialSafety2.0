import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { acknowledgeRecordAction } from '@/app/(back)/workflow/actions'

export type AcknowledgementItem = {
  id: string
  acknowledgement_type: string
  user_id: string
  acknowledged_at: string
  signature_method?: string | null
}

const RecordAcknowledgementPanel = ({
  resourceType,
  resourceId,
  acknowledgements,
  canAcknowledge = true,
  acknowledgementType = 'reviewed'
}: {
  resourceType: string
  resourceId: string
  acknowledgements: AcknowledgementItem[]
  canAcknowledge?: boolean
  acknowledgementType?: string
}) => {
  return (
    <Card data-testid='record-acknowledgements'>
      <CardHeader>
        <CardTitle>Acknowledgements</CardTitle>
        <CardDescription>Confirmations recorded against this resource.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        {acknowledgements.length ? (
          acknowledgements.map(item => (
            <div key={item.id} className='rounded-lg border p-3'>
              <div className='font-medium capitalize'>
                {item.acknowledgement_type.replaceAll('_', ' ')}
              </div>
              <div className='text-textSecondary mt-1 text-xs'>
                {new Date(item.acknowledged_at).toLocaleString()}
                {item.signature_method
                  ? ' · ' + item.signature_method.replaceAll('_', ' ')
                  : ''}
              </div>
            </div>
          ))
        ) : (
          <div className='text-textSecondary text-sm'>No acknowledgements yet.</div>
        )}

        {canAcknowledge ? (
          <form action={acknowledgeRecordAction}>
            <input type='hidden' name='resourceType' value={resourceType} />
            <input type='hidden' name='resourceId' value={resourceId} />
            <input type='hidden' name='acknowledgementType' value={acknowledgementType} />
            <Button type='submit' size='sm' variant='outline'>
              Acknowledge ({acknowledgementType.replaceAll('_', ' ')})
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default RecordAcknowledgementPanel
