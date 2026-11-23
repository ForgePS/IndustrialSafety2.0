'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { completePssr } from '@/app/(back)/process-safety/actions'
import { PSSR_ITEMS } from '@/lib/forgeProcessSafetyRules'

type Answer = { answer: string; note: string }

const CHOICES = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'Not applicable' }
]

/** Port slice 16: the pre-startup safety review checklist. */
const PssrForm = ({ mocId }: { mocId: string }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const set = (key: string, change: Partial<Answer>) => setAnswers(current => ({ ...current, [key]: Object.assign({ answer: '', note: '' }, current[key], change) }))

  return (
    <form
      className='flex flex-col gap-3'
      data-pssr-form
      onSubmit={event => {
        event.preventDefault()
        if (!window.confirm('Sign off the pre-startup safety review? It cannot be undone.')) return
        startTransition(async () => {
          const result = await completePssr(mocId, answers)

          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-3'>
        {PSSR_ITEMS.map(item => (
          <div key={item.key} className='flex flex-col gap-1 border-b pb-2 last:border-0' data-pssr-item={item.key}>
            <p className='text-sm'>{item.label}</p>
            <div className='flex flex-wrap items-center gap-3 text-sm'>
              {CHOICES.map(choice => (
                <label key={choice.value} className='flex items-center gap-1'>
                  <input type='radio' name={item.key} value={choice.value} checked={answers[item.key]?.answer === choice.value} onChange={() => set(item.key, { answer: choice.value })} />
                  {choice.label}
                </label>
              ))}
              <input
                aria-label={`${item.label} note`}
                placeholder='Note'
                maxLength={500}
                value={answers[item.key]?.note || ''}
                onChange={event => set(item.key, { note: event.target.value })}
                className='bg-background min-w-48 flex-1 rounded-md border px-2 py-1 text-sm'
              />
            </div>
          </div>
        ))}
        <Button type='submit'>{pending ? 'Saving...' : 'Sign off review'}</Button>
      </fieldset>
    </form>
  )
}

export default PssrForm
