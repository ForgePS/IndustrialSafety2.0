'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbPlus, TbQrcode, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type QrListItem = {
  id: string
  qr_number: string
  name: string
  description: string | null
  status: string
  default_action: string
  scan_count: number
  last_scanned_at: string | null
  targetAssetName: string | null
  targetAssetNumber: string | null
}

const QrList = ({
  codes,
  canCreate,
  statusLabels,
  actionLabels
}: {
  codes: QrListItem[]
  canCreate: boolean
  statusLabels: Record<string, string>
  actionLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return codes.filter(code => {
      const matches =
        !q ||
        code.qr_number.toLowerCase().includes(q) ||
        code.name.toLowerCase().includes(q) ||
        code.description?.toLowerCase().includes(q) ||
        code.targetAssetName?.toLowerCase().includes(q) ||
        code.targetAssetNumber?.toLowerCase().includes(q)

      return matches && (status === 'all' || code.status === status)
    })
  }, [codes, search, status])

  const statuses = Array.from(new Set(codes.map(code => code.status))).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'><TbQrcode />QR Management</h1>
          <p className='text-textSecondary mt-2'>Managed QR codes connected to Forge assets, workflows, and scan history.</p>
        </div>
        {canCreate ? <Button asChild><Link href='/qr/create'><TbPlus />Create QR Code</Link></Button> : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search QR codes...' className='pl-10' />
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
              <TableHead>QR Code</TableHead>
              <TableHead>Linked Asset</TableHead>
              <TableHead>Default Action</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Scans</TableHead>
              <TableHead>Last Scan</TableHead>
              <TableHead className='text-right'>Manage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(code => (
              <TableRow key={code.id}>
                <TableCell>
                  <div className='font-semibold'>{code.name}</div>
                  <div className='text-textSecondary text-xs'>{code.qr_number}</div>
                </TableCell>
                <TableCell>
                  <div>{code.targetAssetName || 'Missing target'}</div>
                  <div className='text-textSecondary text-xs'>{code.targetAssetNumber || '—'}</div>
                </TableCell>
                <TableCell>{actionLabels[code.default_action] || code.default_action}</TableCell>
                <TableCell>
                  <Badge size='sm' variant={code.status === 'active' ? 'tonalSuccess' : 'secondary'}>
                    {statusLabels[code.status] || code.status}
                  </Badge>
                </TableCell>
                <TableCell>{code.scan_count}</TableCell>
                <TableCell>{code.last_scanned_at ? new Date(code.last_scanned_at).toLocaleString() : 'Never'}</TableCell>
                <TableCell className='text-right'><Button size='sm' variant='outline' asChild><Link href={'/qr/' + code.id}>Open</Link></Button></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No managed QR codes match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default QrList
