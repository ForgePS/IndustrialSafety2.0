'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'
import { TbChevronDown, TbChevronRight, TbRefresh } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import {
  acceptRecommendation,
  completeRecommendation,
  decideRecommendation,
  dismissRecommendation,
  refreshForgeAiRecommendations,
  submitRecommendation,
  verifyRecommendation
} from './actions'

type Evidence = { type: string; id: string; reference: string | null }

type Event = {
  id: number
  event_type: string
  from_status: string | null
  to_status: string | null
  actor_type: 'user' | 'system'
  detail: Record<string, any>
  created_at: string
}

type Recommendation = {
  id: string
  kind: string
  title: string
  rationale: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: string
  source_type: 'watch_alert' | 'risk_assessment'
  evidence: Evidence[]
  hidden_evidence: number
  proposed_action: { action_key: string; payload: Record<string, any> } | null
  result_entity_type: string | null
  result_entity_id: string | null
  review_note: string | null
  verification_due_at: string | null
  verification_result: { outcome?: string; method?: string; checks?: Array<{ criterion: string; met: boolean; detail: string }>; note?: string } | null
  generated_at: string
  approval: { status: string; approval_expires_at: string | null } | null
  events: Event[]
}

const OPEN = ['proposed', 'in_review', 'approved', 'executing', 'executed']

const STATUS_LABEL: Record<string, string> = {
  proposed: 'Proposed',
  in_review: 'Awaiting approval',
  approved: 'Accepted',
  executing: 'Running',
  executed: 'Awaiting verification',
  verified: 'Verified',
  failed: 'Not effective',
  rejected: 'Rejected',
  dismissed: 'Dismissed',
  superseded: 'Cleared'
}

const KIND_LABEL: Record<string, string> = {
  corrective_action: 'Corrective action',
  review: 'Review',
  training: 'Training',
  maintenance: 'Maintenance',
  escalation: 'Escalation'
}

const EVIDENCE_ROUTES: Record<string, (id: string) => string> = {
  incident: id => '/incidents/' + id,
  inspection: id => '/inspections/' + id,
  task: id => '/tasks/' + id,
  risk: id => '/risk-register/' + id,
  observation: id => '/observations/' + id,
  asset: id => '/assets/' + id,
  loto_procedure: id => '/loto/' + id,
  training_assignment: () => '/training',
  watch_alert: id => '/ai/watch?alert=' + id,
  risk_assessment: () => '/ai/risk'
}

const priorityVariant = (priority: Recommendation['priority']) =>
  priority === 'critical' || priority === 'high' ? 'destructive' : priority === 'medium' ? 'secondary' : 'outline'

const statusVariant = (status: string) =>
  status === 'verified' ? 'tonalSuccess' : status === 'failed' || status === 'rejected' ? 'destructive' : 'outline'

const label = (value: string) => value.replaceAll('_', ' ').replaceAll('.', ' ')

type Mode = 'submit' | 'reject' | 'dismiss' | 'complete' | 'effective' | 'ineffective' | null

