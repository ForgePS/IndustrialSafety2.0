'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbLock, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type LotoListItem = {
  id: string
  procedure_number: string
  title: string
  status: string
  revision_number: number
  next_review_date: string | null
  effective_date: string | null
  assetName: string | null
  assetNumber: string | null
  locationName: string | null
  divisionName: string | null
}

const LotoList = ({
  procedures,
  canCreate,
  statusLabels
}: {
  procedures: LotoListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return procedures.filter(procedure => {
      const matches =
        !q ||
        procedure.procedure_number.toLowerCase().includes(q) ||
        procedure.title.toLowerCase().includes(q) ||
        procedure.assetName?.toLowerCase().includes(q) ||
        procedure.assetNumber?.toLowerCase().includes(q) ||
        procedure.locationName?.toLowerCase().includes(q) ||
        procedure.divisionName?.toLowerCase().includes(q)

      return matches && (status === 'all' || procedure.status === status)
    })
  }, [procedures, search, status])

  const statuses = Array.from(new Set(procedures.map(item => item.status))).sort()
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'><TbLock />Lockout / Tagout</h1>
          <p className='text-textSecondary mt-2'>Equipment-specific hazardous energy-control procedures, reviews, revision history, and field-use records.</p>
        </div>
        {canCreate ? <Button asChild><Link href='/loto/create'><TbPlus />Create Procedure</Link></Button> : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search LOTO procedures...' className='pl-10' />
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
              <TableHead>Procedure</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Revision</TableHead>
              <TableHead>Next Review</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(procedure => {
              const overdue = Boolean(
                procedure.status === 'approved' &&
                procedure.next_review_date &&
                procedure.next_review_date < today
              )

              return (
                <TableRow key={procedure.id}>
                  <TableCell>
                    <div className='font-semibold'>{procedure.title}</div>
                    <div className='text-textSecondary text-xs'>{procedure.procedure_number}</div>
                  </TableCell>
                  <TableCell>
                    <div>{procedure.assetName || 'Missing asset'}</div>
                    <div className='text-textSecondary text-xs'>{procedure.assetNumber || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      size='sm'
                      variant={
                        procedure.status === 'approved'
                          ? 'tonalSuccess'
                          : procedure.status === 'retired'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {statusLabels[procedure.status] || procedure.status}
                    </Badge>
                  </TableCell>
                  <TableCell>Rev {procedure.revision_number}</TableCell>
                  <TableCell>
                    <span className={overdue ? 'text-destructive font-semibold' : ''}>
                      {procedure.next_review_date || '—'}
                    </span>
                    {overdue ? <div className='text-destructive text-xs'>Overdue</div> : null}
                  </TableCell>
                  <TableCell>{procedure.locationName || '—'}</TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='outline' asChild><Link href={'/loto/' + procedure.id}>Open</Link></Button>
                  </TableCell>
                </TableRow>
              )
            }) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No LOTO procedures match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default LotoList
