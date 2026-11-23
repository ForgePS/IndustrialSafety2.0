'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { toast } from '@repo/ui/utils/toast'

import { addAreaEquipment, removeAreaEquipment } from '@/app/(back)/waypoint/actions'

const STATUS: Record<string, string> = {
  active: 'In service',
  out_of_service: 'Out of service',
  maintenance: 'In maintenance',
  reserved: 'Reserved'
}

const selectClass = 'border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3 disabled:opacity-60'

/** Forge Waypoint: the equipment placed in an area, with add / remove for people who manage areas. */
const AreaEquipmentPanel = ({
  areaId,
  equipment,
  assignable,
  canManage
}: {
  areaId: string
  equipment: { id: string; name: string; assetNumber: string | null; status: string; lockedOut: boolean }[]
  assignable: { id: string; label: string }[]
  canManage: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState('')

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await action()

      if (!result.ok) {
        toast('error', result.error || 'Something went wrong.')

        return
      }

      toast('success', result.message || 'Saved.')
      setSelected('')
      router.refresh()
    })

  return (
    <Card data-testid='area-equipment-panel'>
      <CardHeader>
        <CardTitle>Equipment in this area</CardTitle>
        <CardDescription>
          Lockouts, out-of-service status and open issues on this equipment drive the Area Card status light.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {equipment.length ? (
          <ul className='divide-y'>
            {equipment.map(item => (
              <li
                key={item.id}
                className='flex flex-wrap items-center justify-between gap-3 py-2 text-sm'
                data-area-equipment-row={item.id}
              >
                <Link href={'/assets/' + item.id} className='text-primary font-medium hover:underline'>
                  {item.assetNumber ? item.assetNumber + ' · ' : ''}
                  {item.name}
                </Link>
                <span className='flex items-center gap-3'>
                  <span
                    className={
                      'rounded px-2 py-0.5 text-xs font-bold ' +
                      (item.lockedOut || item.status === 'out_of_service' ? 'bg-red-600 text-white' : 'bg-muted')
                    }
                  >
                    {item.lockedOut ? 'Locked out' : STATUS[item.status] || item.status}
                  </span>
                  {canManage ? (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={pending}
                      onClick={() => run(() => removeAreaEquipment(areaId, item.id))}
                    >
                      Remove
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-textSecondary text-sm'>No equipment has been placed in this area.</p>
        )}

        {canManage ? (
          assignable.length ? (
            <div className='flex flex-col gap-2 sm:flex-row'>
              <select
                aria-label='Equipment to add'
                className={selectClass}
                value={selected}
                disabled={pending}
                onChange={event => setSelected(event.target.value)}
              >
                <option value=''>Add equipment at this location...</option>
                {assignable.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button disabled={pending || !selected} onClick={() => run(() => addAreaEquipment(areaId, [selected]))}>
                Add
              </Button>
            </div>
          ) : (
            <p className='text-textSecondary text-sm'>All equipment at this location is already in an area.</p>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

export default AreaEquipmentPanel
