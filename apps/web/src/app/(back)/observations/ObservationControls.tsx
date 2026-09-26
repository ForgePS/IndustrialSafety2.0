'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { transitionObservation } from './actions'

export type ObservationControlTransition = {
  transition_key: string
  name: string
  requires_comment: boolean
}

const BUTTON_LABELS: Record<string, string> = {
  submit: 'Submit',
  begin_review: 'Begin Review',
  return_for_info: 'Return for Info',
  require_action: 'Require Action',
  no_action: 'No Action',
  close_from_action: 'Close',
  close_no_action: 'Close'
}

const CONFLICT_MESSAGE =
  'This record changed after you opened it. Refresh the record before continuing.'

const ObservationControls = ({
  observationId,
  rowVersion,
  transitions
}: {
  observationId: string
  rowVersion: number
  transitions: ObservationControlTransition[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const currentRowVersionRef = useRef(Number(rowVersion || 1))
  const [currentRowVersion, setCurrentRowVersion] = useState(() => currentRowVersionRef.current)

  useEffect(() => {
    const incoming = Number(rowVersion || 0)
    if (!Number.isFinite(incoming) || incoming < 1) return
    if (incoming > currentRowVersionRef.current) {
      currentRowVersionRef.current = incoming
      setCurrentRowVersion(incoming)
    }
  }, [rowVersion])

  if (!transitions.length) return null

  const simple = transitions.filter(item => !item.requires_comment)
  const commented = transitions.filter(item => item.requires_comment)

  const runTransition = (transitionKey: string, comment?: string | null) => {
    startTransition(async () => {
      const result = await transitionObservation({
        observationId,
        transitionKey,
        comment: comment || null,
        expectedRowVersion: currentRowVersionRef.current
      })

      if (!result.ok) {
        if (result.conflict) {
          toast('error', CONFLICT_MESSAGE)
          router.refresh()
          return
        }
        toast('error', result.error || 'Unable to transition observation.')
        return
      }

      if (typeof result.rowVersion === 'number') {
        currentRowVersionRef.current = result.rowVersion
        setCurrentRowVersion(result.rowVersion)
      }

      toast('success', result.message)
      setActiveKey(null)
      router.refresh()
    })
  }

  return (
    <Card data-obs-controls-row-version={currentRowVersion}>
      <CardHeader>
        <CardTitle>Observation Workflow</CardTitle>
        <CardDescription>
          Submit, review, and close this observation through controlled lifecycle actions.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap gap-2'>
          {simple.map(item => (
            <Button
              key={item.transition_key}
              type='button'
              disabled={pending}
              onClick={() => runTransition(item.transition_key)}
            >
              {BUTTON_LABELS[item.transition_key] || item.name}
            </Button>
          ))}

          {commented.map(item => (
            <Button
              key={item.transition_key}
              type='button'
              variant='outline'
              disabled={pending}
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
              <Label htmlFor={'obs-transition-comment-' + item.transition_key}>
                {item.transition_key.startsWith('close') ? 'Closure Summary' : 'Comment'}
              </Label>
              <Textarea
                id={'obs-transition-comment-' + item.transition_key}
                className='mt-2'
                rows={4}
                required
                disabled={pending}
                value={commentDrafts[item.transition_key] || ''}
                onChange={event =>
                  setCommentDrafts(current => ({
                    ...current,
                    [item.transition_key]: event.target.value
                  }))
                }
                placeholder={
                  item.transition_key.startsWith('close')
                    ? 'Document closure decision and supporting rationale...'
                    : 'Document the reason for this transition...'
                }
              />
              <div className='mt-3 flex gap-2'>
                <Button
                  type='button'
                  disabled={pending}
                  onClick={() =>
                    runTransition(item.transition_key, commentDrafts[item.transition_key] || '')
                  }
                >
                  Confirm {BUTTON_LABELS[item.transition_key] || item.name}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled={pending}
                  onClick={() => setActiveKey(null)}
                >
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

export default ObservationControls
