'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbArrowDown, TbArrowUp, TbEdit } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import type { LotoFormValues } from './actions'
import { moveLotoComponent } from './content-actions'
import LotoComponentDeleteButton from './LotoComponentDeleteButton'
import LotoSubrecordForm from './LotoSubrecordForm'

/** An energy source or step with move, edit and delete controls while the procedure is editable. */
const LotoEditableItem = ({
  procedureId,
  componentType,
  componentId,
  label,
  form,
  values,
  isFirst,
  isLast,
  children
}: {
  procedureId: string
  componentType: 'energy_source' | 'step'
  componentId: string
  label: string
  form: any
  values: LotoFormValues
  isFirst: boolean
  isLast: boolean
  children: React.ReactNode
}) => {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  const move = (direction: 'up' | 'down') =>
    startTransition(async () => {
      const result = await moveLotoComponent({ procedureId, componentType, componentId, direction })

      if (result.error) toast('error', result.error)
      else router.refresh()
    })

  if (editing && form) {
    return (
      <LotoSubrecordForm
        procedureId={procedureId}
        form={form}
        mode={componentType === 'energy_source' ? 'energy' : 'step'}
        componentId={componentId}
        initialValues={values}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className='flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-start'>
      <div className='min-w-0 flex-1'>{children}</div>
      <div className='flex shrink-0 flex-wrap gap-1'>
        <Button size='sm' variant='outline' aria-label={'Move up: ' + label} disabled={pending || isFirst} onClick={() => move('up')}>
          <TbArrowUp />
        </Button>
        <Button size='sm' variant='outline' aria-label={'Move down: ' + label} disabled={pending || isLast} onClick={() => move('down')}>
          <TbArrowDown />
        </Button>
        <Button size='sm' variant='outline' disabled={pending} onClick={() => setEditing(true)}>
          <TbEdit />Edit
        </Button>
        <LotoComponentDeleteButton procedureId={procedureId} componentType={componentType} componentId={componentId} label={label} />
      </div>
    </div>
  )
}

export default LotoEditableItem
