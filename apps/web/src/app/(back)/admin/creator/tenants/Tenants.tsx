'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TbEdit, TbPlus, TbSearch } from 'react-icons/tb'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

export type TenantListItem = {
  id: string
  name: string
  slug: string
  status: string
  primary_contact_email: string | null
  locationCount: number
  memberCount: number
  planName: string | null
  subscriptionStatus: string | null
}

const statusLabel = (status?: string | null) =>
  (status || 'unassigned').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')

const Tenants = ({ tenants }: { tenants: TenantListItem[] }) => {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return tenants.filter(tenant => {
      const matchesSearch =
        !query ||
        tenant.name.toLowerCase().includes(query) ||
        tenant.slug.toLowerCase().includes(query) ||
        tenant.primary_contact_email?.toLowerCase().includes(query)

      const effectiveStatus = tenant.subscriptionStatus || tenant.status
      return matchesSearch && (status === 'all' || effectiveStatus === status)
    })
  }, [search, status, tenants])

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Tenants</h1>
          <p className='text-textSecondary mt-2'>Provision and operate every company on Forge Industrial Safety 2.0.</p>
        </div>
        <Button asChild><Link href='/admin/creator/tenants/create'><TbPlus />Create Tenant</Link></Button>
      </div>

      <Card>
        <CardContent className='grid gap-4 p-5 md:grid-cols-[1fr_220px]'>
          <div className='relative'>
            <TbSearch className='text-textSecondary absolute left-3 top-1/2 -translate-y-1/2' />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder='Search tenants, slugs or contacts...' className='pl-10' />
          </div>
          <select value={status} onChange={event => setStatus(event.target.value)} className='border-input bg-card text-textSecondary h-[38px] rounded-md border px-3'>
            <option value='all'>All statuses</option>
            <option value='trial'>Trial</option>
            <option value='onboarding'>Onboarding</option>
            <option value='active'>Active</option>
            <option value='past_due'>Past Due</option>
            <option value='suspended'>Suspended</option>
            <option value='canceled'>Canceled</option>
            <option value='archived'>Archived</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Locations</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Primary Contact</TableHead>
              <TableHead className='text-right'>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length ? filtered.map(tenant => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <Link href={`/admin/creator/tenants/${tenant.id}`} className='text-textPrimary font-semibold hover:underline'>{tenant.name}</Link>
                  <div className='text-textSecondary text-xs'>{tenant.slug}</div>
                </TableCell>
                <TableCell>
                  <Badge size='sm' variant={(tenant.subscriptionStatus || tenant.status) === 'active' ? 'tonalSuccess' : 'secondary'}>
                    {statusLabel(tenant.subscriptionStatus || tenant.status)}
                  </Badge>
                </TableCell>
                <TableCell>{tenant.planName || 'Custom / unassigned'}</TableCell>
                <TableCell>{tenant.locationCount}</TableCell>
                <TableCell>{tenant.memberCount}</TableCell>
                <TableCell>{tenant.primary_contact_email || '—'}</TableCell>
                <TableCell>
                  <div className='flex justify-end gap-2'>
                    <Button size='sm' variant='outline' asChild><Link href={`/admin/creator/tenants/${tenant.id}`}>Open</Link></Button>
                    <Button size='sm' variant='ghost' asChild><Link href={`/admin/creator/tenants/${tenant.id}/edit`}><TbEdit /></Link></Button>
                  </div>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={7} className='py-10 text-center'>No tenants match the current filters.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default Tenants
