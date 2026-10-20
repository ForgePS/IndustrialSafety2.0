'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import type { SupportFeedbackRecord } from '@/lib/forgeSupportOperations'
import { submitSupportFeedback } from './operationsActions'

export default function SupportFeedback({ ticketId, feedback, canSubmit = false }: {
  ticketId: string
  feedback: SupportFeedbackRecord | null
  canSubmit?: boolean
}) {
  const router = useRouter()
  const [rating, setRating] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  if (!feedback && !canSubmit) return null

  return (
    <Card className='mt-6'>
      <CardHeader>
        <CardTitle>Support experience</CardTitle>
        <CardDescription>{feedback ? 'Feedback from the original requester.' : 'How did we do? Rate the support you received for this request.'}</CardDescription>
      </CardHeader>
      <CardContent>
        {feedback ? (
          <div className='grid gap-2'>
            <p className='font-semibold'>Rating: {feedback.rating} / 5</p>
            {feedback.comment ? <p className='whitespace-pre-wrap text-sm'>{feedback.comment}</p> : null}
            <p className='text-textSecondary text-xs'>Submitted {new Date(feedback.created_at).toLocaleString()}</p>
          </div>
        ) : (
          <form className='grid gap-4' onSubmit={event => {
            event.preventDefault()
            setError('')
            startTransition(async () => {
              try {
                const result = await submitSupportFeedback(ticketId, Number(rating), comment)
                if (result.error) setError(result.error)
                else router.refresh()
              } catch {
                setError('Unable to submit feedback. Please try again.')
              }
            })
          }}>
            <label className='grid gap-1 text-sm font-medium'>
              Support rating
              <select required value={rating} onChange={event => setRating(event.target.value)} className='border-input bg-card rounded-md border p-2'>
                <option value=''>Choose a rating</option>
                <option value='1'>1 — Very dissatisfied</option>
                <option value='2'>2 — Dissatisfied</option>
                <option value='3'>3 — Neutral</option>
                <option value='4'>4 — Satisfied</option>
                <option value='5'>5 — Very satisfied</option>
              </select>
            </label>
            <label className='grid gap-1 text-sm font-medium'>
              Feedback comments
              <textarea maxLength={2000} rows={3} value={comment} onChange={event => setComment(event.target.value)} className='border-input bg-card rounded-md border p-3' placeholder='Optional: what worked well or could improve?' />
            </label>
            {error ? <p role='alert' className='text-destructive text-sm'>{error}</p> : null}
            <div><Button type='submit' disabled={pending}>{pending ? 'Submitting…' : 'Submit feedback'}</Button></div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
