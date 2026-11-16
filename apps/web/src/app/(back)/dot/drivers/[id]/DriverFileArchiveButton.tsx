'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { archiveDriverFile } from '../../actions'

const DriverFileArchiveButton = ({ fileId, archived }: { fileId: string; archived: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant='outline'
      disabled={pending}
      onClick={() => {
        if (!archived && !window.confirm('Archive this driver file? The person will no longer be marked as a DOT driver.')) return
        startTransition(async () => {
          const result = await archiveDriverFile({ fileId, restore: archived })

          if (result.error) toast('error', result.error)
          else {
            toast('success', result.message || 'Done.')
            router.refresh()
          }
        })
      }}
    >
      {archived ? 'Restore File' : 'Archive File'}
    </Button>
  )
}

export default DriverFileArchiveButton