const ForgeAiRecommendationsPanel = ({
  recommendations,
  canReview,
  canSubmit,
  canApprove
}: {
  recommendations: Recommendation[]
  canReview: boolean
  canSubmit: boolean
  canApprove: boolean
}) => {
  const [pending, startTransition] = useTransition()
  const [view, setView] = useState<'open' | 'closed'>('open')
  const [open, setOpen] = useState<string | null>(null)
  const [mode, setMode] = useState<{ id: string; mode: Mode }>({ id: '', mode: null })
  const [text, setText] = useState('')
  const [editTitle, setEditTitle] = useState('')

  const shown = useMemo(
    () => recommendations.filter(item => (view === 'open' ? OPEN.includes(item.status) : !OPEN.includes(item.status))),
    [recommendations, view]
  )

  const run = (task: () => Promise<{ message?: string; error?: string }>) =>
    startTransition(async () => {
      const result = await task()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      setMode({ id: '', mode: null })
      setText('')
    })

  const startMode = (item: Recommendation, next: Mode) => {
    setMode({ id: item.id, mode: next })
    setText(next === 'submit' ? String(item.proposed_action?.payload?.description || '') : '')
    setEditTitle(next === 'submit' ? String(item.proposed_action?.payload?.title || '') : '')
  }

  const confirmMode = (item: Recommendation) => {
    const current = mode.mode

    if (current === 'submit') run(() => submitRecommendation(item.id, { title: editTitle, description: text }))
    else if (current === 'reject') run(() => decideRecommendation(item.id, 'reject', text))
    else if (current === 'dismiss') run(() => dismissRecommendation(item.id, text))
    else if (current === 'complete') run(() => completeRecommendation(item.id, text))
    else if (current === 'effective' || current === 'ineffective') run(() => verifyRecommendation(item.id, current, text))
  }

  const MODE_TEXT: Record<Exclude<Mode, null>, { label: string; placeholder: string; button: string }> = {
    submit: { label: 'Corrective action description', placeholder: '', button: 'Send for Approval' },
    reject: { label: 'Why is the action rejected?', placeholder: 'Reason', button: 'Reject Action' },
    dismiss: { label: 'Why is no action needed?', placeholder: 'Reason', button: 'Dismiss' },
    complete: { label: 'What was done?', placeholder: 'Describe the work completed', button: 'Mark Done' },
    effective: { label: 'How was it checked?', placeholder: 'What you checked and found', button: 'Confirm Effective' },
    ineffective: { label: 'What is still wrong?', placeholder: 'What you checked and found', button: 'Mark Not Effective' }
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex gap-2'>
          {(['open', 'closed'] as const).map(key => (
            <Button key={key} size='sm' variant={view === key ? 'default' : 'outline'} onClick={() => setView(key)}>
              {key === 'open' ? 'Open' : 'Closed'} ({recommendations.filter(item => (key === 'open') === OPEN.includes(item.status)).length})
            </Button>
          ))}
        </div>
        {canReview ? (
          <Button onClick={() => run(refreshForgeAiRecommendations)} disabled={pending}>
            <TbRefresh />
            {pending ? 'Working...' : 'Refresh Recommendations'}
          </Button>
        ) : null}
      </div>

      {!shown.length ? (
        <Card>
          <CardContent className='text-textSecondary p-6 text-sm'>
            {view === 'open'
              ? 'No open recommendations for your locations. They are built on each AI Watch run from open alerts and elevated risk indicators.'
              : 'No closed recommendations yet.'}
          </CardContent>
        </Card>
      ) : null}

      {shown.map(item => {
        const expanded = open === item.id
        const active = mode.id === item.id ? mode.mode : null
        const action = item.proposed_action?.payload

        return (
          <Card key={item.id} data-testid='recommendation' data-status={item.status}>
            <CardHeader className='cursor-pointer' onClick={() => setOpen(expanded ? null : item.id)}>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-is-0 flex-1'>
                  <CardTitle className='flex items-start gap-2 text-base'>
                    <span className='mt-1'>{expanded ? <TbChevronDown /> : <TbChevronRight />}</span>
                    <span data-testid='recommendation-title'>{item.title}</span>
                  </CardTitle>
                  <CardDescription className='mt-1'>{item.rationale}</CardDescription>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge size='sm' variant={priorityVariant(item.priority) as any}>
                    {item.priority}
                  </Badge>
                  <Badge size='sm' variant='outline'>
                    {KIND_LABEL[item.kind] || item.kind}
                  </Badge>
                  <Badge size='sm' variant={statusVariant(item.status) as any} data-testid='recommendation-status'>
                    {STATUS_LABEL[item.status] || item.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            {expanded ? (
              <CardContent className='flex flex-col gap-4 text-sm'>
                <div className='flex flex-col gap-2'>
                  <span className='font-semibold'>Evidence</span>
                  <div className='flex flex-wrap gap-2'>
                    {item.evidence.map(entry =>
                      EVIDENCE_ROUTES[entry.type] ? (
                        <Link
                          key={entry.type + entry.id}
                          href={EVIDENCE_ROUTES[entry.type](entry.id)}
                          className='rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-primary/5'
                        >
                          {entry.reference || label(entry.type)}
                        </Link>
                      ) : (
                        <span key={entry.type + entry.id} className='rounded-md border px-2 py-0.5 text-xs'>
                          {entry.reference || label(entry.type)}
                        </span>
                      )
                    )}
                    {item.hidden_evidence ? (
                      <span className='text-textSecondary text-xs'>+{item.hidden_evidence} record(s) outside your access</span>
                    ) : null}
                  </div>
                </div>

                {action ? (
                  <div className='rounded-lg border p-3'>
                    <div className='font-semibold'>Proposed action: create a corrective action</div>
                    <div className='text-textSecondary mt-1'>
                      {String(action.title)} · {String(action.action_type)} · severity {String(action.severity)}
                      {action.root_cause_required ? ' · root cause required' : ''}
                    </div>
                    <div className='text-textSecondary mt-1 text-xs'>
                      Created only after approval by someone with the Approve AI Actions and Create Corrective Actions permissions for this
                      location.
                    </div>
                    {item.result_entity_type === 'corrective_action' && item.result_entity_id ? (
                      <Link className='text-primary mt-2 inline-block font-medium' href={'/corrective-actions/' + item.result_entity_id}>
                        Open the corrective action
                      </Link>
                    ) : null}
                  </div>
                ) : null}

                {item.verification_result?.checks?.length ? (
                  <div className='flex flex-col gap-1' data-testid='verification-checks'>
                    <span className='font-semibold'>Verification</span>
                    {item.verification_result.checks.map(check => (
                      <span key={check.criterion} className={check.met ? 'text-success' : 'text-textSecondary'}>
                        {check.met ? '✓' : '○'} {check.detail}
                      </span>
                    ))}
                  </div>
                ) : item.status === 'executed' && item.verification_due_at ? (
                  <span className='text-textSecondary'>
                    Checked automatically on each AI Watch run; flagged if not verified by {new Date(item.verification_due_at).toLocaleDateString()}.
                  </span>
                ) : null}

                {item.review_note ? <div className='text-textSecondary'>Note: {item.review_note}</div> : null}

                {canReview ? (
                  <div className='flex flex-wrap gap-2'>
                    {item.status === 'proposed' && item.proposed_action && canSubmit ? (
                      <Button size='sm' disabled={pending} onClick={() => startMode(item, 'submit')}>
                        Send for Approval
                      </Button>
                    ) : null}
                    {item.status === 'proposed' && !item.proposed_action ? (
                      <Button size='sm' disabled={pending} onClick={() => run(() => acceptRecommendation(item.id))}>
                        Accept
                      </Button>
                    ) : null}
                    {item.status === 'in_review' && canApprove ? (
                      <>
                        <Button
                          size='sm'
                          disabled={pending}
                          onClick={() => {
                            if (window.confirm('Approve and create this corrective action? Your permissions are checked again before it is created.')) {
                              run(() => decideRecommendation(item.id, 'approve'))
                            }
                          }}
                        >
                          Approve and Create
                        </Button>
                        <Button size='sm' variant='outline' disabled={pending} onClick={() => startMode(item, 'reject')}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {item.status === 'approved' && !item.proposed_action ? (
                      <Button size='sm' disabled={pending} onClick={() => startMode(item, 'complete')}>
                        Mark Done
                      </Button>
                    ) : null}
                    {item.status === 'executed' ? (
                      <>
                        <Button size='sm' disabled={pending} onClick={() => startMode(item, 'effective')}>
                          Confirm Effective
                        </Button>
                        <Button size='sm' variant='outline' disabled={pending} onClick={() => startMode(item, 'ineffective')}>
                          Not Effective
                        </Button>
                      </>
                    ) : null}
                    {item.status === 'proposed' || (item.status === 'approved' && !item.proposed_action) ? (
                      <Button size='sm' variant='outline' disabled={pending} onClick={() => startMode(item, 'dismiss')}>
                        Dismiss
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                {active ? (
                  <div className='flex flex-col gap-2 rounded-lg border p-3' data-testid='recommendation-form'>
                    {active === 'submit' ? (
                      <Input value={editTitle} onChange={event => setEditTitle(event.target.value)} aria-label='Corrective action title' maxLength={200} />
                    ) : null}
                    <Textarea
                      aria-label={MODE_TEXT[active].label}
                      placeholder={MODE_TEXT[active].placeholder || MODE_TEXT[active].label}
                      value={text}
                      onChange={event => setText(event.target.value)}
                      rows={3}
                    />
                    <div className='flex gap-2'>
                      <Button size='sm' disabled={pending || !text.trim()} onClick={() => confirmMode(item)}>
                        {MODE_TEXT[active].button}
                      </Button>
                      <Button size='sm' variant='outline' disabled={pending} onClick={() => setMode({ id: '', mode: null })}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}

                {item.events.length ? (
                  <details>
                    <summary className='text-textSecondary cursor-pointer text-xs'>History ({item.events.length})</summary>
                    <ol className='mt-2 flex flex-col gap-1 text-xs' data-testid='recommendation-history'>
                      {item.events.map(event => (
                        <li key={event.id} className='text-textSecondary'>
                          {new Date(event.created_at).toLocaleString()} · {label(event.event_type)}
                          {event.to_status ? ' → ' + (STATUS_LABEL[event.to_status] || event.to_status) : ''}
                          {event.actor_type === 'system' ? ' · Forge AI' : ''}
                          {event.detail?.reason || event.detail?.note ? ' · ' + (event.detail.reason || event.detail.note) : ''}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </CardContent>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}

export default ForgeAiRecommendationsPanel
