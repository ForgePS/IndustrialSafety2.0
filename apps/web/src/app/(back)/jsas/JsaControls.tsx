'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { transitionJsa } from './actions'

export type JsaControlTransition = {
  transition_key: string
  name: string
  requires_comment: boolean
}

const BUTTON_LABELS: Record<string, string> = {
  submit: 'Submit',
  approve: 'Approve',
  activate: 'Activate',
  supersede: 'Supersede',
  retire_from_active: 'Retire',
  retire_from_superseded: 'Retire',
  retire_from_approved: 'Retire'
}

const JsaControls = ({
  jsaId,
  transitions
}: {
  jsaId: string
  transitions: JsaControlTransition[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [comment, setComment] = useState('')

  if (!transitions.length) return null

  const simple = transitions.filter(item => !item.requires_comment)
  const commented = transitions.filter(item => item.requires_comment)

  const runTransition = (transitionKey: string, commentValue?: string | null) => {
    if (pending) return
    startTransition(async () => {
      const result = await transitionJsa({
        jsaId,
        transitionKey,
        comment: commentValue || null
      })
      if (!result.ok) {
        toast('error', result.error || 'Unable to transition JSA.')
        return
      }
      toast('success', result.message || 'JSA transitioned.')
      setActiveKey(null)
      setComment('')
      router.refresh()
    })
  }

  return (
    <Card data-testid='jsa-workflow-controls'>
      <CardHeader>
        <CardTitle>JSA Workflow</CardTitle>
        <CardDescription>
          Submit, approve, activate, supersede, and retire this JSA through controlled lifecycle
          actions.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap gap-2'>
          {simple.map(item => (
            <Button
              key={item.transition_key}
              type='button'
              disabled={pending}
              data-testid={'jsa-transition-' + item.transition_key}
              onClick={() => runTransition(item.transition_key)}
            >
              {pending ? 'Working...' : BUTTON_LABELS[item.transition_key] || item.name}
            </Button>
          ))}

          {commented.map(item => (
            <Button
              key={item.transition_key}
              type='button'
              variant='outline'
              disabled={pending}
              data-testid={'jsa-transition-' + item.transition_key}
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
            <div key={'form-' + item.transition_key} className='rounded-lg border p-4'>
              <Label htmlFor={'jsa-transition-comment-' + item.transition_key}>Comment</Label>
              <Textarea
                id={'jsa-transition-comment-' + item.transition_key}
                className='mt-2'
                rows={4}
                value={comment}
                onChange={event => setComment(event.target.value)}
                placeholder='Document the reason for this transition...'
              />
              <div className='mt-3 flex gap-2'>
                <Button
                  type='button'
                  disabled={pending || !comment.trim()}
                  data-testid={'jsa-transition-confirm-' + item.transition_key}
                  onClick={() => runTransition(item.transition_key, comment)}
                >
                  Confirm {BUTTON_LABELS[item.transition_key] || item.name}
                </Button>
                <Button type='button' variant='outline' disabled={pending} onClick={() => setActiveKey(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : null
        )}
      </CardContent>
    </Card>
  )
}

export default JsaControls
