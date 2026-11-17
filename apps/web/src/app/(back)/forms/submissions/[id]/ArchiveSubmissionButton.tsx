'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { archiveFormSubmission } from '../../submissionActions'

/** Archive with a second click to confirm. */
const ArchiveSubmissionButton = ({ submissionId }: { submissionId: string }) => {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!confirming) {
    return (
      <Button type='button' variant='outline' onClick={() => setConfirming(true)}>
        Archive
      </Button>
    )
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <span className='text-sm'>Archive this submission?</span>
      <Button
        type='button'
        variant='destructive'
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await archiveFormSubmission(submissionId)

            if (!result.ok) {
              toast('error', result.error)

              return
            }

            toast('success', 'Submission archived.')
            setConfirming(false)
            router.refresh()
          })
        }
      >
        Confirm archive
      </Button>
      <Button type='button' variant='ghost' disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  )
}

export default ArchiveSubmissionButton
