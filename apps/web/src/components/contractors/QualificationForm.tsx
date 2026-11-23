'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { addQualification } from '@/app/(back)/contractors/actions'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'
const EMPTY = { name: '', issuedOn: '', expiresOn: '', required: false }

/** Port slice 15: add a training or certification to a worker. A required one blocks sign-in once it lapses. */
const QualificationForm = ({ workerId }: { workerId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(EMPTY)

  return (
    <form
      className='grid items-end gap-3 md:grid-cols-5'
      data-contractor-qualification-form
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await addQualification(workerId, values)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Added.')
          setValues(EMPTY)
          router.refresh()
        })
      }}
    >
      <label className='flex flex-col gap-1 text-sm font-medium md:col-span-2'>
        Training or certification
        <input name='name' required maxLength={120} value={values.name} onChange={event => setValues({ ...values, name: event.target.value })} placeholder='OSHA 10, forklift, confined space...' className={field} />
      </label>
      <label className='flex flex-col gap-1 text-sm font-medium'>
        Issued
        <input type='date' name='issuedOn' value={values.issuedOn} onChange={event => setValues({ ...values, issuedOn: event.target.value })} className={field} />
      </label>
      <label className='flex flex-col gap-1 text-sm font-medium'>
        Expires
        <input type='date' name='expiresOn' value={values.expiresOn} onChange={event => setValues({ ...values, expiresOn: event.target.value })} className={field} />
      </label>
      <div className='flex flex-col gap-2'>
        <label className='flex items-center gap-2 text-sm'>
          <input type='checkbox' name='required' checked={values.required} onChange={event => setValues({ ...values, required: event.target.checked })} />
          Required to work
        </label>
        <Button type='submit' disabled={pending}>
          {pending ? 'Adding...' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

export default QualificationForm
