'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { savePha } from '@/app/(back)/process-safety/actions'
import { PHA_METHODS, PHA_STATUSES, REVALIDATION_YEARS } from '@/lib/forgeProcessSafetyRules'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Option = { id: string; name: string }

/** Port slice 16: record a process hazard analysis (method, team, dates and revalidation). */
const PhaForm = ({ id, initial, locations, mocs }: { id?: string; initial: Record<string, string>; locations: Option[]; mocs: Option[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Record<string, string>>(initial)
  const set = (key: string) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const input = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={key} value={values[key] || ''} onChange={set(key)} className={field} {...props} />
    </label>
  )

  const select = (key: string, label: string, options: { value: string; label: string }[], props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <select name={key} value={values[key] || ''} onChange={set(key)} className={field} {...props}>
        {options.map(item => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-pha-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await savePha({ ...values, id })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.push('/process-safety/pha/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <div className='grid gap-4 md:grid-cols-2'>
          {input('title', 'Title', { required: true, maxLength: 200 })}
          {input('processUnit', 'Process or unit', { required: true, maxLength: 200 })}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {select('locationId', 'Location', [{ value: '', label: 'Pick one' }, ...locations.map(item => ({ value: item.id, label: item.name }))], { required: true })}
          {select('method', 'Method', [{ value: '', label: 'Pick one' }, ...PHA_METHODS.map(item => ({ value: item.key, label: item.label }))], { required: true })}
          {select(
            'status',
            'Status',
            PHA_STATUSES.map(item => ({ value: item.key, label: item.label }))
          )}
        </div>
        <div className='grid gap-4 md:grid-cols-2'>
          {input('leaderName', 'Team leader', { maxLength: 120 })}
          {input('team', 'Team members', { maxLength: 2000 })}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {input('startedOn', 'Started', { type: 'date' })}
          {input('completedOn', 'Completed', { type: 'date', required: values.status === 'completed' })}
          {input('revalidateBy', 'Revalidate by', { type: 'date', disabled: values.status !== 'completed' })}
        </div>
        <p className='text-textSecondary text-xs'>Revalidate at least every {REVALIDATION_YEARS} years. Leave it empty to use the full {REVALIDATION_YEARS} years from completion.</p>
        {select('mocId', 'Related change (optional)', [{ value: '', label: 'None' }, ...mocs.map(item => ({ value: item.id, label: item.name }))])}
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Summary and findings
          <textarea name='summary' rows={5} maxLength={10000} value={values.summary || ''} onChange={set('summary')} className={field} />
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

export default PhaForm
