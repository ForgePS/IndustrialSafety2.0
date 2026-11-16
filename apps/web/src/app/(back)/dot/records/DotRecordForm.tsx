'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { createDotRecord, updateDotRecord, type DotRecordValues } from '../actions'

export const EMPTY_DOT_RECORD: DotRecordValues = {
  category: 'roadside_inspection',
  title: '',
  record_date: '',
  personnel_id: '',
  location_id: '',
  description: '',
  outcome: ''
}

const SELECT = 'border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3'

const DotRecordForm = ({
  recordId,
  initial,
  categories,
  people,
  locations,
  allowNoDriver,
  canEdit
}: {
  recordId?: string
  initial: DotRecordValues
  categories: Record<string, string>
  people: Array<{ id: string; name: string; driver: boolean }>
  locations: Array<{ id: string; name: string }>
  allowNoDriver: boolean
  canEdit: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const set = (key: keyof DotRecordValues, value: string) => setValues(current => ({ ...current, [key]: value }))
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <fieldset disabled={!canEdit || pending} className='flex flex-col gap-4'>
      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          <Label htmlFor='dot-record-category'>Category</Label>
          <select id='dot-record-category' className={SELECT} value={values.category} onChange={event => set('category', event.target.value)}>
            {Object.entries(categories).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor='dot-record-date'>Date</Label>
          <Input id='dot-record-date' className='mt-1' type='date' max={today} value={values.record_date} onChange={event => set('record_date', event.target.value)} />
        </div>
        <div className='md:col-span-2'>
          <Label htmlFor='dot-record-title'>Title</Label>
          <Input id='dot-record-title' className='mt-1' value={values.title} maxLength={200} onChange={event => set('title', event.target.value)} />
        </div>
        <div>
          <Label htmlFor='dot-record-driver'>Driver</Label>
          <select id='dot-record-driver' className={SELECT} value={values.personnel_id} onChange={event => set('personnel_id', event.target.value)}>
            <option value=''>{allowNoDriver ? 'No specific driver' : 'Pick a driver...'}</option>
            {people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.driver ? '' : ' (not a DOT driver)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor='dot-record-location'>Location</Label>
          <select id='dot-record-location' className={SELECT} value={values.location_id} onChange={event => set('location_id', event.target.value)}>
            <option value=''>None</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor='dot-record-description'>What happened</Label>
        <Textarea id='dot-record-description' className='mt-1' rows={4} value={values.description} onChange={event => set('description', event.target.value)} />
      </div>
      <div>
        <Label htmlFor='dot-record-outcome'>Outcome</Label>
        <Textarea id='dot-record-outcome' className='mt-1' rows={2} value={values.outcome} onChange={event => set('outcome', event.target.value)} />
      </div>
      {canEdit ? (
        <div>
          <Button
            disabled={!dirty || !values.title.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = recordId ? await updateDotRecord({ recordId, values }) : await createDotRecord({ values })

                if (result.error) toast('error', result.error)
                else if (!recordId && result.id) router.push('/dot/records/' + result.id)
                else {
                  toast('success', result.message || 'Saved.')
                  router.refresh()
                }
              })
            }
          >
            {pending ? 'Saving...' : recordId ? 'Save Record' : 'Create Record'}
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

export default DotRecordForm
