'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbEye, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type ObservationListItem = {
  id: string
  observation_number: string
  title: string
  status: string
  observation_type: string
  category_key: string | null
  reporting_mode: string
  reporterLabel: string
  initial_risk_band_key: string | null
  initial_risk_score: number | null
  assigneeName: string | null
  locationName: string | null
  occurred_at: string
}

const ObservationList = ({
  records,
  canCreate,
  statusLabels,
  typeLabels,
  categoryLabels
}: {
  records: ObservationListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  typeLabels: Record<string, string>
  categoryLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [type, setType] = useState('all')
  const [category, setCategory] = useState('all')
  const [riskBand, setRiskBand] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return records.filter(record => {
      const matchesSearch =
        !q ||
        record.observation_number.toLowerCase().includes(q) ||
        record.title.toLowerCase().includes(q) ||
        record.assigneeName?.toLowerCase().includes(q) ||
        record.locationName?.toLowerCase().includes(q) ||
        record.reporterLabel.toLowerCase().includes(q)

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && !['closed', 'no_action'].includes(record.status)) ||
        record.status === status

      const matchesType = type === 'all' || record.observation_type === type
      const matchesCategory = category === 'all' || record.category_key === category
      const matchesRisk = riskBand === 'all' || record.initial_risk_band_key === riskBand

      return matchesSearch && matchesStatus && matchesType && matchesCategory && matchesRisk
    })
  }, [records, search, status, type, category, riskBand])

  const riskBands = Array.from(
    new Set(records.map(item => item.initial_risk_band_key).filter(Boolean) as string[])
  ).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbEye />
            Observations
          </h1>
          <p className='text-textSecondary mt-2'>
            Safety observations, near misses, anonymous reporting, and risk assessment.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href='/observations/create'>
              <TbPlus />
              Create Observation
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5'>
          <div className='relative xl:col-span-2'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder='Search observations...'
              className='pl-10'
            />
          </div>
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='active'>Active</option>
            <option value='all'>All statuses</option>
            {['draft', 'submitted', 'review', 'action_required', 'no_action', 'closed'].map(item => (
              <option key={item} value={item}>
                {statusLabels[item] || item}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={event => setType(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All types</option>
            {['SAFE', 'UNSAFE', 'IMPROVEMENT', 'NEAR_MISS'].map(item => (
              <option key={item} value={item}>
                {typeLabels[item] || item}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={event => setCategory(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='all'>All categories</option>
            {Object.entries(categoryLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={riskBand}
            onChange={event => setRiskBand(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3 md:col-span-2 xl:col-span-1'
          >
            <option value='all'>All risk bands</option>
            {riskBands.map(item => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Observation</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Occurred</TableHead>
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
                      {record.observation_number}
                      {record.category_key
                        ? ' · ' + (categoryLabels[record.category_key] || record.category_key)
                        : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    {typeLabels[record.observation_type] || record.observation_type}
                  </TableCell>
                  <TableCell>
                    <Badge
                      size='sm'
                      variant={
                        record.status === 'closed' || record.status === 'no_action'
                          ? 'tonalSuccess'
                          : record.status === 'action_required'
                            ? 'destructive'
                            : 'outline'
                      }
                    >
                      {statusLabels[record.status] || record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {record.initial_risk_band_key ? (
                      <Badge
                        size='sm'
                        variant={
                          record.initial_risk_band_key === 'critical' ||
                          record.initial_risk_band_key === 'high'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {record.initial_risk_band_key}
                        {record.initial_risk_score != null ? ' · ' + record.initial_risk_score : ''}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{record.reporterLabel}</TableCell>
                  <TableCell>{record.locationName || '—'}</TableCell>
                  <TableCell>{new Date(record.occurred_at).toLocaleString()}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={'/observations/' + record.id}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center'>
                  No Observations match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default ObservationList
