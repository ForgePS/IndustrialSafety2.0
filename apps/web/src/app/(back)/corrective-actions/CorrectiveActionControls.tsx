'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TbArchive, TbCheck, TbMessagePlus, TbShieldCheck } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'
import {
  addCorrectiveActionComment,
  archiveCorrectiveAction,
  closeCorrectiveAction,
  submitCorrectiveActionForVerification,
  verifyCorrectiveAction
} from './actions'

const CorrectiveActionControls = ({
  correctiveActionId,
  status,
  canSubmit,
  canVerify,
  canClose,
  canArchive,
  archived
}: {
  correctiveActionId: string
  status: string
  canSubmit: boolean
  canVerify: boolean
  canClose: boolean
  canArchive: boolean
  archived: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [comment, setComment] = useState('')
  const [verificationResult, setVerificationResult] =
    useState<'effective' | 'ineffective' | 'follow_up_required'>('effective')
  const [verificationNotes, setVerificationNotes] = useState('')
  const [closureNotes, setClosureNotes] = useState('')
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)

  const runSubmit = () => {
    if (!window.confirm('Submit this Corrective Action for independent verification?')) return

    startTransition(async () => {
      const result = await submitCorrectiveActionForVerification(correctiveActionId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to submit Corrective Action.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  const runVerification = () => {
    startTransition(async () => {
      const result = await verifyCorrectiveAction({
        correctiveActionId,
        result: verificationResult,
        notes: verificationNotes
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to verify Corrective Action.')
        return
      }

      toast('success', result.message)
      setVerifyOpen(false)
      setVerificationNotes('')
      router.refresh()
    })
  }

  const runClose = () => {
    startTransition(async () => {
      const result = await closeCorrectiveAction({
        correctiveActionId,
        closureNotes
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to close Corrective Action.')
        return
      }

      toast('success', result.message)
      setCloseOpen(false)
      setClosureNotes('')
      router.refresh()
    })
  }

  const runArchive = () => {
    if (!window.confirm('Archive this Corrective Action? The full record and audit history will be preserved.')) return

    startTransition(async () => {
      const result = await archiveCorrectiveAction(correctiveActionId)

      if ('error' in result) {
        toast('error', result.error || 'Unable to archive Corrective Action.')
        return
      }

      toast('success', result.message)
      router.refresh()
    })
  }

  const addComment = () => {
    startTransition(async () => {
      const result = await addCorrectiveActionComment({
        correctiveActionId,
        comment
      })

      if ('error' in result) {
        toast('error', result.error || 'Unable to add comment.')
        return
      }

      toast('success', result.message)
      setComment('')
      router.refresh()
    })
  }

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      {!archived ? (
        <Card>
          <CardHeader>
            <CardTitle>CAPA Workflow</CardTitle>
            <CardDescription>
              Completion, independent verification, closure, and archival are controlled workflow actions.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-wrap gap-2'>
              {canSubmit && ['open','in_progress'].includes(status) ? (
                <Button onClick={runSubmit} disabled={pending}>
                  <TbCheck />
                  Submit for Verification
                </Button>
              ) : null}

              {canVerify && status === 'pending_verification' ? (
                <Button onClick={() => setVerifyOpen(value => !value)} disabled={pending}>
                  <TbShieldCheck />
                  Verify Effectiveness
                </Button>
              ) : null}

              {canClose && status === 'verified' ? (
                <Button onClick={() => setCloseOpen(value => !value)} disabled={pending}>
                  <TbCheck />
                  Close Corrective Action
                </Button>
              ) : null}

              {canArchive && ['closed','canceled'].includes(status) ? (
                <Button variant='outline' onClick={runArchive} disabled={pending}>
                  <TbArchive />
                  Archive
                </Button>
              ) : null}
            </div>

            {verifyOpen ? (
              <div className='rounded-lg border p-4'>
                <Label htmlFor='capa-verification-result'>Verification Result</Label>
                <select
                  id='capa-verification-result'
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  value={verificationResult}
                  onChange={event =>
                    setVerificationResult(
                      event.target.value as 'effective' | 'ineffective' | 'follow_up_required'
                    )
                  }
                  disabled={pending}
                >
                  <option value='effective'>Effective</option>
                  <option value='ineffective'>Ineffective</option>
                  <option value='follow_up_required'>Follow-up Required</option>
                </select>

                <Label htmlFor='capa-verification-notes' className='mt-4 block'>Verification Notes</Label>
                <Textarea
                  id='capa-verification-notes'
                  className='mt-2'
                  rows={4}
                  value={verificationNotes}
                  onChange={event => setVerificationNotes(event.target.value)}
                  placeholder='Document evidence reviewed, field verification, and effectiveness...'
                  disabled={pending}
                />

                <div className='mt-3 flex gap-2'>
                  <Button
                    onClick={runVerification}
                    disabled={pending || !verificationNotes.trim()}
                  >
                    Record Verification
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => setVerifyOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {closeOpen ? (
              <div className='rounded-lg border p-4'>
                <Label htmlFor='capa-closure-notes'>Closure Notes</Label>
                <Textarea
                  id='capa-closure-notes'
                  className='mt-2'
                  rows={4}
                  value={closureNotes}
                  onChange={event => setClosureNotes(event.target.value)}
                  placeholder='Document final closure decision and supporting evidence...'
                  disabled={pending}
                />
                <div className='mt-3 flex gap-2'>
                  <Button onClick={runClose} disabled={pending || !closureNotes.trim()}>
                    Confirm Closure
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => setCloseOpen(false)}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add Comment</CardTitle>
          <CardDescription>
            Operational discussion becomes part of the Corrective Action history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id='capa-comment'
            aria-label='Corrective Action comment'
            rows={4}
            value={comment}
            onChange={event => setComment(event.target.value)}
            placeholder='Add a CAPA update or comment...'
            disabled={pending || archived}
          />
          <Button
            className='mt-3'
            variant='outline'
            onClick={addComment}
            disabled={pending || archived || !comment.trim()}
          >
            <TbMessagePlus />
            Add Comment
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

export default CorrectiveActionControls
