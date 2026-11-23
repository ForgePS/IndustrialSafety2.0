'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { signIn } from '@/app/(back)/contractors/actions'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Worker = { id: string; name: string; badge: string | null; company: string }

/**
 * Port slice 15: sign a contractor in at a location. The server decides whether they are cleared; when they
 * aren't, someone who can manage contractors may sign them in anyway with a reason.
 */
const SignInForm = ({ workers, locations, canOverride }: { workers: Worker[]; locations: { id: string; name: string }[]; canOverride: boolean }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const empty = { workerId: '', locationId: locations.length === 1 ? locations[0].id : '', hostName: '', purpose: '', overrideReason: '' }
  const [values, setValues] = useState(empty)
  const [refusal, setRefusal] = useState<string | null>(null)
  const set = (key: keyof typeof empty) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  return (
    <form
      className='flex flex-col gap-3'
      data-contractor-sign-in-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await signIn(values)

          if (result.error) {
            setRefusal(result.error)

            return void toast('error', result.error)
          }

          toast('success', result.message || 'Signed in.')
          setRefusal(null)
          setValues({ ...empty, locationId: values.locationId })
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='grid gap-3 md:grid-cols-2'>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Worker
          <select name='workerId' required value={values.workerId} onChange={set('workerId')} className={field}>
            <option value=''>Pick a worker</option>
            {workers.map(worker => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
                {worker.badge ? ` (${worker.badge})` : ''} · {worker.company}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Location
          <select name='locationId' required value={values.locationId} onChange={set('locationId')} className={field}>
            <option value=''>Pick a location</option>
            {locations.map(location => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Host
          <input name='hostName' maxLength={120} value={values.hostName} onChange={set('hostName')} className={field} />
        </label>
        <label className='flex flex-col gap-1 text-sm font-medium'>
          Purpose
          <input name='purpose' maxLength={300} value={values.purpose} onChange={set('purpose')} className={field} />
        </label>
        {canOverride ? (
          <label className='flex flex-col gap-1 text-sm font-medium md:col-span-2'>
            Override reason
            <span className='text-textSecondary text-xs font-normal'>Only if the worker isn&apos;t cleared and must come on site anyway. It stays on the record with what was missing.</span>
            <textarea name='overrideReason' rows={2} maxLength={500} value={values.overrideReason} onChange={set('overrideReason')} className={field} />
          </label>
        ) : null}
        {refusal ? (
          <p role='alert' className='text-error text-sm md:col-span-2' data-sign-in-refusal>
            {refusal}
          </p>
        ) : null}
        <div className='md:col-span-2'>
          <Button type='submit'>{pending ? 'Signing in...' : 'Sign in'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default SignInForm
