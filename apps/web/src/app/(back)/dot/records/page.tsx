import type { Metadata } from 'next'
import Link from 'next/link'
import { TbPlus } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'

import DotHeader, { allowedFrom } from '@/components/dot/DotHeader'
import DotStatusPill from '@/components/dot/DotStatusPill'
import { DOT_RECORD_CATEGORY_LABELS, getScopedDotRecords, personName } from '@/lib/forgeDot'
import { formatUsDate } from '@/lib/forgeDotRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'DOT Records' }

const pill = (active: boolean) =>
  'rounded-full border px-3 py-1 text-sm ' + (active ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted')

const DotRecordsPage = async ({ searchParams }: { searchParams: Promise<{ category?: string; status?: string }> }) => {
  const context = await requireTenantPermission('dot.view')
  const allowed = allowedFrom(context)
  const { category, status } = await searchParams

  const records = (
    await getScopedDotRecords({ organizationId: context.activeOrganization.id, userId: context.user.id, permission: context.permission })
  )
    .filter((record: any) => !category || record.category === category)
    .filter((record: any) => !status || record.status === status)

  const href = (next: { category?: string; status?: string }) => {
    const merged = { category, status, ...next }
    const query = new URLSearchParams()

    if (merged.category) query.set('category', merged.category)
    if (merged.status) query.set('status', merged.status)

    const text = query.toString()

    return '/dot/records' + (text ? '?' + text : '')
  }

  return (
    <div className='flex flex-col gap-6'>
      <DotHeader
        active='records'
        allowed={allowed}
        actions={
          allowed('dot.edit') ? (
            <Button asChild>
              <Link href={'/dot/records/new' + (category ? '?category=' + category : '')}>
                <TbPlus />
                New Record
              </Link>
            </Button>
          ) : null
        }
      />

      <div className='flex flex-wrap gap-2'>
        <Link className={pill(!category)} href={href({ category: '' })}>
          All categories
        </Link>
        {Object.entries(DOT_RECORD_CATEGORY_LABELS).map(([key, label]) => (
          <Link key={key} className={pill(category === key)} href={href({ category: key })}>
            {label}
          </Link>
        ))}
        <span className='mx-2' />
        <Link className={pill(!status)} href={href({ status: '' })}>
          Any status
        </Link>
        <Link className={pill(status === 'open')} href={href({ status: 'open' })}>
          Open
        </Link>
        <Link className={pill(status === 'closed')} href={href({ status: 'closed' })}>
          Closed
        </Link>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Record</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length ? (
              records.map((record: any) => (
                <TableRow key={record.id} data-dot-record={record.record_number}>
                  <TableCell>
                    <Link className='font-semibold hover:underline' href={'/dot/records/' + record.id}>
                      {record.title}
                    </Link>
                    <div className='text-textSecondary text-xs'>{record.record_number}</div>
                  </TableCell>
                  <TableCell>{DOT_RECORD_CATEGORY_LABELS[record.category] || record.category}</TableCell>
                  <TableCell>{formatUsDate(record.record_date) || '—'}</TableCell>
                  <TableCell>{record.forge_personnel ? personName(record.forge_personnel) : '—'}</TableCell>
                  <TableCell>{record.locations?.name || '—'}</TableCell>
                  <TableCell>
                    <DotStatusPill tone={record.status === 'open' ? 'pending' : 'muted'}>{record.status === 'open' ? 'Open' : 'Closed'}</DotStatusPill>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className='py-10 text-center'>
                  {category || status ? 'No DOT records match these filters.' : 'No DOT records yet.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

export default DotRecordsPage
