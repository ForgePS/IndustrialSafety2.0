'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbArrowBackUp } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { setDocumentArchived } from '@/app/(back)/documents/actions'

/** Port slice 12: restore an archived document (Archived tab). */
const ArchivedRestoreButton = ({ documentId }: { documentId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size='sm'
      variant='outline'
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setDocumentArchived(documentId, false)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Restored.')
          router.refresh()
        })
      }
    >
      <TbArrowBackUp />
      Restore
    </Button>
  )
}

export default ArchivedRestoreButton
