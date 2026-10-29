import type { Metadata } from 'next'
import Link from 'next/link'
import { TbBuilding } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui/components/ui/table'
import { cn } from '@repo/ui/lib/utils'

import { requireHelpdeskStaff } from '@/lib/forgeHelpdeskAccess'
import { getTenantSupportSummaries } from '@/lib/forgeHelpdeskConsoleData'

export const metadata: Metadata = { title: 'Tenant Support Health' }

const TenantsPage = async () => {
  await requireHelpdeskStaff()
  const tenants = await getTenantSupportSummaries()

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbBuilding />
          Tenant support health
        </h1>
        <p className='text-textSecondary mt-1'>Open load, SLA breaches, P1s and satisfaction per customer tenant (last 90 days).</p>
      </div>
      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead className='text-right'>Open</TableHead>
                <TableHead className='text-right'>Breached</TableHead>
                <TableHead className='text-right'>P1 open</TableHead>
                <TableHead className='text-right'>Created (90d)</TableHead>
                <TableHead className='text-right'>CSAT</TableHead>
                <TableHead className='text-right'>Active incidents</TableHead>
                <TableHead>Last ticket</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map(t => (
                <TableRow key={t.id}>
                  <TableCell>
                    <Link className='text-primary font-medium hover:underline' href={`/help-desk/console?queue=all&tenant=${t.id}`}>
                      {t.name}
                    </Link>
                    {t.status && t.status !== 'active' ? <span className='text-textSecondary ml-2 text-xs'>({t.status})</span> : null}
                  </TableCell>
                  <TableCell className='text-right'>{t.open}</TableCell>
                  <TableCell className={cn('text-right', t.breached && 'text-destructive font-semibold')}>{t.breached}</TableCell>
                  <TableCell className={cn('text-right', t.p1 && 'text-destructive font-semibold')}>{t.p1}</TableCell>
                  <TableCell className='text-right'>{t.created90}</TableCell>
                  <TableCell className='text-right'>{t.csatAverage ?? '—'}</TableCell>
                  <TableCell className='text-right'>{t.activeIncidents}</TableCell>
                  <TableCell className='text-textSecondary text-xs'>{t.lastTicketAt ? new Date(t.lastTicketAt).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

export default TenantsPage
