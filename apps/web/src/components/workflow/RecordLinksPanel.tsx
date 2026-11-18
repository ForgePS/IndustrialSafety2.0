import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import {
  archiveSharedLinkAction,
  createSharedLinkAction
} from '@/app/(back)/workflow/actions'

export type RecordLinkItem = {
  id: string
  source_resource_type: string
  source_resource_id: string
  target_resource_type: string
  target_resource_id: string
  relationship_type: string
  created_at: string
}

const LINK_TARGET_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'incident', label: 'Incident' },
  { value: 'asset', label: 'Asset' },
  { value: 'inspection', label: 'Inspection' }
] as const

const RecordLinksPanel = ({
  resourceType,
  resourceId,
  outbound,
  inbound,
  canManage = true
}: {
  resourceType: string
  resourceId: string
  outbound: RecordLinkItem[]
  inbound: RecordLinkItem[]
  canManage?: boolean
}) => {
  return (
    <Card data-testid='record-links'>
      <CardHeader>
        <CardTitle>Record Links</CardTitle>
        <CardDescription>Related records linked to this resource.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>
            Outbound
          </div>
          {outbound.length ? (
            outbound.map(link => (
              <div
                key={link.id}
                className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
              >
                <div>
                  <div className='font-medium capitalize'>
                    {link.relationship_type.replaceAll('_', ' ')} →{' '}
                    {link.target_resource_type.replaceAll('_', ' ')}
                  </div>
                  <div className='text-textSecondary mt-1 font-mono text-xs'>
                    {link.target_resource_id}
                  </div>
                </div>
                {canManage ? (
                  <form action={archiveSharedLinkAction}>
                    <input type='hidden' name='linkId' value={link.id} />
                    <input type='hidden' name='resourceType' value={resourceType} />
                    <input type='hidden' name='resourceId' value={resourceId} />
                    <Button type='submit' size='sm' variant='outline'>
                      Archive
                    </Button>
                  </form>
                ) : null}
              </div>
            ))
          ) : (
            <div className='text-textSecondary text-sm'>No outbound links.</div>
          )}
        </div>

        <div className='flex flex-col gap-2'>
          <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>
            Inbound
          </div>
          {inbound.length ? (
            inbound.map(link => (
              <div key={link.id} className='rounded-lg border p-3'>
                <div className='font-medium capitalize'>
                  {link.source_resource_type.replaceAll('_', ' ')} →{' '}
                  {link.relationship_type.replaceAll('_', ' ')}
                </div>
                <div className='text-textSecondary mt-1 font-mono text-xs'>
                  {link.source_resource_id}
                </div>
              </div>
            ))
          ) : (
            <div className='text-textSecondary text-sm'>No inbound links.</div>
          )}
        </div>

        {canManage ? (
          <form action={createSharedLinkAction} className='flex flex-col gap-3 rounded-lg border p-3'>
            <div className='text-sm font-medium'>Add link</div>
            <input type='hidden' name='sourceResourceType' value={resourceType} />
            <input type='hidden' name='sourceResourceId' value={resourceId} />
            <input type='hidden' name='relationshipType' value='related' />
            <div className='grid gap-3 sm:grid-cols-2'>
              <label className='flex flex-col gap-1 text-sm'>
                <span className='text-textSecondary'>Target type</span>
                <select
                  name='targetResourceType'
                  required
                  className='border-input bg-background rounded-md border px-3 py-2'
                  defaultValue='task'
                >
                  {LINK_TARGET_TYPES.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1 text-sm'>
                <span className='text-textSecondary'>Target ID</span>
                <input
                  name='targetResourceId'
                  required
                  placeholder='UUID'
                  className='border-input bg-background rounded-md border px-3 py-2'
                />
              </label>
            </div>
            <Button type='submit' size='sm' className='w-fit'>
              Create link
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default RecordLinksPanel
