'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'
import {
  cloneCoreRiskMatrixAction,
  ensureTenantDefaultRiskMatrixAction
} from '../actions'

export const CloneCoreMatrixButton = ({
  hasTenantDefault
}: {
  hasTenantDefault: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    startTransition(async () => {
      const result = hasTenantDefault
        ? await cloneCoreRiskMatrixAction()
        : await ensureTenantDefaultRiskMatrixAction()

      if ('error' in result) {
        toast('error', result.error)
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  return (
    <Button onClick={onClick} disabled={pending}>
      {pending
        ? 'Cloning...'
        : hasTenantDefault
          ? 'Clone Core Matrix Again'
          : 'Clone Core → Tenant Default'}
    </Button>
  )
}
