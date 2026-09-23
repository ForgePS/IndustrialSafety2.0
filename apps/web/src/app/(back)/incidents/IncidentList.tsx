'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type IncidentListItem = {
  id: string
  incident_number: string
  status: string
  incident_type: string
  severity: string
  occurred_at: string
  summary: string
  locationName: string | null
  divisionName: string | null
}

const IncidentList = ({
  incidents,
  canCreate,
  statusLabels,
  typeLabels,
  severityLabels
}: {
  incidents: IncidentListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  typeLabels: Record<string, string>
  severityLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return incidents.filter(incident => {
      const matchesText =
        !q ||
        incident.incident_number.toLowerCase().includes(q) ||
        incident.summary.toLowerCase().includes(q) ||
        incident.locationName?.toLowerCase().includes(q) ||
        incident.divisionName?.toLowerCase().includes(q) ||
        (typeLabels[incident.incident_type] || incident.incident_type).toLowerCase().includes(q) ||
        (severityLabels[incident.severity] || incident.severity).toLowerCase().includes(q)

      return matchesText && (status === 'all' || incident.status === status)
    })
  }, [incidents, search, severityLabels, status, typeLabels])

  const statuses = Array.from(new Set(incidents.map(item => item.status))).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Incidents</h1>
          <p className='text-textSecondary mt-2'>Incident records visible within your assigned access scope.</p>
        </div>
        {canCreate ? (
          <Button asChild><Link href='/incidents/create'><TbPlus />Report Incident</Link></Button>
        ) : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search incidents...' className='pl-10' />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
            <option value='all'>All statuses</option>
            {statuses.map(item => <option key={item} value={item}>{statusLabels[item] || item}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Incident</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Occurred</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(incident => (
              <TableRow key={incident.id}>
                <TableCell>
                  <div className='font-semibold'>{incident.incident_number}</div>
                  <div className='text-textSecondary max-w-md truncate text-xs'>{incident.summary}</div>
                </TableCell>
                <TableCell>{typeLabels[incident.incident_type] || incident.incident_type}</TableCell>
                <TableCell>{severityLabels[incident.severity] || incident.severity}</TableCell>
                <TableCell><Badge size='sm' variant={incident.status === 'closed' || incident.status === 'approved' ? 'tonalSuccess' : 'secondary'}>{statusLabels[incident.status] || incident.status}</Badge></TableCell>
                <TableCell>{new Date(incident.occurred_at).toLocaleString()}</TableCell>
                <TableCell>{incident.locationName || '—'}</TableCell>
                <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={'/incidents/' + incident.id}>Open</Link></Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No incidents match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default IncidentList
