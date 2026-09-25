'use client'

import { useTransition } from 'react'
import { TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'
import { deleteLotoComponent } from './actions'

const LotoComponentDeleteButton = ({
  procedureId,
  componentType,
  componentId,
  label
}: {
  procedureId: string
  componentType: 'energy_source' | 'step'
  componentId: string
  label: string
}) => {
  const [pending, startTransition] = useTransition()

  const remove = () => {
    if (!window.confirm('Remove ' + label + ' from this Draft procedure?')) return

    startTransition(async () => {
      const result = await deleteLotoComponent({
        procedureId,
        componentType,
        componentId
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to remove LOTO component.')
        return
      }

      toast('success', 'message' in result ? String(result.message) : 'Saved.')
      window.location.reload()
    })
  }

  return (
    <Button size='icon' variant='ghost' onClick={remove} disabled={pending} title={'Remove ' + label}>
      <TbTrash />
    </Button>
  )
}

export default LotoComponentDeleteButton
