'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { TbThumbDown, TbThumbUp } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'

import { articleFeedbackAction } from '@/app/(back)/help-desk/actions'

const ArticleFeedback = ({ articleId, initial, canTicket }: { articleId: string; initial: { helpful: boolean; comment: string | null } | null; canTicket: boolean }) => {
  const [helpful, setHelpful] = useState<boolean | null>(initial ? initial.helpful : null)
  const [comment, setComment] = useState(initial?.comment || '')
  const [saved, setSaved] = useState(Boolean(initial))
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const submit = (value: boolean, text = comment) =>
    start(async () => {
      setError('')
      const result = await articleFeedbackAction({ articleId, helpful: value, comment: text })

      if (!result.ok) setError(result.error || 'Unable to save feedback.')
      else {
        setHelpful(value)
        setSaved(true)
      }
    })

  return (
    <Card>
      <CardContent className='flex flex-col gap-3 p-5'>
        <p className='font-semibold'>Was this article helpful?</p>
        <div className='flex gap-2'>
          <Button type='button' variant={helpful === true ? 'tonal' : 'outline'} size='sm' disabled={pending} aria-pressed={helpful === true} onClick={() => submit(true)}>
            <TbThumbUp />
            Yes
          </Button>
          <Button type='button' variant={helpful === false ? 'tonal' : 'outline'} size='sm' disabled={pending} aria-pressed={helpful === false} onClick={() => submit(false)}>
            <TbThumbDown />
            No
          </Button>
        </div>
        {helpful === false ? (
          <div className='flex flex-col gap-2'>
            <label htmlFor='kb-feedback' className='text-sm'>
              What was missing? (optional)
            </label>
            <Textarea id='kb-feedback' rows={3} maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} />
            <div className='flex flex-wrap gap-2'>
              <Button type='button' size='sm' variant='outline' disabled={pending} onClick={() => submit(false, comment)}>
                Send feedback
              </Button>
              {canTicket ? (
                <Button asChild size='sm'>
                  <Link href='/help-desk/tickets/new'>Contact support</Link>
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {saved && !error ? (
          <p role='status' className='text-textSecondary text-sm'>
            Thanks for the feedback.
          </p>
        ) : null}
        {error ? (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default ArticleFeedback
