'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { retireAsset } from './actions'

const AssetRetireCard = ({ assetId }: { assetId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)

  const retire = () => {
    startTransition(async () => {
      const result = await retireAsset({ assetId, reason })

      if ('error' in result) {
        toast('error', result.error || 'Unable to retire asset.')
        return
      }

      toast('success', result.message)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Retire Asset</CardTitle>
        <CardDescription>Retiring preserves the full equipment, maintenance, assignment, and meter history.</CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant='destructive' onClick={() => setOpen(true)}>Retire Asset</Button>
        ) : (
          <div className='flex flex-col gap-3'>
            <Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder='Retirement reason...' />
            <div className='flex gap-2'>
              <Button variant='destructive' onClick={retire} disabled={pending}>Confirm Retirement</Button>
              <Button variant='outline' onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AssetRetireCard
