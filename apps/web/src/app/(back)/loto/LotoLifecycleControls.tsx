'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TbArrowBackUp, TbCheck, TbEdit, TbLock, TbPrinter, TbSend, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { approveLotoProcedure, createLotoRevision, retireLotoProcedure, submitLotoProcedureForReview } from './actions'
import { returnLotoForCorrection } from './content-actions'
import LotoIssueLockoutForm, { type LockHolderOption } from './LotoIssueLockoutForm'

const LotoLifecycleControls = ({
  procedureId,
  status,
  openLockout,
  canEdit,
  canApprove,
  canExecute,
  canRetire,
  reviewOverdue,
  personnel,
  trainingRequired
}: {
  procedureId: string
  status: string
  openLockout: { id: string; lockout_number: string | null } | null
  canEdit: boolean
  canApprove: boolean
  canExecute: boolean
  canRetire: boolean
  reviewOverdue: boolean
  personnel: LockHolderOption[]
  trainingRequired: string | null
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [panel, setPanel] = useState<'issue' | 'return' | 'retire' | null>(null)
  const [returnNotes, setReturnNotes] = useState('')
  const [retirementReason, setRetirementReason] = useState('')

  const run = (action: () => Promise<{ error?: string; message?: string }>, fallback: string) => {
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || fallback)
      setPanel(null)
      router.refresh()
    })
  }

  const toggle = (next: 'issue' | 'return' | 'retire') => setPanel(current => (current === next ? null : next))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Procedure Lifecycle</CardTitle>
        <CardDescription>
          Approval, revision, lockouts and retirement stay separate from normal editing.
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
            <>
              <Button
                onClick={() => {
                  if (!window.confirm('Approve this LOTO procedure for operational use?')) return
                  run(() => approveLotoProcedure(procedureId), 'Procedure approved.')
                }}
                disabled={pending}
              >
                <TbCheck />Approve Procedure
              </Button>
              <Button variant='outline' onClick={() => toggle('return')} disabled={pending}>
                <TbArrowBackUp />Return for Correction
              </Button>
            </>
          ) : null}

          {status === 'approved' && canEdit ? (
            <Button
              variant='outline'
              onClick={() => {
                if (!window.confirm('Open a new Draft revision? The current approved revision will be preserved.')) return
                run(() => createLotoRevision(procedureId), 'New revision opened.')
              }}
              disabled={pending}
            >
              <TbEdit />Create Revision
            </Button>
          ) : null}

          {status === 'approved' && canExecute && !openLockout ? (
            <Button onClick={() => toggle('issue')} disabled={pending}>
              <TbLock />Issue Lockout
            </Button>
          ) : null}

          {openLockout ? (
            <Button asChild>
              <Link href={'/loto/lockouts/' + openLockout.id}>
                <TbLock />Open Lockout {openLockout.lockout_number || ''}
              </Link>
            </Button>
          ) : null}

          <Button variant='outline' asChild>
            <Link href={'/loto-print?ids=' + procedureId} target='_blank' rel='noopener'>
              <TbPrinter />Print Sheet
            </Link>
          </Button>

          {status !== 'retired' && canRetire ? (
            <Button variant='destructive' onClick={() => toggle('retire')} disabled={pending}>
              <TbTrash />Retire Procedure
            </Button>
          ) : null}
        </div>

        {panel === 'issue' ? (
          <LotoIssueLockoutForm
            procedureId={procedureId}
            personnel={personnel}
            trainingRequired={trainingRequired}
            reviewOverdue={reviewOverdue}
            onCancel={() => setPanel(null)}
          />
        ) : null}

        {panel === 'return' ? (
          <div className='rounded-xl border p-4'>
            <div className='font-semibold'>Return for Correction</div>
            <p className='text-textSecondary mt-1 text-sm'>The procedure goes back to Draft. The author sees your notes at the top of the page.</p>
            <div className='mt-4'>
              <Label>What needs to change</Label>
              <Textarea className='mt-2' rows={4} value={returnNotes} onChange={event => setReturnNotes(event.target.value)} />
            </div>
            <div className='mt-4 flex gap-2'>
              <Button
                onClick={() => run(() => returnLotoForCorrection({ procedureId, notes: returnNotes }), 'Returned for correction.')}
                disabled={pending || !returnNotes.trim()}
              >
                <TbArrowBackUp />Return to Author
              </Button>
              <Button variant='outline' onClick={() => setPanel(null)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}

        {panel === 'retire' ? (
          <div className='rounded-xl border p-4'>
            <div className='font-semibold'>Retire Procedure</div>
            <p className='text-textSecondary mt-1 text-sm'>Retirement preserves revision, review and lockout history.</p>
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
              <Button variant='outline' onClick={() => setPanel(null)} disabled={pending}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default LotoLifecycleControls
