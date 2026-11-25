'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { createTruck, updateTruck } from '@/app/(back)/forklifts/actions'
import type { TruckValues } from '@/app/(back)/forklifts/actions'
import { DESIGNATIONS, POWER_SOURCE_LABELS, POWER_SOURCES, powerClassProblem, TRUCK_CLASS_INFO, TRUCK_CLASSES, TRUCK_TYPES, TYPICAL_CLASS } from '@/lib/forgeForkliftRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Option = { id: string; name: string }

/**
 * Port slice 19: add a forklift (new equipment, or a profile on existing equipment) or edit one. `mode` 'new' and
 * 'edit' show the equipment fields; 'existing' asks which equipment record to set up instead.
 */
const TruckForm = ({
  mode,
  forkliftId,
  initial,
  locations,
  assets = []
}: {
  mode: 'new' | 'existing' | 'edit'
  forkliftId?: string
  initial: Required<TruckValues>
  locations: Option[]
  assets?: Option[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Required<TruckValues>>(initial)
  const set = (key: keyof TruckValues) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))
  const mismatch = values.truck_class && values.power_source ? powerClassProblem(values.truck_class, values.power_source) : null

  const input = (key: keyof TruckValues, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={key} value={values[key] || ''} onChange={set(key)} className={field} {...props} />
    </label>
  )

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-truck-form={mode}
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = mode === 'edit' ? await updateTruck(forkliftId as string, values) : await createTruck(mode === 'existing' ? values : { ...values, asset_id: '' })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/forklifts/trucks/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        {mode === 'existing' ? (
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Equipment
            <select name='asset_id' required value={values.asset_id} onChange={set('asset_id')} className={field}>
              <option value=''>Pick the equipment record</option>
              {assets.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {!assets.length ? <span className='text-textSecondary text-xs font-normal'>All your equipment is already set up, retired, or outside your locations.</span> : null}
          </label>
        ) : (
          <>
            <div className='grid gap-4 md:grid-cols-2'>
              {input('name', 'Name or unit number', { required: true, maxLength: 200 })}
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Location
                <select name='location_id' required value={values.location_id} onChange={set('location_id')} className={field}>
                  <option value=''>Pick one</option>
                  {locations.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className='grid gap-4 md:grid-cols-3'>
              {input('manufacturer', 'Manufacturer', { maxLength: 200 })}
              {input('model', 'Model', { maxLength: 200 })}
              {input('serial_number', 'Serial number', { maxLength: 200 })}
            </div>
          </>
        )}

        <div className='grid gap-4 md:grid-cols-3'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Type of truck
            <select
              name='truck_type'
              required
              value={values.truck_type}
              onChange={event => {
                const type = event.target.value
                const typical = TYPICAL_CLASS[type]

                setValues(current => ({
                  ...current,
                  truck_type: type,
                  truck_class: typical || current.truck_class,
                  power_source: typical && ['I', 'II', 'III'].includes(typical) ? 'electric' : current.power_source
                }))
              }}
              className={field}
            >
              <option value=''>Pick one</option>
              {Object.entries(TRUCK_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Truck class
            <select name='truck_class' required value={values.truck_class} onChange={set('truck_class')} className={field}>
              <option value=''>Pick one</option>
              {TRUCK_CLASSES.map(value => (
                <option key={value} value={value}>
                  {TRUCK_CLASS_INFO[value].label}: {TRUCK_CLASS_INFO[value].description}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Power source
            <select name='power_source' required value={values.power_source} onChange={set('power_source')} className={field}>
              <option value=''>Pick one</option>
              {POWER_SOURCES.map(value => (
                <option key={value} value={value}>
                  {POWER_SOURCE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mismatch ? (
          <p className='text-error text-sm' data-truck-mismatch>
            {mismatch}
          </p>
        ) : null}

        <div className='grid gap-4 md:grid-cols-3'>
          {input('rated_capacity_lb', 'Rated capacity (lb)', { type: 'number', min: 100, max: 200000, step: 1 })}
          {input('load_center_in', 'Load center (in)', { type: 'number', min: 1, max: 120, step: 0.1 })}
          {input('max_lift_height_in', 'Maximum lift height (in)', { type: 'number', min: 1, max: 1500, step: 0.1 })}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          <label className='flex flex-col gap-1 text-sm font-medium md:col-span-2'>
            Attachments
            <input name='attachments' maxLength={500} value={values.attachments} onChange={set('attachments')} placeholder='Side shifter, fork positioner, clamp...' className={field} />
          </label>
          {input('nameplate_verified_on', 'Nameplate checked on', { type: 'date' })}
        </div>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Type designation (where it may be used)
          <select name='designation' value={values.designation} onChange={set('designation')} className={field}>
            <option value=''>Not recorded</option>
            {Object.entries(DESIGNATIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Notes
          <textarea name='notes' rows={3} maxLength={4000} value={values.notes} onChange={set('notes')} className={field} />
        </label>
        <div className='flex gap-2'>
          <Button type='submit'>{pending ? 'Saving...' : mode === 'edit' ? 'Save' : mode === 'existing' ? 'Set up as a forklift' : 'Add forklift'}</Button>
          <Button type='button' variant='outline' onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default TruckForm
