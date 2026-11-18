'use client'

import { useState } from 'react'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { Input } from '@repo/ui/components/ui/input'
import {
  acceptRiskForm,
  createRiskReviewForm,
  transitionRiskForm
} from './actions'

export type RiskControlTransition = {
  transition_key: string
  name: string
  requires_comment: boolean
}

const BUTTON_LABELS: Record<string, string> = {
  submit_assessment: 'Submit Assessment',
  submit_for_review: 'Submit for Review',
  activate: 'Activate',
  send_to_review: 'Send to Review',
  close: 'Close',
  reopen: 'Reopen'
}

const RiskControls = ({
  riskId,
  rowVersion,
  transitions,
  canAccept = false,
  canReview = false,
  acceptedAt = null,
  nextReviewAt = null
}: {
  riskId: string
  rowVersion: number
  transitions: RiskControlTransition[]
  canAccept?: boolean
  canReview?: boolean
  acceptedAt?: string | null
  nextReviewAt?: string | null
}) => {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [showAccept, setShowAccept] = useState(false)
  const [showReview, setShowReview] = useState(false)

  const simple = transitions.filter(item => !item.requires_comment)
  const commented = transitions.filter(item => item.requires_comment)

  const defaultNextReview = (() => {
    if (nextReviewAt) {
      const date = new Date(nextReviewAt)
      if (!Number.isNaN(date.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0')
        return (
          date.getFullYear() +
          '-' +
          pad(date.getMonth() + 1) +
          '-' +
          pad(date.getDate()) +
          'T' +
          pad(date.getHours()) +
          ':' +
          pad(date.getMinutes())
        )
      }
    }
    const future = new Date()
    future.setMonth(future.getMonth() + 6)
    const pad = (n: number) => String(n).padStart(2, '0')
    return (
      future.getFullYear() +
      '-' +
      pad(future.getMonth() + 1) +
      '-' +
      pad(future.getDate()) +
      'T09:00'
    )
  })()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Workflow</CardTitle>
        <CardDescription>
          Draft → Assessment → Review → Active → Closed. Activate enforces owner,
          assessment, controls/acceptance, approvals, and next review.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {transitions.length ? (
          <>
            <div className='flex flex-wrap gap-2'>
              {simple.map(item => (
                <form key={item.transition_key} action={transitionRiskForm}>
                  <input type='hidden' name='riskId' value={riskId} />
                  <input type='hidden' name='transitionKey' value={item.transition_key} />
                  <Button type='submit'>
                    {BUTTON_LABELS[item.transition_key] || item.name}
                  </Button>
                </form>
              ))}

              {commented.map(item => (
                <Button
                  key={item.transition_key}
                  type='button'
                  variant='outline'
                  onClick={() =>
                    setActiveKey(activeKey === item.transition_key ? null : item.transition_key)
                  }
                >
                  {BUTTON_LABELS[item.transition_key] || item.name}
                </Button>
              ))}
            </div>

            {commented.map(item =>
              activeKey === item.transition_key ? (
                <form
                  key={'form-' + item.transition_key}
                  action={transitionRiskForm}
                  className='rounded-lg border p-4'
                >
                  <input type='hidden' name='riskId' value={riskId} />
                  <input type='hidden' name='transitionKey' value={item.transition_key} />
                  <Label htmlFor={'risk-transition-comment-' + item.transition_key}>
                    {item.transition_key === 'close' ? 'Closure Summary' : 'Comment'}
                  </Label>
                  <Textarea
                    id={'risk-transition-comment-' + item.transition_key}
                    name='comment'
                    className='mt-2'
                    rows={4}
                    required
                    placeholder={
                      item.transition_key === 'close'
                        ? 'Document closure decision and residual risk acceptance...'
                        : 'Document the reason for this transition...'
                    }
                  />
                  <div className='mt-3 flex gap-2'>
                    <Button type='submit'>
                      Confirm {BUTTON_LABELS[item.transition_key] || item.name}
                    </Button>
                    <Button type='button' variant='outline' onClick={() => setActiveKey(null)}>
                      Back
                    </Button>
                  </div>
                </form>
              ) : null
            )}
          </>
        ) : (
          <p className='text-textSecondary text-sm'>No lifecycle transitions available.</p>
        )}

        {canAccept ? (
          <div className='rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <div className='font-medium'>Risk Acceptance</div>
                <p className='text-textSecondary text-sm'>
                  {acceptedAt
                    ? 'Accepted ' + new Date(acceptedAt).toLocaleString()
                    : 'Required for critical bands or activation without active controls.'}
                </p>
              </div>
              <Button type='button' variant='outline' onClick={() => setShowAccept(!showAccept)}>
                {showAccept ? 'Cancel' : acceptedAt ? 'Update Acceptance' : 'Accept Risk'}
              </Button>
            </div>
            {showAccept ? (
              <form action={acceptRiskForm} className='mt-3 space-y-3'>
                <input type='hidden' name='riskId' value={riskId} />
                <input type='hidden' name='expectedRowVersion' value={rowVersion} />
                <Label htmlFor='risk-acceptance-comment'>Acceptance comment</Label>
                <Textarea
                  id='risk-acceptance-comment'
                  name='acceptanceComment'
                  rows={3}
                  required
                  placeholder='Document residual risk acceptance rationale (including no-control cases)...'
                />
                <Button type='submit'>Record Acceptance</Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {canReview ? (
          <div className='rounded-lg border p-4'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <div className='font-medium'>Periodic Review</div>
                <p className='text-textSecondary text-sm'>
                  Snapshot inherent/residual assessment and schedule the next review.
                </p>
              </div>
              <Button type='button' variant='outline' onClick={() => setShowReview(!showReview)}>
                {showReview ? 'Cancel' : 'Record Review'}
              </Button>
            </div>
            {showReview ? (
              <form action={createRiskReviewForm} className='mt-3 space-y-3'>
                <input type='hidden' name='riskId' value={riskId} />
                <input type='hidden' name='expectedRowVersion' value={rowVersion} />
                <div>
                  <Label htmlFor='risk-next-review-at'>Next review</Label>
                  <Input
                    id='risk-next-review-at'
                    name='nextReviewAt'
                    type='datetime-local'
                    className='mt-2'
                    required
                    defaultValue={defaultNextReview}
                  />
                </div>
                <div>
                  <Label htmlFor='risk-review-notes'>Review notes</Label>
                  <Textarea
                    id='risk-review-notes'
                    name='reviewNotes'
                    className='mt-2'
                    rows={3}
                    placeholder='Document review findings...'
                  />
                </div>
                <Button type='submit'>Save Review Snapshot</Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default RiskControls
