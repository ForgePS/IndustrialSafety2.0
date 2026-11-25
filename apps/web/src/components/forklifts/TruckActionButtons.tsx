'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@repo/ui/components/ui/dialog'
import { toast } from '@repo/ui/utils/toast'

import { reportDefect, resolveDefect, returnToService, takeOutOfService } from '@/app/(back)/forklifts/actions'

const field = 'bg-background w-full rounded-md border px-3 py-2 text-sm'

type Result = { error?: string; message?: string }

const useRun = (after: () => void) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const run = (work: () => Promise<Result>) =>
    startTransition(async () => {
      const result = await work()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Done.')
      after()
      router.refresh()
    })

  return { pending, run }
}

type Step = 'out' | 'return' | 'defect' | null

/** Port slice 19: out of service / return to service (manage) and report a defect (check), each with a dialog. */
export const TruckActionButtons = ({ forkliftId, status, canManage, canCheck, openCritical }: { forkliftId: string; status: string; canManage: boolean; canCheck: boolean; openCritical: number }) => {
  const [open, setOpen] = useState<Step>(null)
  const [reason, setReason] = useState('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [critical, setCritical] = useState(true)
  const { pending, run } = useRun(() => setOpen(null))
  const retired = status === 'retired'

  const start = (step: Step) => {
    setReason('')
    setLabel('')
    setDescription('')
    setCritical(true)
    setOpen(step)
  }

  const confirm = () => {
    if (open === 'out') {
      if (!reason.trim()) return void toast('error', 'Say why the forklift is out of service.')
      run(() => takeOutOfService(forkliftId, reason))
    } else if (open === 'return') {
      run(() => returnToService(forkliftId, reason))
    } else if (open === 'defect') {
      run(() => reportDefect(forkliftId, { label, description, critical }))
    }
  }

  if (retired) return null

  return (
    <>
      {canManage && status !== 'out_of_service' ? (
        <Button type='button' variant='destructive' disabled={pending} data-truck-action='out' onClick={() => start('out')}>
          Take out of service
        </Button>
      ) : null}
      {canManage && status === 'out_of_service' ? (
        <Button type='button' disabled={pending} data-truck-action='return' onClick={() => start('return')}>
          Return to service
        </Button>
      ) : null}
      {canCheck ? (
        <Button type='button' variant='outline' disabled={pending} data-truck-action='defect' onClick={() => start('defect')}>
          Report a defect
        </Button>
      ) : null}

      <Dialog open={Boolean(open)} onOpenChange={value => !value && !pending && setOpen(null)}>
        <DialogContent className='max-w-md' data-truck-dialog={open || ''}>
          <DialogHeader>
            <DialogTitle>{open === 'out' ? 'Take the forklift out of service' : open === 'return' ? 'Return the forklift to service' : 'Report a defect'}</DialogTitle>
            <DialogDescription>
              {open === 'out'
                ? 'No one may use it until it is returned to service.'
                : open === 'return'
                  ? openCritical
                    ? `There ${openCritical === 1 ? 'is an open critical defect' : `are ${openCritical} open critical defects`}. Close ${openCritical === 1 ? 'it' : 'them'} as repaired first.`
                    : 'Confirm the forklift is safe to use.'
                  : 'A critical defect takes the forklift out of service until it is repaired.'}
            </DialogDescription>
          </DialogHeader>
          {open === 'defect' ? (
            <div className='flex flex-col gap-3'>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                What is wrong
                <input name='defectLabel' value={label} maxLength={300} onChange={event => setLabel(event.target.value)} placeholder='For example "Horn"' className={field} />
              </label>
              <label className='flex flex-col gap-1 text-sm font-medium'>
                Describe the defect
                <textarea name='defectDescription' rows={3} value={description} maxLength={4000} onChange={event => setDescription(event.target.value)} className={field} />
              </label>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <input type='checkbox' name='defectCritical' checked={critical} onChange={event => setCritical(event.target.checked)} />
                Critical: affects safe operation
              </label>
            </div>
          ) : (
            <label className='flex flex-col gap-1 text-sm font-medium'>
              {open === 'out' ? 'Why is it out of service?' : 'Note (optional)'}
              <textarea name='reason' rows={3} value={reason} maxLength={open === 'out' ? 500 : 2000} onChange={event => setReason(event.target.value)} className={field} />
            </label>
          )}
          <DialogFooter>
            <Button type='button' variant='outline' disabled={pending} onClick={() => setOpen(null)}>
              Back
            </Button>
            <Button type='button' variant={open === 'out' ? 'destructive' : 'default'} disabled={pending} data-truck-confirm onClick={confirm}>
              {pending ? 'Working...' : open === 'out' ? 'Take out of service' : open === 'return' ? 'Return to service' : 'Report defect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Port slice 19: close a defect as repaired (optionally recorded as maintenance) or as not a defect. */
export const DefectCloseButton = ({ defectId, label }: { defectId: string; label: string }) => {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<'repaired' | 'not_a_defect'>('repaired')
  const [note, setNote] = useState('')
  const [recordRepair, setRecordRepair] = useState(true)
  const { pending, run } = useRun(() => setOpen(false))

  return (
    <>
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={pending}
        data-defect-close={defectId}
        onClick={() => {
          setStatus('repaired')
          setNote('')
          setRecordRepair(true)
          setOpen(true)
        }}
      >
        Close
      </Button>
      <Dialog open={open} onOpenChange={value => !value && !pending && setOpen(false)}>
        <DialogContent className='max-w-md' data-defect-dialog>
          <DialogHeader>
            <DialogTitle>Close the defect</DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>
          <div className='flex flex-col gap-3'>
            <div className='flex flex-col gap-1 text-sm'>
              <label className='flex items-center gap-2'>
                <input type='radio' name='defectStatus' value='repaired' checked={status === 'repaired'} onChange={() => setStatus('repaired')} />
                Repaired
              </label>
              <label className='flex items-center gap-2'>
                <input type='radio' name='defectStatus' value='not_a_defect' checked={status === 'not_a_defect'} onChange={() => setStatus('not_a_defect')} />
                Not a defect
              </label>
            </div>
            <label className='flex flex-col gap-1 text-sm font-medium'>
              {status === 'repaired' ? 'What was repaired?' : 'Why is this not a defect?'}
              <textarea name='resolutionNote' rows={3} value={note} maxLength={4000} onChange={event => setNote(event.target.value)} className={field} />
            </label>
            {status === 'repaired' ? (
              <label className='flex items-center gap-2 text-sm font-medium'>
                <input type='checkbox' name='recordRepair' checked={recordRepair} onChange={event => setRecordRepair(event.target.checked)} />
                Record the repair as maintenance on the equipment
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button type='button' variant='outline' disabled={pending} onClick={() => setOpen(false)}>
              Back
            </Button>
            <Button
              type='button'
              disabled={pending}
              data-defect-confirm
              onClick={() => {
                if (!note.trim()) return void toast('error', status === 'repaired' ? 'Say what was repaired.' : 'Say why this is not a defect.')
                run(() => resolveDefect(defectId, { status, note, recordRepair }))
              }}
            >
              {pending ? 'Working...' : 'Close defect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
