'use client'

import { useEffect, useMemo, useState } from 'react'

import Link from 'next/link'
import { TbArchive, TbPlus, TbSearch, TbSitemap, TbUsers } from 'react-icons/tb'
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
  jobTitleText: string | null
  positionName: string | null
  email: string | null
  locationId: string | null
  locationName: string | null
  divisionName: string | null
  departmentName: string | null
  isDotDriver: boolean
  isCompanyDriver: boolean
  archivedAt: string | null
}

export type PersonnelListFilters = {
  q: string
  status: string
  location: string
  sort: 'last' | 'first'
}

const NO_LOCATION = 'none'

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

const PersonnelList = ({
  personnel,
  canCreate,
  canConfigure = false,
  statusLabels,
  view = 'active',
  initialFilters = { q: '', status: 'all', location: 'all', sort: 'last' }
}: {
  personnel: PersonnelListItem[]
  canCreate: boolean
  canConfigure?: boolean
  statusLabels: Record<string, string>
  view?: 'active' | 'archived'
  initialFilters?: PersonnelListFilters
}) => {
  const [search, setSearch] = useState(initialFilters.q)
  const [status, setStatus] = useState(initialFilters.status)
  const [location, setLocation] = useState(initialFilters.location)
  const [sort, setSort] = useState<PersonnelListFilters['sort']>(initialFilters.sort)

  // Keep filters in the URL so a filtered directory can be linked or bookmarked.
  useEffect(() => {
    const params = new URLSearchParams()

    if (view === 'archived') params.set('view', 'archived')
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (location !== 'all') params.set('location', location)
    if (sort !== 'last') params.set('sort', sort)

    const query = params.toString()
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`

    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', next)
  }, [view, search, status, location, sort])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const matches = personnel.filter(person => {
      const matchesText =
        !q ||
        `${person.first_name} ${person.last_name}`.toLowerCase().includes(q) ||
        `${person.last_name} ${person.first_name}`.toLowerCase().includes(q) ||
        person.employee_number?.toLowerCase().includes(q) ||
        person.job_title?.toLowerCase().includes(q) ||
        person.jobTitleText?.toLowerCase().includes(q) ||
        person.positionName?.toLowerCase().includes(q) ||
        person.email?.toLowerCase().includes(q) ||
        person.locationName?.toLowerCase().includes(q) ||
        person.divisionName?.toLowerCase().includes(q) ||
        person.departmentName?.toLowerCase().includes(q)

      const matchesLocation =
        location === 'all' || (location === NO_LOCATION ? !person.locationId : person.locationId === location)

      return matchesText && matchesLocation && (status === 'all' || person.employment_status === status)
    })

    return matches.sort((a, b) =>
      sort === 'first'
        ? compareText(a.first_name, b.first_name) || compareText(a.last_name, b.last_name)
        : compareText(a.last_name, b.last_name) || compareText(a.first_name, b.first_name)
    )
  }, [personnel, search, status, location, sort])

  const statuses = Array.from(new Set(personnel.map(person => person.employment_status))).sort()

  const locations = Array.from(
    new Map(
      personnel
        .filter(person => person.locationId)
        .map(person => [person.locationId as string, person.locationName || 'Unnamed Location'])
    )
  ).sort((a, b) => compareText(a[1], b[1]))

  const hasUnassigned = personnel.some(person => !person.locationId)
  const archived = view === 'archived'

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>{archived ? 'Archived Personnel' : 'Personnel'}</h1>
          <p className='text-textSecondary mt-2'>
            {archived
              ? 'People removed from the active roster. Open a record to restore it.'
              : 'Personnel records visible within your assigned access scope.'}
          </p>
        </div>
        <div className='flex flex-wrap gap-3'>
          {archived ? (
            <Button variant='outline' asChild>
              <Link href='/personnel' data-testid='personnel-view-active'><TbUsers />Active Roster</Link>
            </Button>
          ) : (
            <Button variant='outline' asChild>
              <Link href='/personnel?view=archived' data-testid='personnel-view-archived'><TbArchive />Archived Personnel</Link>
            </Button>
          )}
          {canConfigure ? (
            <Button variant='outline' asChild>
              <Link href='/personnel/structure'><TbSitemap />Departments &amp; Positions</Link>
            </Button>
          ) : null}
          {canCreate && !archived ? (
            <Button asChild>
              <Link href='/personnel/create'><TbPlus />Add Personnel</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_200px_200px_180px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search name, number, department, position...'
              aria-label='Search personnel'
              className='pl-10'
            />
          </div>
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            aria-label='Filter by status'
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All statuses</option>
            {statuses.map(item => <option key={item} value={item}>{statusLabels[item] || item}</option>)}
          </select>
          <select
            value={location}
            onChange={event => setLocation(event.target.value)}
            aria-label='Filter by location'
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All locations</option>
            {locations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            {hasUnassigned ? <option value={NO_LOCATION}>No location</option> : null}
          </select>
          <select
            value={sort}
            onChange={event => setSort(event.target.value === 'first' ? 'first' : 'last')}
            aria-label='Sort personnel'
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='last'>Last name (A-Z)</option>
            <option value='first'>First name (A-Z)</option>
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
              <TableHead>Department</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Division</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(person => (
              <TableRow key={person.id} data-testid='personnel-row'>
                <TableCell>
                  <div className='text-textPrimary font-semibold' data-testid='personnel-row-name'>
                    {sort === 'first' ? `${person.first_name} ${person.last_name}` : `${person.last_name}, ${person.first_name}`}
                  </div>
                  <div className='text-textSecondary text-xs'>{person.email || 'No email'}</div>
                  {person.isDotDriver || person.isCompanyDriver || person.archivedAt ? (
                    <div className='mt-1 flex flex-wrap gap-1'>
                      {person.archivedAt ? <Badge size='sm' variant='secondary'>Archived</Badge> : null}
                      {person.isDotDriver ? <Badge size='sm' variant='tonalPrimary' data-testid='badge-dot-driver'>DOT Driver</Badge> : null}
                      {person.isCompanyDriver ? <Badge size='sm' variant='outline' data-testid='badge-company-driver'>Company Driver</Badge> : null}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell>{person.employee_number || '—'}</TableCell>
                <TableCell><Badge size='sm' variant={person.employment_status === 'active' ? 'tonalSuccess' : 'secondary'}>{statusLabels[person.employment_status] || person.employment_status}</Badge></TableCell>
                <TableCell>{person.job_title || '—'}</TableCell>
                <TableCell>{person.departmentName || '—'}</TableCell>
                <TableCell>{person.locationName || '—'}</TableCell>
                <TableCell>{person.divisionName || '—'}</TableCell>
                <TableCell className='text-right'>
                  <Button size='sm' variant='outline' asChild><Link href={`/personnel/${person.id}`}>Open</Link></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={8} className='py-10 text-center'>{archived ? 'No archived personnel match the current filters.' : 'No personnel match the current filters.'}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default PersonnelList
