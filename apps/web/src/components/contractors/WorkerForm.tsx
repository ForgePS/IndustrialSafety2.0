'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveWorker } from '@/app/(back)/contractors/actions'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Values = Record<string, string | boolean>

/** Port slice 15: add or edit a contractor worker, including the date they finished site orientation. */
const WorkerForm = ({ initial, id, companyId }: { initial: Values; id?: string; companyId?: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<Values>(initial)
  const set = (key: string) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const text = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <label className='flex flex-col gap-1 text-sm font-medium'>
      {label}
      <input name={key} value={String(values[key] ?? '')} onChange={set(key)} className={field} {...props} />
    </label>
  )

  return (
    <form
      className='flex max-w-3xl flex-col gap-4'
      data-contractor-worker-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveWorker({ ...values, id, companyId })

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          if (id) router.refresh()
          else router.push('/contractors/workers/' + result.id)
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-4'>
        <div className='grid gap-4 md:grid-cols-3'>
          {text('firstName', 'First name', { required: true, maxLength: 80 })}
          {text('lastName', 'Last name', { required: true, maxLength: 80 })}
          {text('badgeNumber', 'Badge number', { maxLength: 40 })}
        </div>
        <div className='grid gap-4 md:grid-cols-3'>
          {text('email', 'Email', { type: 'email', maxLength: 254 })}
          {text('phone', 'Phone', { maxLength: 40 })}
          {text('trade', 'Trade', { maxLength: 120 })}
        </div>
        <div className='grid items-end gap-4 md:grid-cols-3'>
          {text('orientationCompletedOn', 'Site orientation completed', { type: 'date' })}
          <label className='flex items-center gap-2 text-sm font-medium'>
            <input type='checkbox' name='active' checked={values.active !== false} onChange={event => setValues(current => ({ ...current, active: event.target.checked }))} />
            Active
          </label>
        </div>
        <div className='flex gap-2'>
          <Button type='submit'>{pending ? 'Saving...' : 'Save worker'}</Button>
          {id ? null : (
            <Button type='button' variant='outline' onClick={() => router.back()}>
              Cancel
            </Button>
          )}
        </div>
      </fieldset>
    </form>
  )
}

export default WorkerForm
