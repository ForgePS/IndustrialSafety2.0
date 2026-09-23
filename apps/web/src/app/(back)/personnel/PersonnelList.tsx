'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type PersonnelListItem = {
  id: string
  first_name: string
  last_name: string
  employee_number: string | null
  employment_status: string
  job_title: string | null
  email: string | null
  locationName: string | null
  divisionName: string | null
}

const PersonnelList = ({
  personnel,
  canCreate,
  statusLabels
}: {
  personnel: PersonnelListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return personnel.filter(person => {
      const matchesText =
        !q ||
        `${person.first_name} ${person.last_name}`.toLowerCase().includes(q) ||
        person.employee_number?.toLowerCase().includes(q) ||
        person.job_title?.toLowerCase().includes(q) ||
        person.email?.toLowerCase().includes(q) ||
        person.locationName?.toLowerCase().includes(q) ||
        person.divisionName?.toLowerCase().includes(q)

      return matchesText && (status === 'all' || person.employment_status === status)
    })
  }, [personnel, search, status])

  const statuses = Array.from(new Set(personnel.map(person => person.employment_status))).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Personnel</h1>
          <p className='text-textSecondary mt-2'>Personnel records visible within your assigned access scope.</p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href='/personnel/create'><TbPlus />Add Personnel</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search personnel...'
              className='pl-10'
            />
          </div>
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All statuses</option>
            {statuses.map(item => <option key={item} value={item}>{statusLabels[item] || item}</option>)}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Personnel</TableHead>
              <TableHead>Employee #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Division</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(person => (
              <TableRow key={person.id}>
                <TableCell>
                  <div className='text-textPrimary font-semibold'>{person.first_name} {person.last_name}</div>
                  <div className='text-textSecondary text-xs'>{person.email || 'No email'}</div>
                </TableCell>
                <TableCell>{person.employee_number || '—'}</TableCell>
                <TableCell><Badge size='sm' variant={person.employment_status === 'active' ? 'tonalSuccess' : 'secondary'}>{statusLabels[person.employment_status] || person.employment_status}</Badge></TableCell>
                <TableCell>{person.job_title || '—'}</TableCell>
                <TableCell>{person.locationName || '—'}</TableCell>
                <TableCell>{person.divisionName || '—'}</TableCell>
                <TableCell className='text-right'>
                  <Button size='sm' variant='outline' asChild><Link href={`/personnel/${person.id}`}>Open</Link></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No personnel match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default PersonnelList
