'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type AssetListItem = {
  id: string
  asset_number: string
  name: string
  asset_type: string
  status: string
  condition: string
  criticality: string
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  locationName: string | null
  divisionName: string | null
  custodianName: string | null
}

const AssetList = ({
  assets,
  canCreate,
  typeLabels,
  statusLabels,
  conditionLabels,
  criticalityLabels
}: {
  assets: AssetListItem[]
  canCreate: boolean
  typeLabels: Record<string, string>
  statusLabels: Record<string, string>
  conditionLabels: Record<string, string>
  criticalityLabels: Record<string, string>
}) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    return assets.filter(asset => {
      const matches =
        !q ||
        asset.asset_number.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        asset.manufacturer?.toLowerCase().includes(q) ||
        asset.model?.toLowerCase().includes(q) ||
        asset.serial_number?.toLowerCase().includes(q) ||
        asset.locationName?.toLowerCase().includes(q) ||
        asset.divisionName?.toLowerCase().includes(q) ||
        asset.custodianName?.toLowerCase().includes(q) ||
        (typeLabels[asset.asset_type] || asset.asset_type).toLowerCase().includes(q)

      return matches && (status === 'all' || asset.status === status)
    })
  }, [assets, search, status, typeLabels])

  const statuses = Array.from(new Set(assets.map(asset => asset.status))).sort()

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-textPrimary text-3xl font-bold'>Assets & Equipment</h1>
          <p className='text-textSecondary mt-2'>Equipment identity, assignment, condition, maintenance, and meter history within your access scope.</p>
        </div>
        {canCreate ? <Button asChild><Link href='/assets/create'><TbPlus />Add Asset</Link></Button> : null}
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search assets...' className='pl-10' />
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
              <TableHead>Asset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Custodian</TableHead>
              <TableHead className='text-right'>Record</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(asset => (
              <TableRow key={asset.id}>
                <TableCell>
                  <div className='font-semibold'>{asset.name}</div>
                  <div className='text-textSecondary text-xs'>{asset.asset_number}{asset.serial_number ? ' · SN ' + asset.serial_number : ''}</div>
                </TableCell>
                <TableCell>{typeLabels[asset.asset_type] || asset.asset_type}</TableCell>
                <TableCell>
                  <Badge size='sm' variant={asset.status === 'active' ? 'tonalSuccess' : asset.status === 'out_of_service' ? 'destructive' : 'secondary'}>
                    {statusLabels[asset.status] || asset.status}
                  </Badge>
                </TableCell>
                <TableCell>{conditionLabels[asset.condition] || asset.condition}</TableCell>
                <TableCell>{asset.locationName || '—'}</TableCell>
                <TableCell>{asset.custodianName || '—'}</TableCell>
                <TableCell className='text-right'>
                  <Button size='sm' variant='outline' asChild><Link href={'/assets/' + asset.id}>Open</Link></Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No assets match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default AssetList
