'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { archiveManagedQrCode } from './actions'

const QrArchiveCard = ({ qrCodeId }: { qrCodeId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  const archive = () => {
    if (!window.confirm('Archive this QR code? Printed copies will stop resolving.')) return

    startTransition(async () => {
      const result = await archiveManagedQrCode({ qrCodeId, reason })

      if ('error' in result) {
        toast('error', result.error || 'Unable to archive QR code.')
        return
      }

      toast('success', result.message)
      router.push('/qr')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archive QR Code</CardTitle>
        <CardDescription>Archive is non-destructive. Scan and audit history are retained.</CardDescription>
      </CardHeader>
      <CardContent>
        {!open ? (
          <Button variant='destructive' onClick={() => setOpen(true)}>Archive QR Code</Button>
        ) : (
          <div className='flex flex-col gap-3'>
            <Textarea rows={3} value={reason} onChange={event => setReason(event.target.value)} placeholder='Optional archive reason...' />
            <div className='flex gap-2'>
              <Button variant='destructive' onClick={archive} disabled={pending}>Confirm Archive</Button>
              <Button variant='outline' onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default QrArchiveCard
