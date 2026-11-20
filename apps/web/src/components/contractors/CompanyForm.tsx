'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveCompany } from '@/app/(back)/contractors/actions'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Values = Record<string, string>

/** Port slice 15: add or edit a contractor company (contact, sponsor, the sites it may work at, safety rates). */
const CompanyForm = ({
  initial,
  initialLocations,
  id,
  locations,
  members,
  anywhereAllowed
}: {
  initial: Values
  initialLocations: string[]
  id?: string
  locations: { id: string; name: string }[]
  members: { id: string; name: string }[]
  anywhereAllowed: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(initial)
  const [locationIds, setLocationIds] = useState<string[]>(initialLocations)
  const set = (key: string) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const text = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={key} value={values[key] || ''} onChange={set(key)} className={field} {...props} />
    </label>
  )

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-contractor-company-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveCompany({ ...values, locationIds, id })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/contractors/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <div className='grid gap-4 md:grid-cols-2'>
          {text('name', 'Company name', { required: true, maxLength: 200 })}
          {text('trade', 'Trade', { maxLength: 120, placeholder: 'Electrical, roofing, HVAC...' })}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {text('contactName', 'Contact', { maxLength: 120 })}
          {text('contactEmail', 'Contact email', { type: 'email', maxLength: 254 })}
          {text('contactPhone', 'Contact phone', { maxLength: 40 })}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Sponsor
            <select name='sponsorUserId' value={values.sponsorUserId || ''} onChange={set('sponsorUserId')} className={field}>
              <option value=''>None</option>
              {members.map(member => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          {text('emr', 'EMR', { type: 'number', step: '0.01', min: 0, max: 10 })}
          {text('trir', 'TRIR', { type: 'number', step: '0.01', min: 0, max: 100 })}
        </div>
        <fieldset className='flex flex-col gap-2'>
          <legend className='text-sm font-medium'>Sites it may work at</legend>
          <p className='text-textSecondary text-xs'>{anywhereAllowed ? 'Leave all unticked to allow any site.' : 'Pick at least one of your locations.'}</p>
          <div className='grid gap-1 md:grid-cols-3'>
            {locations.map(location => (
              <label key={location.id} className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  name='locationIds'
                  value={location.id}
                  checked={locationIds.includes(location.id)}
                  onChange={event => setLocationIds(current => (event.target.checked ? [...current, location.id] : current.filter(item => item !== location.id)))}
                />
                {location.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Notes
          <textarea name='notes' rows={4} maxLength={5000} value={values.notes || ''} onChange={set('notes')} className={field} />
        </label>
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

export default CompanyForm
