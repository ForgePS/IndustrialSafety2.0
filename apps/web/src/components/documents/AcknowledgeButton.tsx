'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbCircleCheck } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { acknowledgeDocument } from '@/app/(back)/documents/workflowActions'

/**
 * Port slice 12: "I have read and understood this document" for the current published version. Shows a
 * confirmation once acknowledged. The server action checks the version is still current and distributed to you.
 */
const AcknowledgeButton = ({ documentId, versionId, acknowledged }: { documentId: string; versionId: string; acknowledged: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(acknowledged)

  if (done) {
    return (
      <span className='text-success inline-flex items-center gap-1 text-sm font-medium' data-testid='acknowledged'>
        <TbCircleCheck /> Acknowledged
      </span>
    )
  }

  return (
    <Button
      size='sm'
      disabled={pending}
      data-testid='acknowledge-document'
      onClick={() =>
        startTransition(async () => {
          const result = await acknowledgeDocument({ documentId, versionId })

          if (result.error) {
            toast('error', result.error)
            router.refresh()

            return
          }

          toast('success', result.message || 'Acknowledged.')
          setDone(true)
          router.refresh()
        })
      }
    >
      I have read this
    </Button>
  )
}

export default AcknowledgeButton
