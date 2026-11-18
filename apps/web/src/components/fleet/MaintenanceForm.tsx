'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { createMaintenance, updateMaintenance } from '@/app/(back)/fleet/maintenance/actions'
import { COMMON_MAINTENANCE_ITEMS, MAINTENANCE_TYPES, MAINTENANCE_TYPE_LABELS } from '@/lib/forgeFleetRules'

export type MaintenanceFormValues = {
  vehicleId: string
  title: string
  maintenanceType: string
  dueOn: string
  dueMileage: string
  vendor: string
  cost: string
  repeatDays: string
  repeatMiles: string
  notes: string
}

const PRESET_TYPES: Record<string, string> = {
  'Tire rotation': 'tires',
  'Annual DOT inspection': 'annual_inspection',
  'Registration renewal': 'other'
}

const SELECT = 'border-input bg-card h-[38px] w-full rounded-md border px-3 text-sm'

/** New or edit form for a maintenance item. With recordId it edits; otherwise it creates and opens the new item. */
const MaintenanceForm = ({
  initial,
  vehicles,
  recordId = null
}: {
  initial: MaintenanceFormValues
  vehicles?: Array<{ id: string; name: string; mileage: number | null }>
  recordId?: string | null
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (key: keyof MaintenanceFormValues) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))
  const vehicle = vehicles?.find(item => item.id === values.vehicleId)

  const error = (key: string) =>
    errors[key] ? (
      <p className='text-destructive mt-1 text-xs' data-error={key}>
        {errors[key]}
      </p>
    ) : null

  const submit = () =>
    startTransition(async () => {
      const result = recordId ? await updateMaintenance(recordId, values) : await createMaintenance(values)

      setErrors(result.errors || {})
      if (result.errors) return void toast('error', 'Check the highlighted fields.')
      if (result.error) return void toast('error', result.error)

      toast('success', result.message || 'Saved.')
      if (!recordId && result.id) router.push(`/fleet/maintenance/${result.id}`)
      else router.refresh()
    })

  return (
    <form
      className='flex flex-col gap-5'
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-5'>
        {vehicles ? (
          <div>
            <Label htmlFor='fm-vehicle'>Vehicle</Label>
            <select id='fm-vehicle' className={SELECT + ' mt-1'} value={values.vehicleId} onChange={set('vehicleId')}>
              <option value=''>Choose a vehicle</option>
              {vehicles.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {vehicle?.mileage != null ? <p className='text-textSecondary mt-1 text-xs'>Current odometer: {vehicle.mileage.toLocaleString('en-US')} miles</p> : null}
            {error('vehicleId')}
          </div>
        ) : null}

        <div>
          <Label htmlFor='fm-title'>What needs to be done</Label>
          {!recordId ? (
            <div className='mt-1 mb-2 flex flex-wrap gap-1'>
              {COMMON_MAINTENANCE_ITEMS.map(item => (
                <button
                  key={item}
                  type='button'
                  data-preset={item}
                  className={'rounded-full border px-3 py-0.5 text-xs ' + (values.title === item ? 'border-primary text-primary' : 'text-textSecondary')}
                  onClick={() => setValues(current => ({ ...current, title: item, maintenanceType: PRESET_TYPES[item] || 'pm' }))}
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          <Input id='fm-title' className='mt-1' maxLength={200} value={values.title} onChange={set('title')} placeholder='For example: Oil and filter change' />
          {error('title')}
        </div>

        <div className='grid gap-4 md:grid-cols-3'>
          <div>
            <Label htmlFor='fm-type'>Type</Label>
            <select id='fm-type' className={SELECT + ' mt-1'} value={values.maintenanceType} onChange={set('maintenanceType')}>
              {MAINTENANCE_TYPES.map(type => (
                <option key={type} value={type}>
                  {MAINTENANCE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            {error('maintenanceType')}
          </div>
          <div>
            <Label htmlFor='fm-due-on'>Due date</Label>
            <Input id='fm-due-on' className='mt-1' type='date' value={values.dueOn} onChange={set('dueOn')} />
            {error('dueOn')}
          </div>
          <div>
            <Label htmlFor='fm-due-mileage'>Due at mileage</Label>
            <Input id='fm-due-mileage' className='mt-1' inputMode='numeric' value={values.dueMileage} onChange={set('dueMileage')} placeholder='Miles' />
            {error('dueMileage')}
          </div>
        </div>
        <p className='text-textSecondary -mt-3 text-xs'>Set a date, a mileage or both. The item is due at whichever comes first.</p>

        <div className='grid gap-4 md:grid-cols-2'>
          <div>
            <Label htmlFor='fm-vendor'>Vendor or shop</Label>
            <Input id='fm-vendor' className='mt-1' maxLength={200} value={values.vendor} onChange={set('vendor')} />
          </div>
          <div>
            <Label htmlFor='fm-cost'>Estimated cost ($)</Label>
            <Input id='fm-cost' className='mt-1' inputMode='decimal' value={values.cost} onChange={set('cost')} placeholder='0.00' />
            {error('cost')}
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <div>
            <Label htmlFor='fm-repeat-days'>Repeat every (days)</Label>
            <Input id='fm-repeat-days' className='mt-1' inputMode='numeric' value={values.repeatDays} onChange={set('repeatDays')} placeholder='For example 90' />
            {error('repeatDays')}
          </div>
          <div>
            <Label htmlFor='fm-repeat-miles'>Repeat every (miles)</Label>
            <Input id='fm-repeat-miles' className='mt-1' inputMode='numeric' value={values.repeatMiles} onChange={set('repeatMiles')} placeholder='For example 5000' />
            {error('repeatMiles')}
          </div>
        </div>
        <p className='text-textSecondary -mt-3 text-xs'>When a repeating item is completed, the next one is scheduled from the completed date and odometer.</p>

        <div>
          <Label htmlFor='fm-notes'>Notes</Label>
          <Textarea id='fm-notes' className='mt-1' rows={3} maxLength={4000} value={values.notes} onChange={set('notes')} />
        </div>

        <div>
          <Button type='submit'>{pending ? 'Saving...' : recordId ? 'Save Changes' : 'Schedule Maintenance'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default MaintenanceForm
