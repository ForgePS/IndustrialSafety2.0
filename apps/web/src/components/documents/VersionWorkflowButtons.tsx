'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { approveVersion, rejectVersion, submitVersion, withdrawVersion } from '@/app/(back)/documents/workflowActions'

const inputClass = 'border-input bg-card mt-1 h-[38px] w-full rounded-md border px-3 text-sm'
const areaClass = 'border-input bg-card mt-1 min-h-16 w-full rounded-md border p-2 text-sm'

type Props = {
  documentId: string
  version: { id: string; status: string; submitted_by: string | null; version_number: number }

  /** documents.manage in scope: submit and withdraw. */
  canManage: boolean

  /** documents.approve in scope. */
  canApprove: boolean

  /** The version is a draft and nothing else is in review. */
  canSubmit: boolean

  /** The version is in review and this user may decide it (not their own unless self-approval is allowed). */
  canDecide: boolean

  /** The signed-in user (to offer Withdraw to the submitter). Optional. */
  currentUserId?: string
}

const today = () => {
  const now = new Date()

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Port slice 12: a version's workflow buttons (document page and approvals queue). Submit for review, withdraw,
 * approve (optional effective date and note) and send back (reason required). The server actions check again.
 */
const VersionWorkflowButtons = ({ documentId, version, canManage, canApprove, canSubmit, canDecide, currentUserId }: Props) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [effectiveOn, setEffectiveOn] = useState(today())
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (action: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      setError(null)
      const result = await action()

      if (result.error) {
        setError(result.error)
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      setMode('idle')
      setNote('')
      setReason('')
      router.refresh()
    })

  const ids = { documentId, versionId: version.id }
  const inReview = version.status === 'in_review'
  const canWithdraw = inReview && (canManage || (Boolean(currentUserId) && version.submitted_by === currentUserId))
  const showSubmit = version.status === 'draft' && canManage && canSubmit
  const ownVersion = inReview && canApprove && !canDecide

  if (!showSubmit && !canWithdraw && !(inReview && canApprove)) return null

  return (
    <div className='flex flex-col gap-2' data-testid='version-workflow' data-version={version.version_number}>
      <div className='flex flex-wrap gap-2'>
        {showSubmit ? (
          <Button size='sm' disabled={pending} onClick={() => run(() => submitVersion(ids))} data-testid='submit-version'>
            Submit for review
          </Button>
        ) : null}
        {inReview && canApprove && canDecide && mode === 'idle' ? (
          <>
            <Button size='sm' disabled={pending} onClick={() => setMode('approve')} data-testid='approve-version'>
              Approve
            </Button>
            <Button size='sm' variant='outline' disabled={pending} onClick={() => setMode('reject')} data-testid='reject-version'>
              Send back
            </Button>
          </>
        ) : null}
        {canWithdraw && mode === 'idle' ? (
          <Button
            size='sm'
            variant='outline'
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Withdraw version ${version.version_number} from review? It goes back to draft.`)) run(() => withdrawVersion(ids))
            }}
            data-testid='withdraw-version'
          >
            Withdraw
          </Button>
        ) : null}
      </div>

      {ownVersion ? (
        <p className='text-textSecondary text-xs' data-testid='self-approval-blocked'>
          You submitted this version, so someone else must approve it.
        </p>
      ) : null}

      {mode === 'approve' ? (
        <div className='bg-secondary/40 flex flex-col gap-2 rounded-md border p-3' data-testid='approve-form'>
          <div>
            <Label htmlFor={`effective-${version.id}`}>Effective date</Label>
            <input id={`effective-${version.id}`} type='date' className={inputClass} value={effectiveOn} onChange={event => setEffectiveOn(event.target.value)} />
          </div>
          <div>
            <Label htmlFor={`note-${version.id}`}>Note (optional)</Label>
            <textarea id={`note-${version.id}`} className={areaClass} value={note} maxLength={2000} onChange={event => setNote(event.target.value)} />
          </div>
          <p className='text-textSecondary text-xs'>Approving publishes this version, replaces the current one and sets the next review date.</p>
          <div className='flex gap-2'>
            <Button size='sm' disabled={pending} onClick={() => run(() => approveVersion({ ...ids, effectiveOn, note }))} data-testid='confirm-approve'>
              Approve and publish
            </Button>
            <Button size='sm' variant='outline' disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'reject' ? (
        <div className='bg-secondary/40 flex flex-col gap-2 rounded-md border p-3' data-testid='reject-form'>
          <div>
            <Label htmlFor={`reason-${version.id}`}>Reason for sending it back</Label>
            <textarea id={`reason-${version.id}`} className={areaClass} value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} />
          </div>
          <p className='text-textSecondary text-xs'>The version goes back to draft and the person who submitted it is told why.</p>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='destructive'
              disabled={pending}
              onClick={() => {
                if (!reason.trim()) {
                  setError('Give a reason for sending the version back.')

                  return
                }

                run(() => rejectVersion({ ...ids, reason }))
              }}
              data-testid='confirm-reject'
            >
              Send back
            </Button>
            <Button size='sm' variant='outline' disabled={pending} onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className='text-destructive text-sm' role='alert' data-testid='workflow-error'>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default VersionWorkflowButtons
