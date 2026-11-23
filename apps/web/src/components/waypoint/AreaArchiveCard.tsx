'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { archiveArea, restoreArea } from '@/app/(back)/waypoint/actions'

/** Forge Waypoint: archive or restore an area. Archiving never deletes anything. */
const AreaArchiveCard = ({ areaId, archived }: { areaId: string; archived: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const finish = (result: { ok: boolean; message?: string; error?: string }) => {
    if (!result.ok) {
      toast('error', result.error || 'Something went wrong.')

      return
    }

    toast('success', result.message || 'Saved.')
    setOpen(false)
    router.refresh()
  }

  if (archived) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Archived area</CardTitle>
          <CardDescription>Restore it to edit it, place equipment and print a new Area Card.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => startTransition(async () => finish(await restoreArea(areaId)))}
          >
            Restore area
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive area</CardTitle>
        <CardDescription>
          Its equipment is released and its Area Card QR codes stop working. History is kept.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant='destructive' onClick={() => setOpen(true)}>
            Archive area
          </Button>
        ) : (
          <div className='flex flex-col gap-3'>
            <Textarea
              rows={3}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder='Optional reason...'
            />
            <div className='flex gap-2'>
              <Button
                variant='destructive'
                disabled={pending}
                onClick={() => startTransition(async () => finish(await archiveArea(areaId, reason)))}
              >
                Confirm archive
              </Button>
              <Button variant='outline' disabled={pending} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AreaArchiveCard
