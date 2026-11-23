'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveSpace } from '@/app/(back)/permits/actions'
import type { SpaceInput } from '@/app/(back)/permits/actions'
import { SPACE_HAZARDS } from '@/lib/forgePermitRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** Port slice 18: add or edit a confined space in the register. */
const SpaceForm = ({ spaceId, initial, locations }: { spaceId?: string; initial: Required<SpaceInput>; locations: { id: string; name: string }[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Required<SpaceInput>>(initial)
  const set = (key: keyof SpaceInput) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const input = (key: keyof SpaceInput, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={key} value={(values[key] as string) || ''} onChange={set(key)} className={field} {...props} />
    </label>
  )

  const area = (key: keyof SpaceInput, label: string) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <textarea name={key} rows={3} maxLength={5000} value={(values[key] as string) || ''} onChange={set(key)} className={field} />
    </label>
  )

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-space-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveSpace(spaceId || null, values)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/permits/confined-space/spaces/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <div className='grid gap-4 md:grid-cols-3'>
          {input('name', 'Name', { required: true, maxLength: 200 })}
          {input('spaceCode', 'Code (optional)', { maxLength: 40 })}
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Location
            <select name='locationId' required value={values.locationId} onChange={set('locationId')} className={field}>
              <option value=''>Pick one</option>
              {locations.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className='flex items-center gap-2 text-sm font-medium'>
          <input type='checkbox' name='permitRequired' checked={values.permitRequired} onChange={event => setValues(current => ({ ...current, permitRequired: event.target.checked }))} />
          Permit-required confined space (entry needs a permit)
        </label>
        <fieldset className='flex flex-col gap-2'>
          <legend className='text-sm font-medium'>Hazards</legend>
          <div className='grid gap-2 md:grid-cols-2'>
            {Object.entries(SPACE_HAZARDS).map(([value, label]) => (
              <label key={value} className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  name='hazards'
                  value={value}
                  checked={values.hazards.includes(value)}
                  onChange={event =>
                    setValues(current => ({ ...current, hazards: event.target.checked ? [...current.hazards, value] : current.hazards.filter(item => item !== value) }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {area('description', 'Description')}
        {area('entryPoints', 'Entry points')}
        {area('isolationNotes', 'Isolation (energy, lines, blanking)')}
        {area('rescuePlan', 'Rescue plan')}
        {input('lastEvaluatedOn', 'Last evaluated', { type: 'date' })}
        <div className='flex gap-2'>
          <Button type='submit'>{pending ? 'Saving...' : 'Save'}</Button>
          <Button type='button' variant='outline' onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  )
}

export default SpaceForm
