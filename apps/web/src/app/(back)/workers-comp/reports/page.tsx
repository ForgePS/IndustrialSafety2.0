import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { WC_REPORTS } from '@/lib/forgeWorkersCompReports'

export const metadata: Metadata = { title: 'Workers\' Comp Reports' }

const WcReportsPage = async () => {
  const context = await requireTenantPermission('workers_comp.export')
  const canMedical = context.access.effective.some(item => item.permissionKey === 'workers_comp.medical.view' && item.allowed)

  const reports = [
    ...WC_REPORTS.filter(report => !report.medical || canMedical).map(report => ({ ...report, href: `/api/workers-comp/reports/${report.key}` })),
    { key: 'weekly_status', name: 'Weekly Status', description: 'Open cases with this week\'s Thursday update (the weekly email content).', medical: false, href: '/api/workers-comp/weekly' }
  ]

  return (
    <div className='flex min-w-0 flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Workers&apos; Comp</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Reports</h1>
          <p className='text-textSecondary mt-2'>CSV exports limited to the cases you can see. Every export is recorded in the audit log.</p>
        </div>
        <Button variant='tonalDefault' asChild><Link href='/workers-comp'>Back</Link></Button>
      </div>

      <Card>
        <CardContent className='flex flex-col gap-3 p-5' data-testid='wc-reports'>
          {reports.map(report => (
            <div key={report.key} className='flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0'>
              <div>
                <div className='text-textPrimary font-semibold'>{report.name}</div>
                <div className='text-textSecondary text-sm'>{report.description}</div>
              </div>
              <Button size='sm' variant='outline' asChild>
                <a href={report.href} data-testid={`wc-report-${report.key}`}>Download CSV</a>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default WcReportsPage
