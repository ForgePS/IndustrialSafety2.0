'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { addPermitPerson, removePermitPerson, signInEntrant, signOutEntrant } from '@/app/(back)/permits/workflowActions'
import { PERMIT_ROLE_LABELS, PERMIT_ROLES, REQUIRED_ROLES, type PermitType } from '@/lib/forgePermitRules'

type Person = { id: string; role: string; name: string; removed_at: string | null; inside: boolean }

type Option = { id: string; name: string }

const selectClass = 'bg-background rounded-md border px-3 py-2 text-sm'

/** Port slice 18: the people on a permit by role, with training gaps and (confined space) sign in / sign out. */
const PermitPeoplePanel = ({
  permitId,
  permitType,
  people,
  personnelOptions,
  workerOptions,
  canEdit,
  canSignIn,
  canSignOut,
  gaps
}: {
  permitId: string
  permitType: PermitType
  people: Person[]
  personnelOptions: Option[]
  workerOptions: Option[]
  canEdit: boolean
  canSignIn: boolean
  canSignOut: boolean
  gaps: { person_row_id: string; course_title: string }[]
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const roles = PERMIT_ROLES[permitType]
  const [role, setRole] = useState(roles[0])
  const [source, setSource] = useState<'personnel' | 'worker'>('personnel')
  const [personId, setPersonId] = useState('')
  const [showRemoved, setShowRemoved] = useState(false)
  const current = people.filter(person => !person.removed_at)
  const removed = people.filter(person => person.removed_at)
  const options = source === 'personnel' ? personnelOptions : workerOptions

  const run = (action: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await action()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Saved.')
      after?.()
      router.refresh()
    })

  const add = () => {
    if (!personId) return void toast('error', 'Pick a person.')
    run(
      () => addPermitPerson(permitId, { role, personnelId: source === 'personnel' ? personId : null, contractorWorkerId: source === 'worker' ? personId : null }),
      () => setPersonId('')
    )
  }

  return (
    <div className='flex flex-col gap-4' data-permit-people>
      <div className='grid gap-3 sm:grid-cols-2'>
        {roles.map(roleKey => {
          const inRole = current.filter(person => person.role === roleKey)
          const required = REQUIRED_ROLES[permitType].includes(roleKey)

          return (
            <div key={roleKey} className='rounded-md border p-3' data-role={roleKey}>
              <div className='mb-2 flex items-center justify-between gap-2'>
                <span className='text-sm font-medium'>{PERMIT_ROLE_LABELS[roleKey] || roleKey}</span>
                {required && !inRole.length ? <Badge variant='destructive'>Needed</Badge> : null}
              </div>
              {inRole.length ? (
                <ul className='flex flex-col gap-2'>
                  {inRole.map(person => {
                    const personGaps = gaps.filter(gap => gap.person_row_id === person.id)
                    const entrant = permitType === 'confined_space' && person.role === 'entrant'

                    return (
                      <li key={person.id} className='flex flex-wrap items-center gap-2 text-sm' data-person={person.name} data-person-row={person.id}>
                        <span>{person.name}</span>
                        {person.inside ? (
                          <Badge variant='default' data-inside>
                            Inside
                          </Badge>
                        ) : null}
                        {personGaps.map(gap => (
                          <Badge key={gap.course_title} variant='destructive' data-training-gap>
                            No current {gap.course_title}
                          </Badge>
                        ))}
                        <span className='ml-auto flex gap-1'>
                          {entrant && !person.inside && canSignIn ? (
                            <Button size='sm' type='button' disabled={pending} data-sign-in onClick={() => run(() => signInEntrant(permitId, person.id))}>
                              Sign in
                            </Button>
                          ) : null}
                          {entrant && person.inside && canSignOut ? (
                            <Button size='sm' type='button' variant='outline' disabled={pending} data-sign-out onClick={() => run(() => signOutEntrant(permitId, person.id))}>
                              Sign out
                            </Button>
                          ) : null}
                          {canEdit && !person.inside ? (
                            <Button
                              size='sm'
                              type='button'
                              variant='ghost'
                              className='text-destructive'
                              disabled={pending}
                              aria-label={`Remove ${person.name}`}
                              data-remove-person
                              onClick={() => {
                                if (window.confirm(`Remove ${person.name} from the permit?`)) run(() => removePermitPerson(permitId, person.id))
                              }}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className='text-muted-foreground text-sm'>No one yet.</p>
              )}
            </div>
          )
        })}
      </div>

      {canEdit ? (
        <div className='flex flex-wrap items-end gap-2' data-add-person>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            Role
            <select name='role' className={selectClass} value={role} onChange={event => setRole(event.target.value)}>
              {roles.map(roleKey => (
                <option key={roleKey} value={roleKey}>
                  {PERMIT_ROLE_LABELS[roleKey] || roleKey}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1 text-sm font-medium'>
            From
            <select
              name='source'
              className={selectClass}
              value={source}
              onChange={event => {
                setSource(event.target.value as 'personnel' | 'worker')
                setPersonId('')
              }}
            >
              <option value='personnel'>Employees</option>
              <option value='worker'>Contractor workers</option>
            </select>
          </label>
          <label className='flex min-w-48 flex-col gap-1 text-sm font-medium'>
            Person
            <select name='person' className={selectClass} value={personId} onChange={event => setPersonId(event.target.value)}>
              <option value=''>Pick a person</option>
              {options.map(option => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <Button type='button' disabled={pending} onClick={add} data-add-person-button>
            Add
          </Button>
        </div>
      ) : null}

      {removed.length ? (
        <div className='text-sm'>
          <button type='button' className='text-muted-foreground underline' onClick={() => setShowRemoved(value => !value)}>
            {showRemoved ? 'Hide' : 'Show'} {removed.length} removed
          </button>
          {showRemoved ? (
            <ul className='text-muted-foreground mt-1 list-disc pl-5'>
              {removed.map(person => (
                <li key={person.id}>
                  {person.name} ({(PERMIT_ROLE_LABELS[person.role] || person.role).toLowerCase()})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default PermitPeoplePanel
