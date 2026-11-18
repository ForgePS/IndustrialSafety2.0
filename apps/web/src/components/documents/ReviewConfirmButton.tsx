'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { confirmDocumentReview } from '@/app/(back)/documents/actions'

/**
 * Port slice 12: Confirm review on the Reviews page: the document was checked and needs no changes, so the
 * next review date moves on by its review interval. An optional note goes into the history.
 */
const ReviewConfirmButton = ({ documentId }: { documentId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (!open) {
    return (
      <Button size='sm' variant='outline' onClick={() => setOpen(true)} data-testid='review-confirm'>
        Confirm review
      </Button>
    )
  }

  return (
    <div className='flex flex-col gap-2' data-testid='review-confirm-form'>
      <textarea
        aria-label='Review note (optional)'
        placeholder='Note (optional)'
        className='border-input bg-card min-h-14 w-full rounded-md border p-2 text-sm'
        value={note}
        maxLength={2000}
        onChange={event => setNote(event.target.value)}
      />
      <div className='flex gap-2'>
        <Button
          size='sm'
          disabled={pending}
          data-testid='review-confirm-save'
          onClick={() =>
            startTransition(async () => {
              const result = await confirmDocumentReview(documentId, note)

              if (result.error) {
                toast('error', result.error)

                return
              }

              toast('success', result.message || 'Review confirmed.')
              setOpen(false)
              setNote('')
              router.refresh()
            })
          }
        >
          Confirm, no changes
        </Button>
        <Button size='sm' variant='outline' disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export default ReviewConfirmButton
