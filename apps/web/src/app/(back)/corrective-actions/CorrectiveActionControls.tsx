'use client'

import { useState } from 'react'
import { TbArchive, TbMessagePlus, TbX } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import {
  addCorrectiveActionCommentForm,
  archiveCorrectiveActionForm,
  cancelCorrectiveActionForm,
  closeCorrectiveActionForm,
  submitCorrectiveActionForVerificationForm,
  verifyCorrectiveActionForm
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
  const [cancelOpen, setCancelOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)

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
              {canSubmit && ['open', 'in_progress'].includes(status) ? (
                <form action={submitCorrectiveActionForVerificationForm}>
                  <input type='hidden' name='correctiveActionId' value={correctiveActionId} />
                  <Button type='submit'>Submit for Verification</Button>
                </form>
              ) : null}

              {canClose && ['open', 'in_progress', 'pending_verification'].includes(status) ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setCancelOpen(true)
                    setArchiveOpen(false)
                  }}
                >
                  <TbX />
                  Cancel Corrective Action
                </Button>
              ) : null}

              {canArchive && ['closed', 'canceled'].includes(status) ? (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    setArchiveOpen(true)
                    setCancelOpen(false)
                  }}
                >
                  <TbArchive />
                  Archive
                </Button>
              ) : null}
            </div>

            {canVerify && status === 'pending_verification' ? (
              <form action={verifyCorrectiveActionForm} className='rounded-lg border p-4'>
                <input type='hidden' name='correctiveActionId' value={correctiveActionId} />
                <Label htmlFor='capa-verification-result'>Verification Result</Label>
                <select
                  id='capa-verification-result'
                  name='verification_result'
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  defaultValue='effective'
                >
                  <option value='effective'>Effective</option>
                  <option value='ineffective'>Ineffective</option>
                  <option value='follow_up_required'>Follow-up Required</option>
                </select>

                <Label htmlFor='capa-verification-notes' className='mt-4 block'>
                  Verification Notes
                </Label>
                <Textarea
                  id='capa-verification-notes'
                  name='verification_notes'
                  className='mt-2'
                  rows={4}
                  required
                  placeholder='Document evidence reviewed, field verification, and effectiveness...'
                />

                <div className='mt-3 flex gap-2'>
                  <Button type='submit'>Record Verification</Button>
                </div>
              </form>
            ) : null}

            {canClose && status === 'verified' ? (
              <form action={closeCorrectiveActionForm} className='rounded-lg border p-4'>
                <input type='hidden' name='correctiveActionId' value={correctiveActionId} />
                <Label htmlFor='capa-closure-notes'>Closure Notes</Label>
                <Textarea
                  id='capa-closure-notes'
                  name='closure_notes'
                  className='mt-2'
                  rows={4}
                  required
                  placeholder='Document final closure decision and supporting evidence...'
                />
                <div className='mt-3 flex gap-2'>
                  <Button type='submit'>Confirm Closure</Button>
                </div>
              </form>
            ) : null}

            {cancelOpen ? (
              <form action={cancelCorrectiveActionForm} className='rounded-lg border p-4'>
                <input type='hidden' name='correctiveActionId' value={correctiveActionId} />
                <Label htmlFor='capa-cancellation-notes'>Cancellation Notes</Label>
                <Textarea
                  id='capa-cancellation-notes'
                  name='cancellation_notes'
                  className='mt-2'
                  rows={4}
                  required
                  placeholder='Document why this Corrective Action is being canceled...'
                />
                <div className='mt-3 flex gap-2'>
                  <Button type='submit' variant='destructive'>
                    Confirm Cancellation
                  </Button>
                  <Button type='button' variant='outline' onClick={() => setCancelOpen(false)}>
                    Back
                  </Button>
                </div>
              </form>
            ) : null}

            {archiveOpen ? (
              <form action={archiveCorrectiveActionForm} className='rounded-lg border p-4'>
                <input type='hidden' name='correctiveActionId' value={correctiveActionId} />
                <p className='text-textSecondary text-sm'>
                  Archive this Corrective Action? The full record and audit history will be preserved.
                </p>
                <div className='mt-3 flex gap-2'>
                  <Button type='submit'>Confirm Archive</Button>
                  <Button type='button' variant='outline' onClick={() => setArchiveOpen(false)}>
                    Back
                  </Button>
                </div>
              </form>
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
          <form action={addCorrectiveActionCommentForm}>
            <input type='hidden' name='correctiveActionId' value={correctiveActionId} />
            <Textarea
              id='capa-comment'
              aria-label='Corrective Action comment'
              name='comment'
              rows={4}
              required
              disabled={archived}
              placeholder='Add a CAPA update or comment...'
            />
            <Button type='submit' className='mt-3' variant='outline' disabled={archived}>
              <TbMessagePlus />
              Add Comment
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default CorrectiveActionControls
