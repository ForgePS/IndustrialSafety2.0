'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { saveDocumentSettings } from '@/app/(back)/documents/actions'

type Values = { allowSelfApproval: boolean; defaultReviewIntervalMonths: string; reviewWarningDays: string }

/** Port slice 12: Document Control settings (self-approval, default review interval, reminder window). */
const DocumentSettingsForm = ({ initial }: { initial: Values }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  return (
    <form
      className='flex flex-col gap-6'
      noValidate
      onSubmit={event => {
        event.preventDefault()
        startTransition(async () => {
          const result = await saveDocumentSettings(values)

          setErrors(result.errors || {})
          if (result.errors) return void toast('error', 'Check the highlighted fields.')
          if (result.error) return void toast('error', result.error)
          toast('success', result.message || 'Saved.')
          router.refresh()
        })
      }}
    >
      <fieldset disabled={pending} className='flex flex-col gap-6'>
        <label className='flex items-start gap-2 text-sm'>
          <input
            id='documents-self-approval'
            type='checkbox'
            className='mt-1'
            checked={values.allowSelfApproval}
            onChange={event => setValues(current => ({ ...current, allowSelfApproval: event.target.checked }))}
          />
          <span>
            Let the person who submitted a version approve it.
            <span className='text-textSecondary block text-xs'>Leave this off so a second person checks every version. Turn it on only if one person runs Document Control.</span>
          </span>
        </label>

        <section className='grid gap-4 md:grid-cols-2'>
          <div>
            <Label htmlFor='documents-review-interval'>Default review interval (months)</Label>
            <Input
              id='documents-review-interval'
              className='mt-1'
              type='number'
              min={1}
              max={60}
              value={values.defaultReviewIntervalMonths}
              onChange={event => setValues(current => ({ ...current, defaultReviewIntervalMonths: event.target.value }))}
            />
            <p className='text-textSecondary mt-1 text-xs'>New documents are reviewed this often unless another interval is picked.</p>
            {errors.defaultReviewIntervalMonths ? <p className='text-destructive mt-1 text-xs'>{errors.defaultReviewIntervalMonths}</p> : null}
          </div>
          <div>
            <Label htmlFor='documents-warning-days'>Review reminder window (days)</Label>
            <Input
              id='documents-warning-days'
              className='mt-1'
              type='number'
              min={1}
              max={180}
              value={values.reviewWarningDays}
              onChange={event => setValues(current => ({ ...current, reviewWarningDays: event.target.value }))}
            />
            <p className='text-textSecondary mt-1 text-xs'>How far ahead a review counts as due soon. The owner and document managers get a reminder.</p>
            {errors.reviewWarningDays ? <p className='text-destructive mt-1 text-xs'>{errors.reviewWarningDays}</p> : null}
          </div>
        </section>

        <div>
          <Button type='submit'>{pending ? 'Saving...' : 'Save settings'}</Button>
        </div>
      </fieldset>
    </form>
  )
}

export default DocumentSettingsForm
