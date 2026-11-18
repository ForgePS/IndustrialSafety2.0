'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { createRiskFromIncident } from './actions'

const IncidentCrossModuleActions = ({
  incidentId,
  canCreateRisk
}: {
  incidentId: string
  canCreateRisk: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (!canCreateRisk) return null

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const result = await createRiskFromIncident(incidentId)
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
      </div>
      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
    </div>
  )
}

export default IncidentCrossModuleActions
