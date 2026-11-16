'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { cancelTrainingAssignment, updateTrainingAssignment } from '@/app/(back)/training/manageActions'

export type ManagedAssignment = { id: string; due_date: string | null; notes: string | null; label: string }

/** Edit (due date, notes) and Cancel for one person's assignment (1.0 edit, delete and remove assignee). */
const AssignmentManageButtons = ({ assignment }: { assignment: ManagedAssignment }) => {
  const router = useRouter()
  const [mode, setMode] = useState<'edit' | 'cancel' | null>(null)
  const [dueDate, setDueDate] = useState(assignment.due_date || '')
  const [notes, setNotes] = useState(assignment.notes || '')
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const open = (next: 'edit' | 'cancel') => {
    setDueDate(assignment.due_date || '')
    setNotes(assignment.notes || '')
    setReason('')
    setMode(next)
  }

  const run = (action: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'Saved.')
      setMode(null)
      router.refresh()
    })

  return (
    <>
      <div className='flex justify-end gap-2'>
        <Button size='sm' variant='outline' onClick={() => open('edit')} aria-label={'Edit assignment ' + assignment.label}>
          Edit
        </Button>
        <Button size='sm' variant='outline' className='text-destructive' onClick={() => open('cancel')} aria-label={'Cancel assignment ' + assignment.label}>
          Cancel
        </Button>
      </div>

      <Dialog open={mode === 'edit'} onOpenChange={value => !value && setMode(null)}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Edit assignment</DialogTitle>
            <DialogDescription>{assignment.label}</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={'due-' + assignment.id}>Due date</Label>
              <Input id={'due-' + assignment.id} type='date' value={dueDate} onChange={event => setDueDate(event.target.value)} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={'notes-' + assignment.id}>Notes</Label>
              <Textarea id={'notes-' + assignment.id} value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setMode(null)} disabled={pending}>
              Close
            </Button>
            <Button disabled={pending} onClick={() => run(() => updateTrainingAssignment({ assignmentId: assignment.id, dueDate: dueDate || null, notes }))}>
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'cancel'} onOpenChange={value => !value && setMode(null)}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Cancel assignment</DialogTitle>
            <DialogDescription>
              {assignment.label}. The person no longer has to take this training. The assignment stays on record as canceled and cannot be reopened.
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={'reason-' + assignment.id}>Reason (optional)</Label>
            <Textarea id={'reason-' + assignment.id} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setMode(null)} disabled={pending}>
              Keep
            </Button>
            <Button variant='destructive' disabled={pending} onClick={() => run(() => cancelTrainingAssignment({ assignmentId: assignment.id, reason }))}>
              {pending ? 'Canceling...' : 'Cancel Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AssignmentManageButtons
