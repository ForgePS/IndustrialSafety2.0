'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { approveIncident, closeIncident, returnIncident, submitIncident } from './actions'

const IncidentWorkflowActions = ({
  incidentId,
  status,
  canSubmit,
  canApprove,
  canClose
}: {
  incidentId: string
  status: string
  canSubmit: boolean
  canApprove: boolean
  canClose: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showReturn, setShowReturn] = useState(false)
  const [reason, setReason] = useState('')

  const run = (action: () => Promise<any>) => {
    startTransition(async () => {
      const result = await action()
      if ('error' in result) {
        toast('error', result.error || 'Unable to update incident workflow.')
        return
      }
      toast('success', result.message)
      setShowReturn(false)
      setReason('')
      router.refresh()
    })
  }

  const showActions =
    (canSubmit && ['draft','returned'].includes(status)) ||
    (canApprove && status === 'submitted') ||
    (canClose && status === 'approved')

  if (!showActions) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Actions</CardTitle>
        <CardDescription>Available actions are based on the incident's current state and your effective permissions.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap gap-2'>
          {canSubmit && ['draft','returned'].includes(status) ? (
            <Button onClick={() => run(() => submitIncident(incidentId))} disabled={pending}>
              Submit for Review
            </Button>
          ) : null}

          {canApprove && status === 'submitted' ? (
            <>
              <Button onClick={() => run(() => approveIncident(incidentId))} disabled={pending}>
                Approve Incident
              </Button>
              <Button variant='outline' onClick={() => setShowReturn(value => !value)} disabled={pending}>
                Return for Correction
              </Button>
            </>
          ) : null}

          {canClose && status === 'approved' ? (
            <Button onClick={() => run(() => closeIncident(incidentId))} disabled={pending}>
              Close Incident
            </Button>
          ) : null}
        </div>

        {showReturn ? (
          <div className='rounded-lg border p-4'>
            <div className='text-textPrimary font-medium'>Return Reason</div>
            <p className='text-textSecondary mt-1 text-sm'>Tell the reporter what needs to be corrected or clarified.</p>
            <Textarea
              className='mt-3'
              rows={3}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder='Enter return reason...'
            />
            <div className='mt-3 flex gap-2'>
              <Button
                variant='destructive'
                disabled={pending || !reason.trim()}
                onClick={() => run(() => returnIncident({ incidentId, reason }))}
              >
                Return Incident
              </Button>
              <Button variant='outline' onClick={() => setShowReturn(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default IncidentWorkflowActions
