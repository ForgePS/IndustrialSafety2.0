'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import { approveInspection, closeInspection, returnInspection, submitInspection } from './actions'

const InspectionWorkflowActions = ({
  inspectionId,
  status,
  canSubmit,
  canApprove,
  canClose
}: {
  inspectionId: string
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
        toast('error', result.error || 'Unable to update inspection workflow.')
        return
      }

      toast('success', result.message)
      setShowReturn(false)
      setReason('')
      router.refresh()
    })
  }

  const hasActions =
    (canSubmit && ['draft','in_progress','returned'].includes(status)) ||
    (canApprove && status === 'submitted') ||
    (canClose && status === 'approved')

  if (!hasActions) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflow Actions</CardTitle>
        <CardDescription>Actions are controlled by status, scope, and effective tenant permissions.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap gap-2'>
          {canSubmit && ['draft','in_progress','returned'].includes(status) ? (
            <Button onClick={() => run(() => submitInspection(inspectionId))} disabled={pending}>
              Submit for Review
            </Button>
          ) : null}

          {canApprove && status === 'submitted' ? (
            <>
              <Button onClick={() => run(() => approveInspection(inspectionId))} disabled={pending}>
                Approve Inspection
              </Button>
              <Button variant='outline' onClick={() => setShowReturn(value => !value)} disabled={pending}>
                Return for Correction
              </Button>
            </>
          ) : null}

          {canClose && status === 'approved' ? (
            <Button onClick={() => run(() => closeInspection(inspectionId))} disabled={pending}>
              Close Inspection
            </Button>
          ) : null}
        </div>

        {showReturn ? (
          <div className='rounded-lg border p-4'>
            <div className='font-medium'>Return Reason</div>
            <Textarea
              className='mt-3'
              rows={3}
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder='Explain what must be corrected...'
            />
            <div className='mt-3 flex gap-2'>
              <Button
                variant='destructive'
                disabled={pending || !reason.trim()}
                onClick={() => run(() => returnInspection({ inspectionId, reason }))}
              >
                Return Inspection
              </Button>
              <Button variant='outline' onClick={() => setShowReturn(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default InspectionWorkflowActions
