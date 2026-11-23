'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import {
  approvePermit,
  cancelPermit,
  closePermit,
  completePermitWork,
  issuePermit,
  rejectPermit,
  resumePermit,
  submitPermit,
  suspendPermit,
  withdrawPermit
} from '@/app/(back)/permits/workflowActions'
import { formatWhen } from '@/components/permits/format'
import type { PermitType } from '@/lib/forgePermitRules'

type Result = { error?: string; message?: string }

type Step = {
  key: string
  label: string
  title: string
  description: string
  confirm: string
  variant?: 'default' | 'outline' | 'destructive'
  text?: { label: string; required: boolean }
  run: (permitId: string, text: string) => Promise<Result>
}

const STEPS = (type: PermitType): Step[] => [
  {
    key: 'submit',
    label: 'Send for approval',
    title: 'Send for approval',
    description: 'The approvers for this location are told. You can withdraw it until it is approved.',
    confirm: 'Send',
    run: id => submitPermit(id)
  },
  {
    key: 'withdraw',
    label: 'Withdraw',
    title: 'Withdraw the request',
    description: 'The permit goes back to draft so it can be changed.',
    confirm: 'Withdraw',
    variant: 'outline',
    run: id => withdrawPermit(id)
  },
  {
    key: 'approve',
    label: 'Approve',
    title: 'Approve the permit',
    description: 'You confirm the hazards, controls and people are right. The permit still has to be issued at the work before work starts.',
    confirm: 'Approve',
    text: { label: 'Note (optional)', required: false },
    run: (id, text) => approvePermit(id, text)
  },
  {
    key: 'reject',
    label: 'Send back',
    title: 'Send the permit back',
    description: 'The permit goes back to draft and the requester is told why.',
    confirm: 'Send back',
    variant: 'outline',
    text: { label: 'What needs to change?', required: true },
    run: (id, text) => rejectPermit(id, text)
  },
  {
    key: 'issue',
    label: 'Issue permit',
    title: 'Issue the permit at the work',
    description:
      type === 'confined_space'
        ? 'Only issue it at the space once the checklist is done, the atmosphere tests acceptable and the attendant is in place.'
        : 'Only issue it at the work once the checklist is done and the controls are in place.',
    confirm: 'Issue',
    run: id => issuePermit(id)
  },
  {
    key: 'suspend',
    label: 'Stop work',
    title: 'Stop the work',
    description: type === 'confined_space' ? 'Everyone must leave the space. An approver resumes the permit once it is safe.' : 'Work stops until an approver resumes the permit.',
    confirm: 'Stop work',
    variant: 'destructive',
    text: { label: 'Why is work stopping?', required: true },
    run: (id, text) => suspendPermit(id, text)
  },
  {
    key: 'resume',
    label: 'Resume',
    title: 'Resume the work',
    description: type === 'confined_space' || type === 'hot_work' ? 'Where a gas test is needed, a passing test taken after the stop is required.' : 'The permit becomes active again.',
    confirm: 'Resume',
    run: id => resumePermit(id)
  },
  {
    key: 'completeWork',
    label: 'Work complete',
    title: 'Mark the hot work complete',
    description: 'The fire watch starts now and must stay for the set time before the permit can be closed.',
    confirm: 'Start fire watch',
    variant: 'outline',
    run: id => completePermitWork(id)
  },
  {
    key: 'close',
    label: 'Close permit',
    title: 'Close the permit',
    description: 'Confirm the work is finished, people and tools are out and the area is safe.',
    confirm: 'Close permit',
    text: { label: 'Closing note (optional)', required: false },
    run: (id, text) => closePermit(id, text)
  },
  {
    key: 'cancel',
    label: 'Cancel permit',
    title: 'Cancel the permit',
    description: 'A canceled permit stays on record and cannot be reopened.',
    confirm: 'Cancel permit',
    variant: 'destructive',
    text: { label: 'Why is it being canceled?', required: true },
    run: (id, text) => cancelPermit(id, text)
  }
]

/** Port slice 18: the workflow buttons on a permit, each with a confirm dialog (and a reason where one is needed). */
const PermitWorkflowButtons = ({
  permitId,
  permitType,
  actions,
  fireWatchEnd,
  closeBlockers,
  timeZone
}: {
  permitId: string
  permitType: PermitType
  actions: Record<string, boolean>
  fireWatchEnd: string | null
  closeBlockers: string[]
  timeZone: string
}) => {
  const router = useRouter()
  const [open, setOpen] = useState<Step | null>(null)
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()
  const steps = STEPS(permitType)
  const shown = steps.filter(step => actions[step.key])
  const issued = Boolean(actions.suspend || actions.resume || actions.completeWork || actions.close)
  const fireWatchOn = fireWatchEnd && new Date(fireWatchEnd).getTime() > Date.now()

  const start = (step: Step) => {
    setText('')
    setOpen(step)
  }

  const confirm = () => {
    if (!open) return
    const step = open

    if (step.text?.required && !text.trim()) return void toast('error', `Fill in: ${step.text.label}`)
    startTransition(async () => {
      const result = await step.run(permitId, text.trim())

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Done.')
      setOpen(null)
      router.refresh()
    })
  }

  return (
    <div className='flex flex-col gap-2' data-permit-workflow>
      {shown.length || (issued && closeBlockers.length) ? (
        <div className='flex flex-wrap gap-2'>
          {shown.map(step => (
            <Button key={step.key} type='button' variant={step.variant || 'default'} disabled={pending} data-permit-action={step.key} onClick={() => start(step)}>
              {step.label}
            </Button>
          ))}
          {!actions.close && issued && closeBlockers.length ? (
            <Button type='button' variant='outline' disabled data-permit-action='close-blocked' title={closeBlockers.join(' ')}>
              Close permit
            </Button>
          ) : null}
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>Nothing for you to do on this permit right now.</p>
      )}

      {permitType === 'hot_work' && fireWatchEnd ? (
        <p className={'text-sm ' + (fireWatchOn ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')} data-fire-watch>
          {fireWatchOn ? `Fire watch in progress until ${formatWhen(fireWatchEnd, timeZone)}.` : `Fire watch finished ${formatWhen(fireWatchEnd, timeZone)}.`}
        </p>
      ) : null}

      {!actions.close && issued && closeBlockers.length ? (
        <ul className='text-muted-foreground list-disc pl-5 text-sm' data-close-blockers>
          {closeBlockers.map(blocker => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}

      <Dialog open={Boolean(open)} onOpenChange={value => !value && !pending && setOpen(null)}>
        <DialogContent className='max-w-md' data-permit-dialog={open?.key}>
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>{open?.description}</DialogDescription>
          </DialogHeader>
          {open?.text ? (
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={'permit-step-text-' + permitId}>{open.text.label}</Label>
              <Textarea id={'permit-step-text-' + permitId} name='reason' value={text} maxLength={2000} onChange={event => setText(event.target.value)} />
            </div>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' disabled={pending} onClick={() => setOpen(null)}>
              Back
            </Button>
            <Button type='button' variant={open?.variant === 'destructive' ? 'destructive' : 'default'} disabled={pending} data-permit-confirm onClick={confirm}>
              {pending ? 'Working...' : open?.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PermitWorkflowButtons
