'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TbCheck,
  TbClipboardCheck,
  TbEdit,
  TbLockOpen,
  TbPlayerPlay,
  TbSend,
  TbTrash
} from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  approveLotoProcedure,
  completeLotoApplication,
  createLotoRevision,
  retireLotoProcedure,
  startLotoApplication,
  submitLotoProcedureForReview
} from './actions'

const LotoLifecycleControls = ({
  procedureId,
  status,
  activeApplicationId,
  canEdit,
  canApprove,
  canExecute,
  canRetire
}: {
  procedureId: string
  status: string
  activeApplicationId: string | null
  canEdit: boolean
  canApprove: boolean
  canExecute: boolean
  canRetire: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [startOpen, setStartOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [retireOpen, setRetireOpen] = useState(false)
  const [notified, setNotified] = useState(false)
  const [verified, setVerified] = useState(false)
  const [restored, setRestored] = useState(false)
  const [verificationNotes, setVerificationNotes] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
  const [retirementReason, setRetirementReason] = useState('')

  const run = (
    action: () => Promise<{ error?: string; message?: string }>,
    fallback: string
  ) => {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        toast('error', result.error)
        return
      }
      toast('success', result.message || fallback)
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Procedure Lifecycle</CardTitle>
        <CardDescription>
          Approval, revision, periodic-use, and retirement controls remain separate from normal editing.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <div className='flex flex-wrap gap-2'>
          {status === 'draft' && canEdit ? (
            <Button onClick={() => run(() => submitLotoProcedureForReview(procedureId), 'Submitted for review.')} disabled={pending}>
              <TbSend />Submit for Review
            </Button>
          ) : null}

          {status === 'review' && canApprove ? (
            <Button onClick={() => {
              if (!window.confirm('Approve this LOTO procedure for operational use?')) return
              run(() => approveLotoProcedure(procedureId), 'Procedure approved.')
            }} disabled={pending}>
              <TbCheck />Approve Procedure
            </Button>
          ) : null}

          {status === 'approved' && canEdit ? (
            <Button variant='outline' onClick={() => {
              if (!window.confirm('Open a new Draft revision? The current approved revision will be preserved.')) return
              run(() => createLotoRevision(procedureId), 'New revision opened.')
            }} disabled={pending}>
              <TbEdit />Create Revision
            </Button>
          ) : null}

          {status === 'approved' && canExecute && !activeApplicationId ? (
            <Button variant='outline' onClick={() => setStartOpen(value => !value)} disabled={pending}>
              <TbPlayerPlay />Start Field Use
            </Button>
          ) : null}

          {activeApplicationId && canExecute ? (
            <Button variant='outline' onClick={() => setCompleteOpen(value => !value)} disabled={pending}>
              <TbLockOpen />Complete Field Use
            </Button>
          ) : null}

          {status !== 'retired' && canRetire ? (
            <Button variant='destructive' onClick={() => setRetireOpen(value => !value)} disabled={pending}>
              <TbTrash />Retire Procedure
            </Button>
          ) : null}
        </div>

        {startOpen ? (
          <div className='rounded-xl border p-4'>
            <div className='font-semibold'>Start LOTO Field-Use Record</div>
            <p className='text-textSecondary mt-1 text-sm'>
              This record does not replace the employee's responsibility to physically apply and verify the procedure. Confirm both items before recording the start.
            </p>

            <label className='mt-4 flex items-start gap-3'>
              <input type='checkbox' checked={notified} onChange={event => setNotified(event.target.checked)} />
              <span className='text-sm'>Affected employees have been notified as required by the procedure.</span>
            </label>
            <label className='mt-3 flex items-start gap-3'>
              <input type='checkbox' checked={verified} onChange={event => setVerified(event.target.checked)} />
              <span className='text-sm'>Energy isolation / zero-energy verification has been completed successfully.</span>
            </label>
            <div className='mt-4'>
              <Label>Verification Notes</Label>
              <Textarea className='mt-2' rows={3} value={verificationNotes} onChange={event => setVerificationNotes(event.target.value)} />
            </div>
            <div className='mt-4 flex gap-2'>
              <Button
                onClick={() => run(
                  () => startLotoApplication({
                    procedureId,
                    affectedEmployeesNotified: notified,
                    energyControlVerified: verified,
                    verificationNotes
                  }),
                  'Field-use record started.'
                )}
                disabled={pending || !notified || !verified}
              >
                <TbClipboardCheck />Confirm Start
              </Button>
              <Button variant='outline' onClick={() => setStartOpen(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}

        {completeOpen && activeApplicationId ? (
          <div className='rounded-xl border p-4'>
            <div className='font-semibold'>Complete LOTO Field-Use Record</div>
            <label className='mt-4 flex items-start gap-3'>
              <input type='checkbox' checked={restored} onChange={event => setRestored(event.target.checked)} />
              <span className='text-sm'>Restoration-to-service checks and required notifications have been completed.</span>
            </label>
            <div className='mt-4'>
              <Label>Completion Notes</Label>
              <Textarea className='mt-2' rows={3} value={completionNotes} onChange={event => setCompletionNotes(event.target.value)} />
            </div>
            <div className='mt-4 flex gap-2'>
              <Button
                onClick={() => run(
                  () => completeLotoApplication({
                    applicationId: activeApplicationId,
                    procedureId,
                    restorationVerified: restored,
                    notes: completionNotes
                  }),
                  'Field-use record completed.'
                )}
                disabled={pending || !restored}
              >
                <TbCheck />Confirm Completion
              </Button>
              <Button variant='outline' onClick={() => setCompleteOpen(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}

        {retireOpen ? (
          <div className='rounded-xl border p-4'>
            <div className='font-semibold'>Retire Procedure</div>
            <p className='text-textSecondary mt-1 text-sm'>Retirement preserves revision, review, and field-use history.</p>
            <div className='mt-4'>
              <Label>Retirement Reason</Label>
              <Textarea className='mt-2' rows={3} value={retirementReason} onChange={event => setRetirementReason(event.target.value)} />
            </div>
            <div className='mt-4 flex gap-2'>
              <Button
                variant='destructive'
                onClick={() => {
                  if (!window.confirm('Retire this LOTO procedure?')) return
                  run(() => retireLotoProcedure({ procedureId, reason: retirementReason }), 'Procedure retired.')
                }}
                disabled={pending}
              >
                Retire
              </Button>
              <Button variant='outline' onClick={() => setRetireOpen(false)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default LotoLifecycleControls
