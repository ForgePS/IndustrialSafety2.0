'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { openOshaCaseFromIncident } from './actions'

export type AwaitingIncident = {
  id: string
  incidentNumber: string
  summary: string
  locationName: string
  occurredOn: string
  defaultPersonnelId: string | null

  /** The viewer's osha.edit scope reaches this incident's Location. The server action checks again. */
  canOpen: boolean
}

/** Injury incidents with no OSHA decision yet, each with "Open OSHA case" (same action as the incident page panel). */
const OshaAwaitingReview = ({ incidents, people }: { incidents: AwaitingIncident[]; people: Array<{ id: string; label: string }> }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [personnelId, setPersonnelId] = useState('')

  const start = (incident: AwaitingIncident) => {
    setOpeningId(incident.id)
    setPersonnelId(incident.defaultPersonnelId && people.some(person => person.id === incident.defaultPersonnelId) ? incident.defaultPersonnelId : '')
  }

  const open = (incidentId: string) =>
    startTransition(async () => {
      const result = await openOshaCaseFromIncident({ incidentId, personnelId })

      if (result.error) {
        toast('error', result.error)

        return
      }

      toast('success', result.message || 'OSHA case opened.')
      if (result.id) router.push(`/osha/cases/${result.id}`)
    })

  return (
    <ul className='flex flex-col gap-3' data-testid='osha-awaiting-review'>
      {incidents.map(incident => (
        <li key={incident.id} className='flex flex-col gap-3 border-b pb-3 last:border-b-0' data-testid={`osha-awaiting-${incident.id}`}>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <div className='text-textPrimary font-semibold'>{incident.incidentNumber} · {incident.summary}</div>
              <div className='text-textSecondary text-sm'>{incident.locationName} · {incident.occurredOn}</div>
            </div>
            <div className='flex flex-wrap gap-2'>
              {incident.canOpen && openingId !== incident.id ? (
                <Button size='sm' onClick={() => start(incident)} disabled={pending}>Open OSHA case</Button>
              ) : null}
              <Button size='sm' variant='outline' asChild>
                <Link href={`/incidents/${incident.id}`}>{incident.canOpen ? 'Review incident' : 'View incident'}</Link>
              </Button>
            </div>
          </div>

          {openingId === incident.id ? (
            <div className='grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end'>
              <div>
                <Label htmlFor={`osha-person-${incident.id}`}>Injured or ill employee</Label>
                <select
                  id={`osha-person-${incident.id}`}
                  className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                  value={personnelId}
                  disabled={pending}
                  onChange={event => setPersonnelId(event.target.value)}
                >
                  <option value=''>Select employee...</option>
                  {people.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}
                </select>
              </div>
              <Button disabled={pending || !personnelId} onClick={() => open(incident.id)}>
                {pending ? 'Opening...' : 'Open case'}
              </Button>
              <Button variant='tonalDefault' disabled={pending} onClick={() => setOpeningId(null)}>Cancel</Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export default OshaAwaitingReview
