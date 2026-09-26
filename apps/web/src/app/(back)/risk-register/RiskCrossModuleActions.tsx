'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { createCapaFromRisk } from './actions'

const RiskCrossModuleActions = ({
  riskId,
  canCreateCapa
}: {
  riskId: string
  canCreateCapa: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canCreateCapa) return null

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        variant='outline'
        disabled={pending}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await createCapaFromRisk(riskId)
            if (result && 'error' in result && result.error) {
              setError(result.error)
              return
            }
            if (result && 'ok' in result && result.ok && result.id) {
              router.push('/corrective-actions/' + result.id)
              router.refresh()
            }
          })
        }}
      >
        Create Corrective Action
      </Button>
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
    </div>
  )
}

export default RiskCrossModuleActions
