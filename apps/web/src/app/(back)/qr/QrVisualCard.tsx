'use client'

import { useTransition } from 'react'
import { TbCopy, TbDownload, TbRefresh } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'
import { rotateManagedQrToken } from './actions'

const QrVisualCard = ({
  qrCodeId,
  qrNumber,
  name,
  scanUrl,
  svg,
  canRotate
}: {
  qrCodeId: string
  qrNumber: string
  name: string
  scanUrl: string
  svg: string
  canRotate: boolean
}) => {
  const [pending, startTransition] = useTransition()

  const copy = async () => {
    await navigator.clipboard.writeText(scanUrl)
    toast('success', 'QR scan URL copied.')
  }

  const download = () => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = qrNumber + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.svg'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const rotate = () => {
    if (!window.confirm('Rotate this QR token? Existing printed copies will stop working immediately.')) return

    startTransition(async () => {
      const result = await rotateManagedQrToken(qrCodeId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to rotate QR token.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Printable QR Code</CardTitle>
        <CardDescription>The image is generated inside Forge. The scan token is not sent to an external QR service.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center'>
          <div className='mx-auto w-full max-w-[360px] rounded-xl border bg-white p-4'>
            <div dangerouslySetInnerHTML={{ __html: svg }} />
          </div>

          <div>
            <div className='text-textSecondary text-xs uppercase tracking-wide'>Scan URL</div>
            <div className='mt-2 break-all rounded-lg border p-3 font-mono text-sm'>{scanUrl}</div>
            <div className='mt-4 flex flex-wrap gap-2'>
              <Button variant='outline' onClick={copy}><TbCopy />Copy URL</Button>
              <Button variant='outline' onClick={download}><TbDownload />Download SVG</Button>
              {canRotate ? (
                <Button variant='destructive' onClick={rotate} disabled={pending}><TbRefresh />Rotate Token</Button>
              ) : null}
            </div>
            {canRotate ? (
              <p className='text-textSecondary mt-3 text-xs'>
                Token rotation is an emergency/security action. It invalidates every previously printed copy of this QR code.
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default QrVisualCard
