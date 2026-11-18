'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbAlertTriangle, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type CorrectiveActionListItem = {
  id: string
  action_number: string
  title: string
  status: string
  severity: string
  action_type: string
  due_at: string | null
  assigneeName: string | null
  locationName: string | null
  source_type: string
  source_reference: string | null
  linked_task_id: string | null
}

const CorrectiveActionList = ({
  records,
  canCreate,
  statusLabels,
  severityLabels,
  typeLabels
}: {
  records: CorrectiveActionListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  severityLabels: Record<string, string>
  typeLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return records.filter(record => {
      const matchesSearch =
        !q ||
        record.action_number.toLowerCase().includes(q) ||
        record.title.toLowerCase().includes(q) ||
        record.assigneeName?.toLowerCase().includes(q) ||
        record.locationName?.toLowerCase().includes(q) ||
        record.source_type.toLowerCase().includes(q) ||
        record.source_reference?.toLowerCase().includes(q)

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && !['closed','canceled'].includes(record.status)) ||
        record.status === status

      return matchesSearch && matchesStatus
    })
  }, [records, search, status])

  const now = Date.now()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
            <TbAlertTriangle />
            Corrective Actions
          </h1>
          <p className='text-textSecondary mt-2'>
            Corrective and preventive actions, root cause, verification, effectiveness review, and closure.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href='/corrective-actions/create'>
              <TbPlus />
              Create Corrective Action
            </Link>
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
              placeholder='Search Corrective Actions...'
              className='pl-10'
            />
          </div>
          <select
            value={status}
            onChange={event => setStatus(event.target.value)}
            className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'
          >
            <option value='active'>Active</option>
            <option value='all'>All</option>
            {['open','in_progress','pending_verification','verified','closed','canceled'].map(item => (
              <option key={item} value={item}>
                {statusLabels[item] || item}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Corrective Action</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(record => {
              const overdue = Boolean(
                record.due_at &&
                new Date(record.due_at).getTime() < now &&
                !['verified','closed','canceled'].includes(record.status)
              )

              return (
                <TableRow key={record.id}>
                  <TableCell>
                    <div className='font-semibold'>{record.title}</div>
                    <div className='text-textSecondary text-xs'>
                      {record.action_number}
                      {record.source_reference ? ' · ' + record.source_reference : ''}
                    </div>
                  </TableCell>
                  <TableCell>{typeLabels[record.action_type] || record.action_type}</TableCell>
                  <TableCell>
                    <Badge
                      size='sm'
                      variant={
                        record.severity === 'critical' || record.severity === 'high'
                          ? 'destructive'
                          : record.severity === 'moderate'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {severityLabels[record.severity] || record.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      size='sm'
                      variant={
                        record.status === 'closed'
                          ? 'tonalSuccess'
                          : record.status === 'pending_verification'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {statusLabels[record.status] || record.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{record.assigneeName || '—'}</TableCell>
                  <TableCell>{record.locationName || '—'}</TableCell>
                  <TableCell>
                    <span className={overdue ? 'text-destructive font-semibold' : ''}>
                      {record.due_at ? new Date(record.due_at).toLocaleString() : '—'}
                    </span>
                    {overdue ? <div className='text-destructive text-xs'>Overdue</div> : null}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' asChild>
                      <Link href={'/corrective-actions/' + record.id}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            }) : (
              <TableRow>
                <TableCell colSpan={8} className='py-10 text-center'>
                  No Corrective Actions match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default CorrectiveActionList
