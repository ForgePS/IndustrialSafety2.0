'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { respondToAlert } from '@/app/(back)/emergency/actions'

/** Port slice 14: "I'm safe" / "I need help" for someone an active alert was sent to. */
const RespondPanel = ({ alertId, current }: { alertId: string; current: { status: string; note: string | null; responded_at: string } | null }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState(current?.note || '')

  const respond = (status: 'safe' | 'need_help') =>
    startTransition(async () => {
      const result = await respondToAlert(alertId, { status, note })

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Saved.')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-3' data-emergency-respond>
      {current ? (
        <p className='text-sm' data-emergency-my-response={current.status}>
          You answered <strong>{current.status === 'safe' ? "I'm safe" : 'I need help'}</strong> at {new Date(current.responded_at).toLocaleTimeString()}. You can change it.
        </p>
      ) : (
        <p className='text-sm font-semibold'>Let us know you&apos;re safe.</p>
      )}
      <label className='flex flex-col gap-1 text-sm'>
        Where you are or what you need (optional)
        <input name='note' maxLength={500} value={note} onChange={event => setNote(event.target.value)} className='bg-background max-w-xl rounded-md border px-3 py-2 text-sm' />
      </label>
      <div className='flex flex-wrap gap-3'>
        <Button type='button' size='lg' disabled={pending} onClick={() => respond('safe')} className='bg-success hover:bg-success/90 text-white'>
          I&apos;m safe
        </Button>
        <Button type='button' size='lg' variant='destructive' disabled={pending} onClick={() => respond('need_help')}>
          I need help
        </Button>
      </div>
    </div>
  )
}

export default RespondPanel
