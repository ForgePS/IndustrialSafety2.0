'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { deleteSavedReport } from '@/app/(back)/reporting/actions'

/** Port slice 13: delete a saved report (and its schedule). The run history keeps its rows. */
const DeleteSavedReportButton = ({ id, name }: { id: string; name: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type='button'
      variant='outline'
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete "${name}"? Its schedule stops too.`)) return
        startTransition(async () => {
          const result = await deleteSavedReport(id)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Deleted.')
          router.push('/reporting/saved')
        })
      }}
    >
      Delete
    </Button>
  )
}

export default DeleteSavedReportButton
