'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbAlertTriangle, TbCheck, TbLock, TbLockOpen, TbPlus, TbX } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import LotoEnergyBadge from '@/components/loto/LotoEnergyBadge'
import { lockoutBlockers, type LotoRestorationCheck } from '@/lib/forgeLotoRules'
import { LockHolderFields, type LockHolderOption } from '../LotoIssueLockoutForm'
import { createCapaFromLockout } from '../content-actions'
import {
  addLockoutLock,
  cancelLockout,
  checkLockoutStep,
  completeLockout,
  removeLockoutLock,
  verifyLockout,
  type LockHolderInput
} from './actions'

type Lock = {
  id: string
  holderName: string
  lockTagId: string | null
  appliedAt: string
  appliedBy: string | null
  removedAt: string | null
  removedBy: string | null
  removalNote: string | null
}

const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : '—')

const LockoutRunner = ({
  lockout,
  snapshot,
  locks,
  canExecute,
  canCreateCapa,
  personnel,
  trainingRequired
}: {
  lockout: {
    id: string
    status: string
    workDescription: string | null
    affectedEmployees: string | null
    tryStartRequired: boolean
    tryStartCompleted: boolean
    zeroEnergyConfirmed: boolean
    stepChecks: Record<string, { at?: string }>
    restorationChecksDone: string[]
    verificationNotes: string | null
    notes: string | null
    cancelReason: string | null
    startedAt: string
    startedBy: string | null
    verifiedAt: string | null
    verifiedBy: string | null
    closedAt: string | null
    closedBy: string | null
  }
  snapshot: {
    procedure: { title?: string; required_ppe?: string | null; special_precautions?: string | null; precautions?: Array<{ key: string; text: string }> } | null
    energySources: Array<{ id: string; energy_type: string; energy_code: string | null; source_name: string; magnitude: string | null; isolation_location: string; isolation_device: string | null; lockout_device: string | null; stored_energy_method: string | null; verification_method: string }>
    steps: Array<{ id: string; step_type: string; title: string; instructions: string; warning_text: string | null; verification_instructions: string | null }>
    restorationChecks: LotoRestorationCheck[]
  }
  locks: Lock[]
  canExecute: boolean
  canCreateCapa: boolean
  personnel: LockHolderOption[]
  trainingRequired: string | null
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [checks, setChecks] = useState(lockout.stepChecks)
  const [zeroEnergy, setZeroEnergy] = useState(false)
  const [tryStart, setTryStart] = useState(false)
  const [verifyNotes, setVerifyNotes] = useState('')
  const [restoration, setRestoration] = useState<string[]>([])
  const [closeNotes, setCloseNotes] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [newLock, setNewLock] = useState<LockHolderInput | null>(null)
  const [removing, setRemoving] = useState<{ id: string; note: string } | null>(null)

  const issued = lockout.status === 'in_progress'
  const verified = lockout.status === 'verified'
  const open = issued || verified

  const blockers = lockoutBlockers(
    { status: lockout.status, try_start_required: lockout.tryStartRequired, step_checks: checks, procedure_snapshot: { steps: snapshot.steps } },
    locks.map(lock => ({ removed_at: lock.removedAt }))
  )

  const run = (action: () => Promise<{ error?: string; message?: string; id?: string }>, after?: (result: { id?: string }) => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)
        router.refresh()

        return
      }

      if (result.message) toast('success', result.message)
      after?.(result)
      router.refresh()
    })

  const toggleStep = (stepId: string, checked: boolean) => {
    const previous = checks
    const next = { ...checks }

    if (checked) next[stepId] = { at: new Date().toISOString() }
    else delete next[stepId]

    setChecks(next)
    startTransition(async () => {
      const result = await checkLockoutStep({ lockoutId: lockout.id, stepId, checked })

      if (result.error) {
        toast('error', result.error)
        setChecks(previous)
      }
    })
  }

  const stage = issued ? 1 : verified ? 2 : 3

  return (
    <div className='flex flex-col gap-6'>
      <ol className='grid grid-cols-3 gap-2 text-center text-sm'>
        {['Lock & check steps', 'Zero energy verified', lockout.status === 'canceled' ? 'Canceled' : 'Returned to service'].map((label, index) => (
          <li
            key={label}
            className={
              'rounded-lg border px-2 py-3 ' +
              (stage === index + 1 && open ? 'border-primary text-primary font-semibold' : stage > index + 1 || (!open && index === 2) ? 'bg-success/10' : 'text-textSecondary')
            }
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>Work</CardTitle>
          <CardDescription>
            Issued {when(lockout.startedAt)}{lockout.startedBy ? ' by ' + lockout.startedBy : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2 text-sm'>
          <div>{lockout.workDescription || 'Not recorded (lockout started before work descriptions were captured).'}</div>
          {lockout.affectedEmployees ? <div><span className='font-semibold'>Affected employees: </span>{lockout.affectedEmployees}</div> : null}
          {snapshot.procedure?.required_ppe ? <div><span className='font-semibold'>PPE: </span>{snapshot.procedure.required_ppe}</div> : null}
          {snapshot.procedure?.precautions?.length || snapshot.procedure?.special_precautions ? (
            <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3'>
              <div className='mb-1 flex items-center gap-1 font-semibold'><TbAlertTriangle />Precautions</div>
              <ul className='list-disc pl-5'>
                {(snapshot.procedure?.precautions || []).map(item => <li key={item.key}>{item.text}</li>)}
                {snapshot.procedure?.special_precautions ? <li>{snapshot.procedure.special_precautions}</li> : null}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locks</CardTitle>
          <CardDescription>Each person working on the equipment applies and removes their own lock.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          {locks.length ? (
            locks.map(lock => (
              <div key={lock.id} className='flex flex-col gap-2 rounded-lg border p-3 md:flex-row md:items-center md:justify-between'>
                <div className='text-sm'>
                  <div className='flex items-center gap-2 font-semibold'>
                    {lock.removedAt ? <TbLockOpen className='text-textSecondary' /> : <TbLock className='text-destructive' />}
                    {lock.holderName}
                    {lock.lockTagId ? <span className='text-textSecondary font-normal'>#{lock.lockTagId}</span> : null}
                  </div>
                  <div className='text-textSecondary text-xs'>
                    On {when(lock.appliedAt)}
                    {lock.removedAt ? ` · removed ${when(lock.removedAt)}${lock.removedBy ? ' by ' + lock.removedBy : ''}` : ''}
                  </div>
                  {lock.removalNote ? <div className='text-xs'>Note: {lock.removalNote}</div> : null}
                </div>
                {open && canExecute && !lock.removedAt ? (
                  removing?.id === lock.id ? (
                    <div className='flex flex-col gap-2 md:w-96'>
                      <Textarea
                        rows={2}
                        value={removing.note}
                        placeholder='Required when removing someone else’s lock: why, and who authorized it'
                        onChange={event => setRemoving({ id: lock.id, note: event.target.value })}
                      />
                      <div className='flex gap-2'>
                        <Button size='sm' disabled={pending} onClick={() => run(() => removeLockoutLock({ lockoutId: lockout.id, lockId: lock.id, note: removing.note }), () => setRemoving(null))}>
                          Remove lock
                        </Button>
                        <Button size='sm' variant='outline' disabled={pending} onClick={() => setRemoving(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size='sm' variant='outline' disabled={pending} onClick={() => setRemoving({ id: lock.id, note: '' })}>
                      <TbLockOpen />Remove
                    </Button>
                  )
                ) : null}
              </div>
            ))
          ) : (
            <div className='text-textSecondary text-sm'>No locks recorded.</div>
          )}

          {open && canExecute ? (
            newLock ? (
              <div className='flex flex-col gap-2 rounded-lg border p-3'>
                {trainingRequired ? <p className='text-textSecondary text-xs'>Lock holders need current &ldquo;{trainingRequired}&rdquo; training.</p> : null}
                <LockHolderFields holder={newLock} personnel={personnel} disabled={pending} onChange={setNewLock} />
                <div className='flex gap-2'>
                  <Button size='sm' disabled={pending || !newLock.holderName.trim()} onClick={() => run(() => addLockoutLock({ lockoutId: lockout.id, holder: newLock }), () => setNewLock(null))}>
                    <TbLock />Add lock
                  </Button>
                  <Button size='sm' variant='outline' disabled={pending} onClick={() => setNewLock(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div>
                <Button size='sm' variant='outline' disabled={pending} onClick={() => setNewLock({ personnelId: null, holderName: '', lockTagId: '' })}>
                  <TbPlus />Add my / another lock
                </Button>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Energy Isolation Points</CardTitle>
          <CardDescription>From the procedure revision frozen when the lockout was issued.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {snapshot.energySources.length ? (
            snapshot.energySources.map(source => (
              <div key={source.id} className='rounded-lg border p-3 text-sm'>
                <div className='flex flex-wrap items-center gap-2'>
                  <LotoEnergyBadge code={source.energy_code} energyType={source.energy_type} />
                  <span className='font-semibold'>{source.source_name}</span>
                  {source.magnitude ? <span className='text-textSecondary'>{source.magnitude}</span> : null}
                </div>
                <div className='mt-1'><span className='font-semibold'>Isolate at: </span>{source.isolation_location}{source.isolation_device ? ' (' + source.isolation_device + ')' : ''}</div>
                {source.lockout_device ? <div><span className='font-semibold'>Device: </span>{source.lockout_device}</div> : null}
                {source.stored_energy_method ? <div><span className='font-semibold'>Stored energy: </span>{source.stored_energy_method}</div> : null}
                <div><span className='font-semibold'>Verify: </span>{source.verification_method}</div>
              </div>
            ))
          ) : (
            <div className='text-textSecondary text-sm'>No energy sources in the snapshot.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Procedure Steps</CardTitle>
          <CardDescription>
            {issued ? `${blockers.uncheckedSteps} of ${snapshot.steps.length} left. Every step must be checked before verifying.` : 'Steps checked during this lockout.'}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-2'>
          {snapshot.steps.map((step, index) => {
            const done = step.id in checks

            return (
              <label key={step.id} className={'flex items-start gap-3 rounded-lg border p-3 ' + (done ? 'bg-success/5' : '')}>
                <input
                  type='checkbox'
                  className='mt-1 size-5'
                  checked={done}
                  disabled={!issued || !canExecute || pending}
                  onChange={event => toggleStep(step.id, event.target.checked)}
                />
                <span className='text-sm'>
                  <span className='font-semibold'>{index + 1}. {step.title}</span>
                  <span className='mt-1 block whitespace-pre-wrap'>{step.instructions}</span>
                  {step.warning_text ? <span className='text-destructive mt-1 block'>Warning: {step.warning_text}</span> : null}
                  {step.verification_instructions ? <span className='text-textSecondary mt-1 block'>Verify: {step.verification_instructions}</span> : null}
                </span>
              </label>
            )
          })}
        </CardContent>
      </Card>

      {issued && canExecute ? (
        <Card>
          <CardHeader>
            <CardTitle>Verify Zero Energy</CardTitle>
            <CardDescription>After every step is checked and locks are on.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <label className='flex items-start gap-3 text-sm'>
              <input type='checkbox' className='mt-1 size-5' checked={zeroEnergy} onChange={event => setZeroEnergy(event.target.checked)} />
              Zero energy confirmed at every isolation point (stored energy released, tested with the listed method).
            </label>
            {lockout.tryStartRequired ? (
              <label className='flex items-start gap-3 text-sm'>
                <input type='checkbox' className='mt-1 size-5' checked={tryStart} onChange={event => setTryStart(event.target.checked)} />
                Try-start done: normal controls operated, equipment did not start, controls returned to off.
              </label>
            ) : null}
            <Textarea rows={2} value={verifyNotes} placeholder='Notes (optional)' onChange={event => setVerifyNotes(event.target.value)} />
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                disabled={pending || !blockers.canVerify || !zeroEnergy || (lockout.tryStartRequired && !tryStart)}
                onClick={() => run(() => verifyLockout({ lockoutId: lockout.id, zeroEnergyConfirmed: zeroEnergy, tryStartCompleted: tryStart, notes: verifyNotes }))}
              >
                <TbCheck />Verify
              </Button>
              {!blockers.activeLocks ? <span className='text-destructive text-sm'>Add at least one lock.</span> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {lockout.verifiedAt ? (
        <Card>
          <CardHeader>
            <CardTitle>Verified</CardTitle>
            <CardDescription>{when(lockout.verifiedAt)}{lockout.verifiedBy ? ' by ' + lockout.verifiedBy : ''}</CardDescription>
          </CardHeader>
          <CardContent className='text-sm'>
            Zero energy confirmed{lockout.tryStartCompleted ? '; try-start done' : ''}.{lockout.verificationNotes ? ' ' + lockout.verificationNotes : ''}
          </CardContent>
        </Card>
      ) : null}

      {verified && canExecute ? (
        <Card>
          <CardHeader>
            <CardTitle>Return to Service</CardTitle>
            <CardDescription>Every lock must be removed and every restoration check ticked.</CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            {snapshot.restorationChecks.map(check => (
              <label key={check.key} className='flex items-start gap-3 text-sm'>
                <input
                  type='checkbox'
                  className='mt-1 size-5'
                  checked={restoration.includes(check.key)}
                  onChange={event => setRestoration(current => (event.target.checked ? [...current, check.key] : current.filter(key => key !== check.key)))}
                />
                {check.label}
              </label>
            ))}
            <Textarea rows={2} value={closeNotes} placeholder='Notes (optional)' onChange={event => setCloseNotes(event.target.value)} />
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                disabled={pending || !blockers.canComplete || restoration.length < snapshot.restorationChecks.length}
                onClick={() => run(() => completeLockout({ lockoutId: lockout.id, checks: restoration, notes: closeNotes }))}
              >
                <TbCheck />Return to Service
              </Button>
              {blockers.activeLocks ? <span className='text-destructive text-sm'>{blockers.activeLocks} lock{blockers.activeLocks === 1 ? ' is' : 's are'} still on.</span> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!open ? (
        <Card>
          <CardHeader>
            <CardTitle>{lockout.status === 'canceled' ? 'Canceled' : 'Returned to Service'}</CardTitle>
            <CardDescription>{when(lockout.closedAt)}{lockout.closedBy ? ' by ' + lockout.closedBy : ''}</CardDescription>
          </CardHeader>
          <CardContent className='text-sm'>
            {lockout.status === 'canceled' ? lockout.cancelReason : lockout.notes || 'Restoration checks completed.'}
          </CardContent>
        </Card>
      ) : null}

      <div className='flex flex-wrap gap-2'>
        {canCreateCapa ? (
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => run(() => createCapaFromLockout(lockout.id), result => result.id && router.push('/corrective-actions/' + result.id))}
          >
            Create Corrective Action
          </Button>
        ) : null}
        {open && canExecute ? (
          <Button variant='outline' disabled={pending} onClick={() => setCancelOpen(value => !value)}>
            <TbX />Cancel Lockout
          </Button>
        ) : null}
      </div>

      {cancelOpen && open ? (
        <div className='flex flex-col gap-3 rounded-xl border p-4'>
          <Label>Why is this lockout being canceled?</Label>
          <Textarea rows={2} value={cancelReason} onChange={event => setCancelReason(event.target.value)} />
          {blockers.activeLocks ? <p className='text-destructive text-sm'>Remove every lock first.</p> : null}
          <div className='flex gap-2'>
            <Button variant='destructive' disabled={pending || !cancelReason.trim() || !blockers.canCancel} onClick={() => run(() => cancelLockout({ lockoutId: lockout.id, reason: cancelReason }))}>
              Cancel Lockout
            </Button>
            <Button variant='outline' disabled={pending} onClick={() => setCancelOpen(false)}>Keep it open</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default LockoutRunner
