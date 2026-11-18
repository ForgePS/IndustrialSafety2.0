'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import {
  createAssetLinkFromJsa,
  createCapaFromJsa,
  createRiskFromJsa
} from './actions'

const JsaCrossModuleActions = ({
  jsaId,
  canCreateCapa,
  canCreateRisk,
  canLinkAsset
}: {
  jsaId: string
  canCreateCapa: boolean
  canCreateRisk?: boolean
  canLinkAsset?: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [assetId, setAssetId] = useState('')

  if (!canCreateCapa && !canCreateRisk && !canLinkAsset) return null

  return (
    <div className='flex flex-col gap-3'>
      {canCreateCapa ? (
        <Button
          type='button'
          variant='outline'
          disabled={pending}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const result = await createCapaFromJsa(jsaId)
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
              const result = await createRiskFromJsa(jsaId)
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

      {canLinkAsset ? (
        <div className='grid gap-2'>
          <Label htmlFor='jsa-asset-id'>Link asset (UUID)</Label>
          <div className='flex flex-wrap gap-2'>
            <Input
              id='jsa-asset-id'
              value={assetId}
              onChange={event => setAssetId(event.target.value)}
              disabled={pending}
              placeholder='Asset id'
            />
            <Button
              type='button'
              variant='outline'
              disabled={pending || !assetId.trim()}
              onClick={() => {
                setError(null)
                startTransition(async () => {
                  const result = await createAssetLinkFromJsa({ jsaId, assetId })
                  if (result && 'error' in result && result.error) {
                    setError(result.error)
                    return
                  }
                  setAssetId('')
                  router.refresh()
                })
              }}
            >
              Link asset
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}
    </div>
  )
}

export default JsaCrossModuleActions
