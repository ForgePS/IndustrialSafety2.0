'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbLock, TbPlus, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { Textarea } from '@repo/ui/components/ui/textarea'
import { toast } from '@repo/ui/utils/toast'

import { issueLockout, type LockHolderInput } from './lockouts/actions'

export type LockHolderOption = { id: string; name: string; employeeNumber: string | null; authorized: boolean | null }

const emptyHolder = (): LockHolderInput => ({ personnelId: null, holderName: '', lockTagId: '' })

/** Picks a lock holder from personnel, or takes a typed name (contractors, visitors). */
export const LockHolderFields = ({
  holder,
  personnel,
  disabled,
  onChange
}: {
  holder: LockHolderInput
  personnel: LockHolderOption[]
  disabled: boolean
  onChange: (holder: LockHolderInput) => void
}) => (
  <div className='grid grid-cols-1 gap-2 md:grid-cols-12'>
    <select
      className='border-input bg-card h-[38px] rounded-md border px-3 md:col-span-5'
      value={holder.personnelId || ''}
      disabled={disabled}
      aria-label='Lock holder'
      onChange={event => {
        const person = personnel.find(item => item.id === event.target.value)

        onChange({ ...holder, personnelId: person?.id || null, holderName: person ? person.name : '' })
      }}
    >
      <option value=''>Someone not in personnel...</option>
      {personnel.map(person => (
        <option key={person.id} value={person.id}>
          {person.name}
          {person.employeeNumber ? ' · ' + person.employeeNumber : ''}
          {person.authorized === false ? ' (no current authorization)' : ''}
        </option>
      ))}
    </select>
    <Input
      className='md:col-span-4'
      value={holder.holderName}
      placeholder='Name'
      disabled={disabled || Boolean(holder.personnelId)}
      onChange={event => onChange({ ...holder, holderName: event.target.value })}
    />
    <Input className='md:col-span-3' value={holder.lockTagId} placeholder='Lock / tag #' disabled={disabled} onChange={event => onChange({ ...holder, lockTagId: event.target.value })} />
  </div>
)

const LotoIssueLockoutForm = ({
  procedureId,
  personnel,
  trainingRequired,
  reviewOverdue,
  onCancel
}: {
  procedureId: string
  personnel: LockHolderOption[]
  trainingRequired: string | null
  reviewOverdue: boolean
  onCancel: () => void
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [workDescription, setWorkDescription] = useState('')
  const [affectedEmployees, setAffectedEmployees] = useState('')
  const [affectedNotified, setAffectedNotified] = useState(false)
  const [tryStartRequired, setTryStartRequired] = useState(true)
  const [holders, setHolders] = useState<LockHolderInput[]>([emptyHolder()])

  const ready = workDescription.trim() && affectedNotified && holders.some(holder => holder.holderName.trim())

  const submit = () =>
    startTransition(async () => {
      const result = await issueLockout({
        procedureId,
        workDescription,
        affectedEmployees,
        affectedNotified,
        tryStartRequired,
        holders: holders.filter(holder => holder.holderName.trim())
      })

      if (result.error || !result.id) {
        toast('error', result.error || 'Unable to issue the lockout.')

        return
      }

      toast('success', result.message || 'Lockout issued.')
      router.push('/loto/lockouts/' + result.id)
    })

  return (
    <div className='flex flex-col gap-4 rounded-xl border p-4'>
      <div>
        <div className='font-semibold'>Issue Lockout</div>
        <p className='text-textSecondary mt-1 text-sm'>
          The lockout freezes this revision of the procedure. Each person working on the equipment applies their own lock. Steps are checked off on the next screen.
        </p>
      </div>
      {reviewOverdue ? (
        <div className='rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm'>
          The periodic review of this procedure is overdue. You can still issue the lockout; schedule the review.
        </div>
      ) : null}
      <div>
        <Label>Work being done</Label>
        <Textarea className='mt-2' rows={2} value={workDescription} placeholder='e.g. Replace drive belt on conveyor C-3' disabled={pending} onChange={event => setWorkDescription(event.target.value)} />
      </div>
      <div>
        <Label>Affected employees</Label>
        <Input className='mt-2' value={affectedEmployees} placeholder='Operators and others in the area' disabled={pending} onChange={event => setAffectedEmployees(event.target.value)} />
      </div>
      <div className='flex flex-col gap-2'>
        <Label>Lock holders</Label>
        {trainingRequired ? (
          <p className='text-textSecondary text-xs'>Lock holders must be in personnel with current &ldquo;{trainingRequired}&rdquo; training.</p>
        ) : null}
        {holders.map((holder, index) => (
          <div key={index} className='flex items-start gap-2'>
            <div className='flex-1'>
              <LockHolderFields
                holder={holder}
                personnel={personnel}
                disabled={pending}
                onChange={next => setHolders(holders.map((item, i) => (i === index ? next : item)))}
              />
            </div>
            {holders.length > 1 ? (
              <Button size='sm' variant='outline' aria-label='Remove lock holder' disabled={pending} onClick={() => setHolders(holders.filter((_, i) => i !== index))}>
                <TbTrash />
              </Button>
            ) : null}
          </div>
        ))}
        <div>
          <Button size='sm' variant='outline' disabled={pending} onClick={() => setHolders([...holders, emptyHolder()])}>
            <TbPlus />Another lock holder
          </Button>
        </div>
      </div>
      <label className='flex items-start gap-3 text-sm'>
        <input type='checkbox' className='mt-1' checked={affectedNotified} disabled={pending} onChange={event => setAffectedNotified(event.target.checked)} />
        Affected employees have been told the equipment is being shut down and locked out.
      </label>
      <label className='flex items-start gap-3 text-sm'>
        <input type='checkbox' className='mt-1' checked={tryStartRequired} disabled={pending} onChange={event => setTryStartRequired(event.target.checked)} />
        Require a try-start (attempted restart) before the lockout is verified.
      </label>
      <div className='flex gap-2'>
        <Button onClick={submit} disabled={pending || !ready}>
          <TbLock />{pending ? 'Issuing...' : 'Issue Lockout'}
        </Button>
        <Button variant='outline' onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </div>
  )
}

export default LotoIssueLockoutForm
