'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'

import { acknowledgeForgeAiWatchAlert } from '../watch/actions'

export type CenterAlert = {
  id: string
  title: string
  summary: string
  severity: string
  status: string
  last_detected_at: string
}

const AlertCenter = ({ alerts }: { alerts: CenterAlert[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const acknowledge = (alertId: string) =>
    startTransition(async () => {
      setError('')
      const result: any = await acknowledgeForgeAiWatchAlert(alertId)

      if (result?.error) setError(result.error)
      router.refresh()
    })

  if (!alerts.length) return <p className='text-textSecondary text-sm'>No open high or critical alerts in your scope.</p>

  return (
    <div className='flex flex-col gap-3' data-testid='alert-center'>
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
      {alerts.map(alert => (
        <div key={alert.id} className='border-divider flex flex-wrap items-start justify-between gap-3 rounded-md border p-3' data-testid='alert-center-item'>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={alert.severity === 'critical' ? 'destructive' : 'default'}>{alert.severity}</Badge>
              {alert.status === 'acknowledged' ? <Badge variant='outline'>acknowledged</Badge> : null}
              <span className='text-textPrimary font-medium'>{alert.title}</span>
            </div>
            <p className='text-textSecondary mt-1 text-sm'>{alert.summary}</p>
            <p className='text-textSecondary mt-1 text-xs'>Last detected {new Date(alert.last_detected_at).toLocaleString()}</p>
          </div>
          <div className='flex gap-2'>
            {alert.status === 'open' ? (
              <Button size='sm' variant='outline' disabled={pending} onClick={() => acknowledge(alert.id)}>
                Acknowledge
              </Button>
            ) : null}
            <Button size='sm' variant='ghost' asChild>
              <Link href='/ai/watch'>Open</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default AlertCenter
