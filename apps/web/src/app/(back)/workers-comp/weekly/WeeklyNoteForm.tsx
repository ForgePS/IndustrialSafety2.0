'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { saveWeeklyUpdate } from '../actions'

const WeeklyNoteForm = ({ caseId, caseNumber, weekOf, initialNotes }: { caseId: string; caseNumber: string; weekOf: string; initialNotes: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState(initialNotes)

  const save = () =>
    startTransition(async () => {
      const result = await saveWeeklyUpdate({ caseId, weekOf, notes })

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-2'>
      <Textarea aria-label={`Weekly update for ${caseNumber}`} rows={2} value={notes} disabled={pending} onChange={event => setNotes(event.target.value)} />
      <div><Button size='sm' disabled={pending || !notes.trim()} onClick={save}>Save</Button></div>
    </div>
  )
}

export default WeeklyNoteForm
