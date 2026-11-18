'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { cancelMaintenance, completeMaintenance } from '@/app/(back)/fleet/maintenance/actions'

/** Mark an open maintenance item complete (date, odometer, cost, notes). */
export const MaintenanceCompleteForm = ({ recordId, today, currentMileage, repeats }: { recordId: string; today: string; currentMileage: number | null; repeats: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState({ completedOn: today, completedMileage: '', cost: '', notes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const error = (key: string) => (errors[key] ? <p className='text-destructive mt-1 text-xs'>{errors[key]}</p> : null)

  return (
    <form
      className='flex flex-col gap-4'
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await completeMaintenance(recordId, values)

          setErrors(result.errors || {})
          if (result.errors) return void toast('error', 'Check the highlighted fields.')
          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Completed.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <div className='grid gap-4 md:grid-cols-3'>
          <div>
            <Label htmlFor='fm-completed-on'>Completed on</Label>
            <Input id='fm-completed-on' className='mt-1' type='date' max={today} value={values.completedOn} onChange={set('completedOn')} />
            {error('completedOn')}
          </div>
          <div>
            <Label htmlFor='fm-completed-mileage'>Odometer</Label>
            <Input
              id='fm-completed-mileage'
              className='mt-1'
              inputMode='numeric'
              value={values.completedMileage}
              onChange={set('completedMileage')}
              placeholder={currentMileage != null ? `Now ${currentMileage.toLocaleString('en-US')}` : 'Miles'}
            />
            {error('completedMileage')}
          </div>
          <div>
            <Label htmlFor='fm-completed-cost'>Final cost ($)</Label>
            <Input id='fm-completed-cost' className='mt-1' inputMode='decimal' value={values.cost} onChange={set('cost')} placeholder='0.00' />
            {error('cost')}
          </div>
        </div>
        <div>
          <Label htmlFor='fm-completed-notes'>Work done</Label>
          <Textarea id='fm-completed-notes' className='mt-1' rows={2} maxLength={4000} value={values.notes} onChange={set('notes')} />
        </div>
        <p className='text-textSecondary text-xs'>
          An odometer at or above the vehicle&apos;s current mileage also updates the vehicle.
          {repeats ? ' This job repeats, so the next one is scheduled when you complete it.' : ''}
        </p>
        <div>
          <Button type='submit'>{pending ? 'Saving...' : 'Mark Complete'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

/** Cancel an open maintenance item with a reason. */
export const MaintenanceCancelForm = ({ recordId }: { recordId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (!open)
    return (
      <Button type='button' variant='outline' onClick={() => setOpen(true)}>
        Cancel This Item
      </Button>
    )

  return (
    <form
      className='flex flex-col gap-3'
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await cancelMaintenance(recordId, reason)

          setError(result.errors?.reason || '')
          if (result.errors) return
          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Canceled.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-3'>
        <div>
          <Label htmlFor='fm-cancel-reason'>Why is it canceled?</Label>
          <Input id='fm-cancel-reason' className='mt-1' maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
          {error ? <p className='text-destructive mt-1 text-xs'>{error}</p> : null}
        </div>
        <div className='flex gap-2'>
          <Button type='submit' variant='destructive'>
            {pending ? 'Saving...' : 'Confirm Cancel'}
          </Button>
          <Button type='button' variant='outline' onClick={() => setOpen(false)}>
            Keep It
          </Button>
        </div>
      </fieldset>
    </form>
  )
}
