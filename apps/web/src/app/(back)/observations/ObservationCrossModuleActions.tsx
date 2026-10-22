'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import {
  createCapaFromObservation,
  createRiskFromObservation
} from './actions'

const ObservationCrossModuleActions = ({
  observationId,
  canCreateCapa,
  canCreateRisk
}: {
  observationId: string
  canCreateCapa: boolean
  canCreateRisk: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canCreateCapa && !canCreateRisk) return null

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap gap-2'>
        {canCreateCapa ? (
          <Button
            type='button'
            variant='outline'
            disabled={pending}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await createCapaFromObservation(observationId)
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
        ) : null}
        {canCreateRisk ? (
          <Button
            type='button'
            variant='outline'
            disabled={pending}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await createRiskFromObservation(observationId)
                if (result && 'error' in result && result.error) {
                  setError(result.error)
                  return
                }
                if (result && 'ok' in result && result.ok && result.id) {
                  router.push('/risk-register/' + result.id)
                  router.refresh()
                }
              })
            }}
          >
            Create Risk
          </Button>
        ) : null}
      </div>
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
    </div>
  )
}

export default ObservationCrossModuleActions
