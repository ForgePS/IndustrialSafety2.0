'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { decideMoc } from '@/app/(back)/process-safety/actions'

/** Port slice 16: an approver approves or rejects a change. A rejection needs a reason. */
const DecisionForm = ({ mocId }: { mocId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [comment, setComment] = useState('')

  const decide = (decision: 'approved' | 'rejected') =>
    startTransition(async () => {
      const result = await decideMoc(mocId, { decision, comment })

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Saved.')
      setComment('')
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-2' data-decision-form>
      <label className='flex flex-col gap-1 text-sm font-medium'>
        Comment (needed to reject)
        <textarea
          name='comment'
          rows={2}
          maxLength={2000}
          value={comment}
          onChange={event => setComment(event.target.value)}
          className='bg-background rounded-md border px-3 py-2 text-sm'
        />
      </label>
      <div className='flex gap-2'>
        <Button type='button' disabled={pending} onClick={() => decide('approved')}>
          Approve
        </Button>
        <Button type='button' variant='destructive' disabled={pending} onClick={() => decide('rejected')}>
          Reject
        </Button>
      </div>
    </div>
  )
}

export default DecisionForm
