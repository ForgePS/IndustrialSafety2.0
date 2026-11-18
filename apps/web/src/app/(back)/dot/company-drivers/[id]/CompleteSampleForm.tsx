'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { toast } from '@repo/ui/utils/toast'

import { completeMvrSample } from '../../actions'

const CompleteSampleForm = ({ driverId }: { driverId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const today = new Date().toISOString().slice(0, 10)
  const [completedOn, setCompletedOn] = useState(today)
  const [note, setNote] = useState('')

  return (
    <div className='flex flex-col gap-2'>
      <Input type='date' aria-label='MVR pulled on' max={today} value={completedOn} onChange={event => setCompletedOn(event.target.value)} />
      <Input placeholder='Note (optional)' value={note} onChange={event => setNote(event.target.value)} />
      <div>
        <Button
          disabled={pending || !completedOn}
          onClick={() =>
            startTransition(async () => {
              const result = await completeMvrSample({ driverId, completedOn, note })

              if (result.error) toast('error', result.error)
              else {
                toast('success', result.message || 'Recorded.')
                router.refresh()
              }
            })
          }
        >
          {pending ? 'Saving...' : 'Record Sampled MVR'}
        </Button>
      </div>
    </div>
  )
}

export default CompleteSampleForm
