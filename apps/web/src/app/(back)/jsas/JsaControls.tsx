'use client'

import { useState } from 'react'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { transitionJsaForm } from './actions'

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
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (!transitions.length) return null

  const simple = transitions.filter(item => !item.requires_comment)
  const commented = transitions.filter(item => item.requires_comment)

  return (
    <Card>
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
            <form key={item.transition_key} action={transitionJsaForm}>
              <input type='hidden' name='jsaId' value={jsaId} />
              <input type='hidden' name='transitionKey' value={item.transition_key} />
              <Button type='submit'>{BUTTON_LABELS[item.transition_key] || item.name}</Button>
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
              action={transitionJsaForm}
              className='rounded-lg border p-4'
            >
              <input type='hidden' name='jsaId' value={jsaId} />
              <input type='hidden' name='transitionKey' value={item.transition_key} />
              <Label htmlFor={'jsa-transition-comment-' + item.transition_key}>Comment</Label>
              <Textarea
                id={'jsa-transition-comment-' + item.transition_key}
                name='comment'
                className='mt-2'
                rows={4}
                required
                placeholder='Document the reason for this transition...'
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
      </CardContent>
    </Card>
  )
}

export default JsaControls
