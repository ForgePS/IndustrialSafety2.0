'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { startMvrSample } from '../actions'

const MvrSampleButton = ({ year, drawn, anyDone }: { year: number; drawn: boolean; anyDone: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (drawn && anyDone) return null

  return (
    <Button
      variant={drawn ? 'outline' : 'default'}
      disabled={pending}
      onClick={() => {
        if (drawn && !window.confirm(`Redraw the ${year} sample? The current selection is replaced.`)) return
        startTransition(async () => {
          const result = await startMvrSample({ year, force: drawn })

          if (result.error) toast('error', result.error)
          else {
            toast('success', result.message || 'Sample drawn.')
            router.refresh()
          }
        })
      }}
    >
      {pending ? 'Drawing...' : drawn ? 'Redraw Sample' : `Draw ${year} Sample`}
    </Button>
  )
}

export default MvrSampleButton
