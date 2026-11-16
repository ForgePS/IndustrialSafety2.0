'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbArrowBackUp } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { restorePersonnel } from './actions'

const RestorePersonnelButton = ({ personnelId }: { personnelId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const restore = () => {
    startTransition(async () => {
      const result = await restorePersonnel(personnelId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to restore personnel record.')
        
return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  return (
    <Button onClick={restore} disabled={pending} data-testid='personnel-restore' aria-label='Restore to roster'>
      <TbArrowBackUp />
      {pending ? 'Restoring...' : 'Restore to roster'}
    </Button>
  )
}

export default RestorePersonnelButton
