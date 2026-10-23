'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { openOshaCaseFromIncident } from '../osha/actions'

const IncidentOshaPanel = ({
  incidentId,
  cases,
  people,
  defaultPersonnelId,
  canOpen,
  hiddenCount = 0
}: {
  incidentId: string
  cases: Array<{ id: string; caseNumber: string; employeeName: string; decision: string; status: string }>
  people: Array<{ id: string; label: string }>
  defaultPersonnelId: string | null
  canOpen: boolean

  /** Cases on this incident outside the viewer's OSHA access: counted, never shown. */
  hiddenCount?: number
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [personnelId, setPersonnelId] = useState(defaultPersonnelId || '')

  const open = () =>
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
    <Card data-testid='incident-osha-panel'>
      <CardHeader>
        <CardTitle>OSHA Recordkeeping</CardTitle>
        <CardDescription>Open a case for each injured or ill employee to record the OSHA decision. Form 301 fields are filled from this incident and the personnel record.</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {cases.length ? (
          <ul className='flex flex-col gap-2'>
            {cases.map(item => (
              <li key={item.id} className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
                <div>
                  <Link className='text-primary font-semibold hover:underline' href={`/osha/cases/${item.id}`}>Case {item.caseNumber}</Link>
                  <span className='text-textSecondary ms-2 text-sm'>{item.employeeName}</span>
                </div>
                <div className='flex gap-2'>
                  <Badge size='sm' variant='secondary'>{item.decision}</Badge>
                  {item.status !== 'open' ? <Badge size='sm' variant='secondary' className='capitalize'>{item.status}</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : hiddenCount ? null : (
          <p className='text-textSecondary text-sm'>No OSHA case has been opened for this incident.</p>
        )}
        {hiddenCount ? (
          <p className='text-textSecondary text-sm' data-testid='incident-osha-hidden'>
            {hiddenCount === 1 ? 'One other OSHA case' : `${hiddenCount} other OSHA cases`} on this incident {hiddenCount === 1 ? 'is' : 'are'} outside your OSHA access.
          </p>
        ) : null}

        {canOpen ? (
          <div className='grid gap-3 md:grid-cols-[1fr_auto] md:items-end'>
            <div>
              <Label htmlFor='osha-injured-person'>Injured or ill employee</Label>
              <select
                id='osha-injured-person'
                className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3'
                value={personnelId}
                disabled={pending}
                onChange={event => setPersonnelId(event.target.value)}
              >
                <option value=''>Select employee...</option>
                {people.map(person => <option key={person.id} value={person.id}>{person.label}</option>)}
              </select>
            </div>
            <Button disabled={pending || !personnelId} onClick={open}>{pending ? 'Opening...' : 'Open OSHA Case'}</Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default IncidentOshaPanel
