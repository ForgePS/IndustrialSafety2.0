'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { setOperatorStatus } from '@/app/(back)/forklifts/operators/actions'
import type { OperatorActionName } from '@/lib/forgeForkliftRules'
import { REFRESHER_REASONS } from '@/lib/forgeForkliftRules'

type Step = { label: string; title: string; description: string; confirm: string; variant: 'default' | 'outline' | 'destructive'; reasonLabel: string | null }

const STEPS: Record<OperatorActionName, Step> = {
  suspend: {
    label: 'Suspend',
    title: 'Suspend the authorization',
    description: 'The operator may not do pre-shift checks or operate a truck until the authorization is reinstated. They are told why.',
    confirm: 'Suspend',
    variant: 'destructive',
    reasonLabel: 'Why is it suspended?'
  },
  reinstate: {
    label: 'Reinstate',
    title: 'Reinstate the authorization',
    description: 'The operator may operate again for the classes and until the date already on record.',
    confirm: 'Reinstate',
    variant: 'default',
    reasonLabel: null
  },
  require_refresher: {
    label: 'Require refresher training',
    title: 'Require refresher training',
    description: 'OSHA 1910.178(l)(4)(ii): the operator needs refresher training and a new evaluation before operating again. They are told why.',
    confirm: 'Require refresher',
    variant: 'outline',
    reasonLabel: 'Details'
  },
  revoke: {
    label: 'Revoke',
    title: 'Revoke the authorization',
    description: 'The operator may not operate any truck. Only a new evaluation authorizes them again. They are told why.',
    confirm: 'Revoke',
    variant: 'destructive',
    reasonLabel: 'Why is it revoked?'
  }
}

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

/** Port slice 19: suspend / reinstate / require refresher / revoke, each with a confirm dialog and a reason. */
const OperatorStatusButtons = ({ operatorId, actions, incidents }: { operatorId: string; actions: OperatorActionName[]; incidents: { id: string; label: string }[] }) => {
  const router = useRouter()
  const [open, setOpen] = useState<OperatorActionName | null>(null)
  const [text, setText] = useState('')
  const [reasonKey, setReasonKey] = useState('unsafe_operation')
  const [incidentId, setIncidentId] = useState('')
  const [pending, startTransition] = useTransition()
  const step = open ? STEPS[open] : null

  const start = (action: OperatorActionName) => {
    setText('')
    setReasonKey('unsafe_operation')
    setIncidentId('')
    setOpen(action)
  }

  const confirm = () => {
    if (!open || !step) return
    let reason = text.trim()

    if (open === 'require_refresher') {
      if (reasonKey === 'other' && !reason) return void toast('error', 'Say why refresher training is needed.')
      reason = reasonKey === 'other' ? reason : `${REFRESHER_REASONS[reasonKey]}${reason ? ': ' + reason : ''}`
    } else if (step.reasonLabel && !reason) return void toast('error', `Fill in: ${step.reasonLabel}`)

    const action = open

    startTransition(async () => {
      const result = await setOperatorStatus(operatorId, action, reason, action === 'require_refresher' ? incidentId || null : null)

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Done.')
      setOpen(null)
      router.refresh()
    })
  }

  return (
    <div className='flex flex-wrap gap-2' data-operator-actions>
      {actions.map(action => (
        <Button key={action} type='button' variant={STEPS[action].variant} disabled={pending} data-operator-action={action} onClick={() => start(action)}>
          {STEPS[action].label}
        </Button>
      ))}

      <Dialog open={Boolean(open)} onOpenChange={value => !value && !pending && setOpen(null)}>
        <DialogContent className='max-w-md' data-operator-dialog={open || ''}>
          <DialogHeader>
            <DialogTitle>{step?.title}</DialogTitle>
            <DialogDescription>{step?.description}</DialogDescription>
          </DialogHeader>
          {open === 'require_refresher' ? (
            <div className='flex flex-col gap-3'>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={'refresher-reason-' + operatorId}>Reason</Label>
                <select id={'refresher-reason-' + operatorId} name='reasonKey' value={reasonKey} onChange={event => setReasonKey(event.target.value)} className={field}>
                  {Object.entries(REFRESHER_REASONS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                  <option value='other'>Something else</option>
                </select>
              </div>
              <div className='flex flex-col gap-1.5'>
                <Label htmlFor={'refresher-incident-' + operatorId}>Incident (optional)</Label>
                <select id={'refresher-incident-' + operatorId} name='incidentId' value={incidentId} onChange={event => setIncidentId(event.target.value)} className={field}>
                  <option value=''>None</option>
                  {incidents.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          {step?.reasonLabel ? (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={'operator-step-text-' + operatorId}>
                {open === 'require_refresher' ? (reasonKey === 'other' ? 'What happened?' : 'Details (optional)') : step.reasonLabel}
              </Label>
              <Textarea id={'operator-step-text-' + operatorId} name='reason' value={text} maxLength={900} onChange={event => setText(event.target.value)} />
            </div>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' disabled={pending} onClick={() => setOpen(null)}>
              Back
            </Button>
            <Button type='button' variant={step?.variant === 'destructive' ? 'destructive' : 'default'} disabled={pending} data-operator-confirm onClick={confirm}>
              {pending ? 'Working...' : step?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default OperatorStatusButtons
