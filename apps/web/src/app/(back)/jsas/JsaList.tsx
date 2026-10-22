'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbClipboardList, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type JsaListItem = {
  id: string
  jsa_number: string
  title: string
  status: string
  version: number
  job_title: string | null
  task_name: string | null
  preparedName: string | null
  location_id: string | null
  locationName: string | null
  division_id: string | null
  divisionName: string | null
  updated_at: string
}

const JsaList = ({
  records,
  canCreate,
  statusLabels,
  locations,
  divisions
}: {
  records: JsaListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  locations: Array<{ id: string; label: string }>
  divisions: Array<{ id: string; label: string }>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [locationId, setLocationId] = useState('all')
  const [divisionId, setDivisionId] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return records.filter(record => {
      const matchesSearch =
        !q ||
        record.jsa_number.toLowerCase().includes(q) ||
        record.title.toLowerCase().includes(q) ||
        record.job_title?.toLowerCase().includes(q) ||
        record.task_name?.toLowerCase().includes(q) ||
        record.preparedName?.toLowerCase().includes(q) ||
        record.locationName?.toLowerCase().includes(q)

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && !['superseded', 'retired'].includes(record.status)) ||
        record.status === status

      const matchesLocation = locationId === 'all' || record.location_id === locationId
      const matchesDivision = divisionId === 'all' || record.division_id === divisionId

      return matchesSearch && matchesStatus && matchesLocation && matchesDivision
    })
  }, [records, search, status, locationId, divisionId])

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbClipboardList />
            JSA / JHA
          </h1>
          <p className='text-textSecondary mt-2'>
            Job safety analyses, step hazards, controls, revisions, and field executions.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canCreate ? (
            <Button asChild data-testid='jsa-create'>
              <Link href='/jsas/create'>
                <TbPlus className='mr-2' />
                New JSA
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className='flex flex-col gap-4 pt-6'>
          <div className='grid gap-3 md:grid-cols-4'>
            <div className='relative md:col-span-2'>
              <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
              <Input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder='Search number, title, job, task...'
                className='pl-9'
              />
            </div>
            <select
              value={status}
              onChange={event => setStatus(event.target.value)}
              className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
            >
              <option value='active'>Active (excl. retired)</option>
              <option value='all'>All statuses</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={locationId}
              onChange={event => setLocationId(event.target.value)}
              className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
            >
              <option value='all'>All locations</option>
              {locations.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className='grid gap-3 md:grid-cols-4'>
            <select
              value={divisionId}
              onChange={event => setDivisionId(event.target.value)}
              className='border-input bg-card text-textSecondary h-[38px] w-full rounded-md border px-3'
            >
              <option value='all'>All divisions</option>
              {divisions.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Prepared by</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='text-textSecondary py-10 text-center'>
                    No JSAs match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(record => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <Link
                        href={'/jsas/' + record.id}
                        className='text-primary font-medium hover:underline'
                      >
                        {record.jsa_number}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className='font-medium'>{record.title}</div>
                      <div className='text-textSecondary text-xs'>
                        {[record.job_title, record.task_name].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>
                        {statusLabels[record.status] || record.status}
                      </Badge>
                    </TableCell>
                    <TableCell>v{record.version}</TableCell>
                    <TableCell>{record.preparedName || '—'}</TableCell>
                    <TableCell>{record.locationName || '—'}</TableCell>
                    <TableCell>
                      {new Date(record.updated_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default JsaList
