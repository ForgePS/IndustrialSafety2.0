'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'
import { linkIncidentAsset, unlinkIncidentAsset } from './assetActions'

export type LinkedEquipment = {
  linkId: string
  assetId: string
  assetNumber: string
  name: string
  status: string
  condition: string
}

const IncidentEquipment = ({
  incidentId,
  equipment,
  canEdit
}: {
  incidentId: string
  equipment: LinkedEquipment[]
  canEdit: boolean
}) => {
  const router = useRouter()
  const [assetNumber, setAssetNumber] = useState('')
  const [pending, startTransition] = useTransition()

  const add = () => startTransition(async () => {
    const result = await linkIncidentAsset({ incidentId, assetNumber })
    if ('error' in result) return toast('error', result.error || 'Unable to update equipment links.')
    setAssetNumber('')
    toast('success', result.message || 'Equipment updated.')
    router.refresh()
  })

  const remove = (linkId: string, number: string) => startTransition(async () => {
    if (!window.confirm('Remove ' + number + ' from this incident? The activity history will remain.')) return
    const result = await unlinkIncidentAsset({ incidentId, linkId })
    if ('error' in result) return toast('error', result.error || 'Unable to update equipment links.')
    toast('success', result.message || 'Equipment updated.')
    router.refresh()
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Related Equipment</CardTitle>
        <CardDescription>Link existing Forge assets involved in this incident. Equipment history remains on the asset record.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {equipment.length ? equipment.map(item => (
          <div key={item.linkId} className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
            <div>
              <Link className='text-primary font-semibold hover:underline' href={'/assets/' + item.assetId}>
                {item.assetNumber} · {item.name}
              </Link>
              <div className='text-textSecondary text-sm'>Status: {item.status.replaceAll('_', ' ')} · Condition: {item.condition.replaceAll('_', ' ')}</div>
            </div>
            {canEdit ? <Button variant='outline' disabled={pending} onClick={() => remove(item.linkId, item.assetNumber)}>Remove</Button> : null}
          </div>
        )) : <p className='text-textSecondary text-sm'>No equipment linked yet.</p>}
        {canEdit ? (
          <div className='flex flex-col gap-2 border-t pt-4'>
            <Label htmlFor='incident-asset-number'>Forge asset number</Label>
            <div className='flex flex-wrap gap-2'>
              <Input id='incident-asset-number' className='max-w-xs' value={assetNumber}
                placeholder='AST-000001' maxLength={64} disabled={pending}
                onChange={event => setAssetNumber(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') add() }} />
              <Button disabled={pending || !assetNumber.trim()} onClick={add}>{pending ? 'Linking...' : 'Link Equipment'}</Button>
            </div>
            <p className='text-textSecondary text-xs'>Enter the number shown on the equipment record. You can link assets within your access scope.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default IncidentEquipment
