'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { updateDotRecord } from '../../actions'

const RecordStatusButton = ({ recordId, status }: { recordId: string; status: 'open' | 'closed' }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const next = status === 'open' ? 'closed' : 'open'

  return (
    <Button
      variant={next === 'closed' ? 'default' : 'outline'}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await updateDotRecord({ recordId, status: next })

          if (result.error) toast('error', result.error)
          else {
            toast('success', result.message || 'Saved.')
            router.refresh()
          }
        })
      }
    >
      {next === 'closed' ? 'Close Record' : 'Reopen Record'}
    </Button>
  )
}

export default RecordStatusButton
