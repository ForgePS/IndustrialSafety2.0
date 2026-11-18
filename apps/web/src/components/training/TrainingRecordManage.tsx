'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { archiveTrainingRecord, updateTrainingRecord } from '@/app/(back)/training/manageActions'

export type ManagedRecord = {
  id: string
  label: string
  source: string
  completed_at: string
  score: number | string | null
  instructor: string | null
  expires_at: string | null
  notes: string | null
  certificate_number: string | null
}

/**
 * Edit (score, instructor, completed date, expiry, notes) and Archive for one training record (1.0 PATCH
 * records/:id and records/:id/archive). A graded quiz keeps its score and date. Needs Record Completion in scope.
 */
const TrainingRecordManage = ({ record }: { record: ManagedRecord }) => {
  const router = useRouter()
  const graded = record.source !== 'manual'
  const [mode, setMode] = useState<'edit' | 'archive' | null>(null)
  const [pending, startTransition] = useTransition()

  const initial = () => ({
    score: record.score === null || record.score === undefined ? '' : String(Number(record.score)),
    instructor: record.instructor || '',
    completedDate: String(record.completed_at).slice(0, 10),
    expiresAt: record.expires_at || '',
    notes: record.notes || ''
  })

  const [values, setValues] = useState(initial)
  const [reason, setReason] = useState('')
  const set = (key: keyof ReturnType<typeof initial>) => (event: { target: { value: string } }) => setValues(current => ({ ...current, [key]: event.target.value }))

  const open = (next: 'edit' | 'archive') => {
    setValues(initial())
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

  const id = (key: string) => `${key}-${record.id}`

  return (
    <>
      <span className='inline-flex gap-2'>
        <button type='button' className='text-primary text-xs hover:underline' onClick={() => open('edit')} aria-label={'Edit record ' + record.label}>
          Edit
        </button>
        <button type='button' className='text-destructive text-xs hover:underline' onClick={() => open('archive')} aria-label={'Archive record ' + record.label}>
          Archive
        </button>
      </span>

      <Dialog open={mode === 'edit'} onOpenChange={value => !value && setMode(null)}>
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>Edit training record</DialogTitle>
            <DialogDescription>
              {record.label}
              {record.certificate_number ? ` · certificate ${record.certificate_number} keeps its number` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={id('completed')}>Completed date</Label>
              <Input id={id('completed')} type='date' value={values.completedDate} onChange={set('completedDate')} disabled={graded} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={id('score')}>Score (%)</Label>
              <Input id={id('score')} type='number' min={0} max={100} step='0.01' value={values.score} onChange={set('score')} disabled={graded} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={id('expires')}>Expires</Label>
              <Input id={id('expires')} type='date' value={values.expiresAt} onChange={set('expiresAt')} />
            </div>
            <div className='flex flex-col gap-1.5'>
              <Label htmlFor={id('instructor')}>Instructor</Label>
              <Input id={id('instructor')} value={values.instructor} maxLength={200} onChange={set('instructor')} />
            </div>
            <div className='flex flex-col gap-1.5 sm:col-span-2'>
              <Label htmlFor={id('notes')}>Notes</Label>
              <Textarea id={id('notes')} value={values.notes} maxLength={4000} onChange={set('notes')} />
            </div>
          </div>
          {graded ? <p className='text-textSecondary text-xs'>This record came from a graded quiz, so its score and date cannot be changed.</p> : null}
          <DialogFooter>
            <Button variant='outline' onClick={() => setMode(null)} disabled={pending}>
              Close
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(() =>
                  updateTrainingRecord({
                    completionId: record.id,
                    score: values.score || null,
                    instructor: values.instructor || null,
                    completedDate: values.completedDate,
                    expiresAt: values.expiresAt || null,
                    notes: values.notes || null
                  })
                )
              }
            >
              {pending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === 'archive'} onOpenChange={value => !value && setMode(null)}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Archive training record</DialogTitle>
            <DialogDescription>
              {record.label}. It stays in the audit trail but no longer counts: not on the compliance matrix, reports, certificates or LOTO authorization. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-1.5'>
            <Label htmlFor={id('archive-reason')}>Reason</Label>
            <Textarea id={id('archive-reason')} value={reason} maxLength={500} onChange={event => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setMode(null)} disabled={pending}>
              Keep
            </Button>
            <Button variant='destructive' disabled={pending || !reason.trim()} onClick={() => run(() => archiveTrainingRecord({ completionId: record.id, reason }))}>
              {pending ? 'Archiving...' : 'Archive Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default TrainingRecordManage
