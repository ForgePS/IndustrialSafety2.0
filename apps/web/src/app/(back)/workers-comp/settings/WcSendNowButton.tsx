'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { sendWcWeeklyStatusNow } from '../actions'

/** Queues this week's notice immediately. The database dedupes per week, so repeat clicks do not resend. */
const WcSendNowButton = ({ enabled, weekOf, lastSentWeek }: { enabled: boolean; weekOf: string; lastSentWeek: string | null }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  const send = () =>
    startTransition(async () => {
      const response = await sendWcWeeklyStatusNow()

      if (response.error) {
        toast('error', response.error)
        setResult(response.error)

        return
      }

      toast('success', response.message || 'Queued.')
      setResult(response.message || 'Queued.')
      router.refresh()
    })

  return (
    <Card data-testid='wc-send-now'>
      <CardHeader>
        <CardTitle>Send Weekly Status Now</CardTitle>
        <CardDescription>
          Queues this week&apos;s notice (week of {weekOf}) to the saved recipients right away, instead of waiting for the schedule. Each week is sent once:
          sending now replaces this week&apos;s scheduled send. {lastSentWeek ? `Last sent for the week of ${lastSentWeek}.` : 'Not sent yet.'}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <div>
          <Button variant='outline' disabled={pending || !enabled} onClick={send}>{pending ? 'Sending...' : 'Send Weekly Status Now'}</Button>
        </div>
        {!enabled ? <p className='text-textSecondary text-sm'>Turn the weekly notice on and save before sending.</p> : null}
        {result ? <p className='text-sm' role='status' data-testid='wc-send-now-result'>{result}</p> : null}
      </CardContent>
    </Card>
  )
}

export default WcSendNowButton
