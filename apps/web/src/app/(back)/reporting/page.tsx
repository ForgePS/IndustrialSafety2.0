import type { Metadata } from 'next'
import Link from 'next/link'
import { TbReportAnalytics } from 'react-icons/tb'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import ReportingTabs from '@/components/reporting/ReportingTabs'
import { reportsFor } from '@/lib/forgeReportRun'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Reporting' }

/** Port slice 13: the report library. Only the reports for modules the person can see are listed. */
const ReportingPage = async ({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => {
  const context = await requireTenantPermission('reporting.view')
  const query = await searchParams

  const search = String(Array.isArray(query.q) ? query.q[0] : query.q || '')
    .trim()
    .toLowerCase()

  const reports = reportsFor(context.access).filter(
    report => !search || [report.name, report.description, report.module].some(text => text.toLowerCase().includes(search))
  )

  const modules = [...new Set(reports.map(report => report.module))]

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbReportAnalytics />
          Reporting
        </h1>
        <p className='text-textSecondary mt-2'>Run a report, filter and group it, then download it or save it to run again or send on a schedule.</p>
      </div>
      <ReportingTabs current='library' />
      <form method='get' action='/reporting' className='flex gap-2'>
        <input
          type='search'
          name='q'
          defaultValue={search}
          placeholder='Search reports'
          aria-label='Search reports'
          className='bg-background w-full max-w-sm rounded-md border px-3 py-2 text-sm'
        />
      </form>
      {modules.length ? (
        modules.map(module => (
          <section key={module} className='flex flex-col gap-3' data-report-module={module}>
            <h2 className='text-textPrimary text-lg font-semibold'>{module}</h2>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
              {reports
                .filter(report => report.module === module)
                .map(report => (
                  <Link key={report.key} href={'/reporting/' + report.key} className='group' data-report-card={report.key}>
                    <Card className='group-hover:border-primary h-full transition-colors'>
                      <CardHeader>
                        <CardTitle className='text-base'>{report.name}</CardTitle>
                        <CardDescription>{report.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
            </div>
          </section>
        ))
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>
            {search ? 'No reports match that search.' : "There aren't any reports for the modules you can see."}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ReportingPage
