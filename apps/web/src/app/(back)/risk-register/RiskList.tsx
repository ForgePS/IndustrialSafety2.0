'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbPlus, TbSearch, TbShield } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type RiskListItem = {
  id: string
  risk_number: string
  title: string
  status: string
  category_key: string | null
  inherent_band_key: string | null
  inherent_score: number | null
  residual_band_key: string | null
  residual_score: number | null
  ownerName: string | null
  location_id: string | null
  locationName: string | null
  division_id: string | null
  divisionName: string | null
  updated_at: string
}

const RiskList = ({
  records,
  canCreate,
  statusLabels,
  categoryLabels,
  locations,
  divisions
}: {
  records: RiskListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  categoryLabels: Record<string, string>
  locations: Array<{ id: string; label: string }>
  divisions: Array<{ id: string; label: string }>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')
  const [band, setBand] = useState('all')
  const [locationId, setLocationId] = useState('all')
  const [divisionId, setDivisionId] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return records.filter(record => {
      const matchesSearch =
        !q ||
        record.risk_number.toLowerCase().includes(q) ||
        record.title.toLowerCase().includes(q) ||
        record.ownerName?.toLowerCase().includes(q) ||
        record.locationName?.toLowerCase().includes(q) ||
        record.divisionName?.toLowerCase().includes(q)

      const matchesStatus =
        status === 'all' ||
        (status === 'open' && record.status !== 'closed') ||
        record.status === status

      const matchesBand =
        band === 'all' ||
        record.inherent_band_key === band ||
        record.residual_band_key === band

      const matchesLocation = locationId === 'all' || record.location_id === locationId
      const matchesDivision = divisionId === 'all' || record.division_id === divisionId

      return matchesSearch && matchesStatus && matchesBand && matchesLocation && matchesDivision
    })
  }, [records, search, status, band, locationId, divisionId])

  const bands = Array.from(
    new Set(
      records
        .flatMap(item => [item.inherent_band_key, item.residual_band_key])
        .filter(Boolean) as string[]
    )
  ).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbShield />
            Risk Register
          </h1>
          <p className='text-textSecondary mt-2'>
            Hazard identification, inherent/residual assessment, controls, and treatments.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='outline' asChild>
            <Link href='/risk-register/matrices'>Risk Matrices</Link>
          </Button>
          {canCreate ? (
            <Button asChild>
              <Link href='/risk-register/create'>
                <TbPlus />
                Create Risk
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5'>
          <div className='relative xl:col-span-2'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search risks...'
              className='pl-10'
            />
          </div>
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='open'>Open (not closed)</option>
            <option value='all'>All statuses</option>
            {['draft', 'assessment', 'review', 'active', 'closed'].map(
              item => (
                <option key={item} value={item}>
                  {statusLabels[item] || item}
                </option>
              )
            )}
          </select>
          <select
            value={band}
            onChange={event => setBand(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All bands</option>
            {bands.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={locationId}
            onChange={event => setLocationId(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All locations</option>
            {locations.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={divisionId}
            onChange={event => setDivisionId(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3 md:col-span-2 xl:col-span-1'
          >
            <option value='all'>All divisions</option>
            {divisions.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Inherent</TableHead>
              <TableHead>Residual</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? (
              filtered.map(record => (
                <TableRow key={record.id}>
                  <TableCell>
                    <div className='font-semibold'>{record.title}</div>
                    <div className='text-textSecondary text-xs'>
                      {record.risk_number}
                      {record.category_key
                        ? ' · ' + (categoryLabels[record.category_key] || record.category_key)
                        : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      size='sm'
                      variant={
                        record.status === 'closed'
                          ? 'tonalSuccess'
                          : record.status === 'review'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {statusLabels[record.status] || record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {record.inherent_band_key ? (
                      <Badge
                        size='sm'
                        variant={
                          record.inherent_band_key === 'critical' ||
                          record.inherent_band_key === 'high'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {record.inherent_band_key}
                        {record.inherent_score != null ? ' · ' + record.inherent_score : ''}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {record.residual_band_key ? (
                      <Badge size='sm' variant='secondary'>
                        {record.residual_band_key}
                        {record.residual_score != null ? ' · ' + record.residual_score : ''}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{record.ownerName || '—'}</TableCell>
                  <TableCell>{record.locationName || '—'}</TableCell>
                  <TableCell>{new Date(record.updated_at).toLocaleString()}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={'/risk-register/' + record.id}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center'>
                  No Risks match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default RiskList
