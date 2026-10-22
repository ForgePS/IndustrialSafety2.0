'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbPlus, TbSearch, TbTemplate } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type InspectionListItem = {
  id: string
  inspection_number: string
  status: string
  result: string | null
  inspection_date: string
  templateName: string | null
  inspectionType: string | null
  locationName: string | null
  divisionName: string | null
}

const InspectionList = ({
  inspections,
  canCreate,
  canManageTemplates,
  statusLabels,
  resultLabels,
  typeLabels
}: {
  inspections: InspectionListItem[]
  canCreate: boolean
  canManageTemplates: boolean
  statusLabels: Record<string, string>
  resultLabels: Record<string, string>
  typeLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return inspections.filter(item => {
      const matches =
        !q ||
        item.inspection_number.toLowerCase().includes(q) ||
        item.templateName?.toLowerCase().includes(q) ||
        item.locationName?.toLowerCase().includes(q) ||
        item.divisionName?.toLowerCase().includes(q) ||
        (item.inspectionType ? (typeLabels[item.inspectionType] || item.inspectionType).toLowerCase().includes(q) : false)

      return matches && (status === 'all' || item.status === status)
    })
  }, [inspections, search, status, typeLabels])

  const statuses = Array.from(new Set(inspections.map(item => item.status))).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Inspections</h1>
          <p className='text-textSecondary mt-2'>Template-driven inspections, findings, and corrective actions within your access scope.</p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {canManageTemplates ? (
            <Button variant='outline' asChild><Link href='/inspections/templates'><TbTemplate />Templates</Link></Button>
          ) : null}
          {canCreate ? (
            <Button asChild><Link href='/inspections/create'><TbPlus />New Inspection</Link></Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search inspections...' className='pl-10' />
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
              <TableHead>Inspection</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className='font-semibold'>{item.inspection_number}</div>
                  <div className='text-textSecondary text-xs'>{item.inspectionType ? typeLabels[item.inspectionType] || item.inspectionType : '—'}</div>
                </TableCell>
                <TableCell>{item.templateName || '—'}</TableCell>
                <TableCell><Badge size='sm' variant={item.status === 'approved' || item.status === 'closed' ? 'tonalSuccess' : 'secondary'}>{statusLabels[item.status] || item.status}</Badge></TableCell>
                <TableCell>{item.result ? resultLabels[item.result] || item.result : '—'}</TableCell>
                <TableCell>{item.inspection_date}</TableCell>
                <TableCell>{item.locationName || '—'}</TableCell>
                <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={'/inspections/' + item.id}>Open</Link></Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No inspections match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default InspectionList
