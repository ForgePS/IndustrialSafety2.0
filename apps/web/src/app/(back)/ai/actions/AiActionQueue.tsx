'use client'

import { useMemo, useState, useTransition } from 'react'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  approveForgeAiAction,
  cancelForgeAiAction,
  rejectPendingForgeAiAction
} from './actions'

type Approval = {
  id: string
  action_key: string
  actionName: string
  actionDescription: string | null
  riskLevel: string
  target_type: string | null
  target_id: string | null
  targetReference: string | null
  request_payload: Record<string, unknown>
  risk_summary: string | null
  status: string
  approval_expires_at: string | null
  requested_by: string
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  execution_result: Record<string, unknown> | null
  created_at: string
}

const prettyLabel = (key: string) =>
  key.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())

const AiActionQueue = ({
  approvals,
  currentUserId,
  canApprove
}: {
  approvals: Approval[]
  currentUserId: string
  canApprove: boolean
}) => {
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState('pending')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const filtered = useMemo(
    () => approvals.filter(item => filter === 'all' || item.status === filter),
    [approvals, filter]
  )

  const approve = (id: string) => {
    if (!window.confirm('Approve and execute this Forge AI action? The underlying Forge permission will be revalidated before execution.')) return

    startTransition(async () => {
      const result = await approveForgeAiAction(id)

      if ('error' in result) {
        toast('error', result.error || 'Unable to approve AI action.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  const reject = (id: string) => {
    startTransition(async () => {
      const result = await rejectPendingForgeAiAction({
        approvalId: id,
        reason: rejectReason
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to reject AI action.')
        return
      }

      toast('success', result.message)
      setRejectingId(null)
      setRejectReason('')
      window.location.reload()
    })
  }

  const cancel = (id: string) => {
    if (!window.confirm('Cancel this pending Forge AI action?')) return

    startTransition(async () => {
      const result = await cancelForgeAiAction(id)

      if ('error' in result) {
        toast('error', result.error || 'Unable to cancel AI action.')
        return
      }

      toast('success', result.message)
      window.location.reload()
    })
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap gap-2'>
        {['pending','executed','rejected','failed','canceled','expired','all'].map(item => (
          <Button
            key={item}
            size='sm'
            variant={filter === item ? 'default' : 'outline'}
            onClick={() => setFilter(item)}
          >
            {prettyLabel(item)}
          </Button>
        ))}
      </div>

      {filtered.length ? filtered.map(approval => {
        const isRequester = approval.requested_by === currentUserId
        const expired = approval.approval_expires_at
          ? new Date(approval.approval_expires_at).getTime() <= Date.now()
          : false

        return (
          <Card key={approval.id}>
            <CardHeader>
              <div className='flex flex-wrap items-start justify-between gap-4'>
                <div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <CardTitle>{approval.actionName}</CardTitle>
                    <Badge size='sm' variant={approval.status === 'executed' ? 'tonalSuccess' : approval.status === 'failed' || approval.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {prettyLabel(approval.status)}
                    </Badge>
                    <Badge size='sm' variant={approval.riskLevel === 'critical' ? 'destructive' : 'outline'}>
                      {prettyLabel(approval.riskLevel)} Risk
                    </Badge>
                  </div>
                  <CardDescription className='mt-2'>
                    {approval.actionDescription || approval.action_key}
                  </CardDescription>
                </div>
                <div className='text-textSecondary text-right text-xs'>
                  <div>Requested {new Date(approval.created_at).toLocaleString()}</div>
                  {approval.approval_expires_at && approval.status === 'pending' ? (
                    <div>{expired ? 'Approval expired' : 'Expires ' + new Date(approval.approval_expires_at).toLocaleString()}</div>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className='flex flex-col gap-4'>
              <div className='grid gap-4 md:grid-cols-3'>
                <div>
                  <div className='text-textSecondary text-xs uppercase'>Target</div>
                  <div className='mt-1 font-medium'>{approval.targetReference || approval.target_type || '—'}</div>
                </div>
                <div>
                  <div className='text-textSecondary text-xs uppercase'>Action Key</div>
                  <div className='mt-1 font-mono text-sm'>{approval.action_key}</div>
                </div>
                <div>
                  <div className='text-textSecondary text-xs uppercase'>Requested By</div>
                  <div className='mt-1 font-medium'>{isRequester ? 'You' : 'Another authorized user'}</div>
                </div>
              </div>

              <div className='rounded-lg border p-4'>
                <div className='font-semibold'>Proposed Changes</div>
                <div className='mt-3 grid gap-3 md:grid-cols-2'>
                  {Object.entries(approval.request_payload || {}).filter(([, value]) => value != null && value !== '').map(([key, value]) => (
                    <div key={key}>
                      <div className='text-textSecondary text-xs'>{prettyLabel(key)}</div>
                      <div className='mt-1 whitespace-pre-wrap text-sm'>{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {approval.risk_summary ? (
                <div className='rounded-lg border p-3 text-sm'>{approval.risk_summary}</div>
              ) : null}

              {approval.execution_result ? (
                <div className='rounded-lg border p-3 text-sm'>
                  <div className='font-semibold'>Execution Result</div>
                  <pre className='mt-2 overflow-x-auto whitespace-pre-wrap text-xs'>{JSON.stringify(approval.execution_result, null, 2)}</pre>
                </div>
              ) : null}

              {approval.rejection_reason ? (
                <div className='rounded-lg border p-3 text-sm'>
                  <strong>Rejection Reason:</strong> {approval.rejection_reason}
                </div>
              ) : null}

              {approval.status === 'pending' && !expired ? (
                <div className='flex flex-wrap gap-2'>
                  {canApprove ? (
                    <>
                      <Button onClick={() => approve(approval.id)} disabled={pending}>Approve & Execute</Button>
                      <Button variant='outline' onClick={() => setRejectingId(approval.id)} disabled={pending}>Reject</Button>
                    </>
                  ) : null}
                  {isRequester ? (
                    <Button variant='destructive' onClick={() => cancel(approval.id)} disabled={pending}>Cancel Request</Button>
                  ) : null}
                </div>
              ) : null}

              {rejectingId === approval.id ? (
                <div className='rounded-lg border p-4'>
                  <div className='font-semibold'>Reject AI Action</div>
                  <Textarea
                    className='mt-3'
                    rows={3}
                    value={rejectReason}
                    onChange={event => setRejectReason(event.target.value)}
                    placeholder='Optional reason for rejection...'
                  />
                  <div className='mt-3 flex gap-2'>
                    <Button variant='destructive' onClick={() => reject(approval.id)} disabled={pending}>Confirm Reject</Button>
                    <Button variant='outline' onClick={() => setRejectingId(null)} disabled={pending}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )
      }) : (
        <Card>
          <CardContent className='py-12 text-center'>
            <div className='text-lg font-semibold'>No AI actions in this view</div>
            <div className='text-textSecondary mt-2 text-sm'>Approved actions will appear here when Forge AI prepares a permitted change.</div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default AiActionQueue
