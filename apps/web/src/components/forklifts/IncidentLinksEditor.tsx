'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { addIncidentLink, removeIncidentLink } from '@/app/(back)/forklifts/operators/linkActions'
import { REFRESHER_REASONS } from '@/lib/forgeForkliftRules'

export type IncidentLinkRow = { id: string; incidentId: string; number: string; summary: string; occurredAt: string | null; note: string | null; both: boolean }

const field = 'bg-background rounded-md border px-3 py-2 text-sm'

const day = (value: string | null, timeZone: string) =>
  value ? new Date(value).toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }) : ''

/** Port slice 19: the incident links list and add form (see IncidentLinksPanel). */
const IncidentLinksEditor = ({
  forkliftId,
  operatorId,
  links,
  incidents,
  canManage,
  canRequireRefresher,
  timeZone
}: {
  forkliftId: string | null
  operatorId: string | null
  links: IncidentLinkRow[]
  incidents: { id: string; label: string }[]
  canManage: boolean
  canRequireRefresher: boolean
  timeZone: string
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [incidentId, setIncidentId] = useState('')
  const [note, setNote] = useState('')
  const [refresher, setRefresher] = useState(false)
  const [reason, setReason] = useState('accident')

  const run = (work: () => Promise<{ error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await work()

      if (result.error) return void toast('error', result.error)
      toast('success', result.message || 'Done.')
      after?.()
      router.refresh()
    })

  return (
    <div className='flex flex-col gap-3' data-incident-links>
      {links.length ? (
        <ul className='flex flex-col gap-2 text-sm'>
          {links.map(link => (
            <li key={link.id} className='flex flex-wrap items-start justify-between gap-2' data-incident-link={link.number}>
              <span>
                <Link href={`/incidents/${link.incidentId}`} className='text-primary font-medium hover:underline'>
                  {link.number}
                </Link>{' '}
                {link.summary}
                {link.occurredAt ? <span className='text-textSecondary'> · {day(link.occurredAt, timeZone)}</span> : null}
                {link.note ? <span className='text-textSecondary block text-xs'>{link.note}</span> : null}
              </span>
              {canManage ? (
                <Button type='button' size='sm' variant='outline' disabled={pending} data-remove-incident-link onClick={() => run(() => removeIncidentLink(link.id))}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className='text-textSecondary text-sm'>No incidents linked.</p>
      )}
      {canManage ? (
        <form
          className='flex flex-col gap-2'
          data-incident-link-form
          onSubmit={event => {
            event.preventDefault()
            if (!incidentId) return void toast('error', 'Pick an incident.')
            run(
              () => addIncidentLink({ forkliftId, operatorId, incidentId, note, requireRefresher: refresher, refresherReason: reason }),
              () => {
                setIncidentId('')
                setNote('')
                setRefresher(false)
              }
            )
          }}
        >
          <div className='flex flex-wrap items-center gap-2'>
            <select aria-label='Incident' name='incidentId' value={incidentId} onChange={event => setIncidentId(event.target.value)} className={field + ' max-w-md'}>
              <option value=''>Pick an incident</option>
              {incidents.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <input aria-label='Note' name='note' value={note} maxLength={1000} placeholder='Note (optional)' onChange={event => setNote(event.target.value)} className={field} />
            <Button type='submit' size='sm' disabled={pending || !incidentId}>
              {pending ? 'Linking...' : 'Link incident'}
            </Button>
          </div>
          {canRequireRefresher ? (
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <label className='flex items-center gap-2'>
                <input type='checkbox' name='requireRefresher' checked={refresher} onChange={event => setRefresher(event.target.checked)} />
                Also require refresher training and a new evaluation
              </label>
              {refresher ? (
                <select aria-label='Refresher reason' name='refresherReason' value={reason} onChange={event => setReason(event.target.value)} className={field}>
                  {Object.entries(REFRESHER_REASONS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}

export default IncidentLinksEditor
