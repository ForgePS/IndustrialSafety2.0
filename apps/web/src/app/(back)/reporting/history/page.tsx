import type { Metadata } from 'next'
import Link from 'next/link'
import { TbReportAnalytics } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ReportingTabs from '@/components/reporting/ReportingTabs'
import { getReportDefinition } from '@/lib/forgeReportCatalog'
import { recentRuns } from '@/lib/forgeReportRun'
import { humanizeKey } from '@/lib/forgeReportRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Report history' }

const KIND: Record<string, string> = { view: 'Viewed', csv: 'CSV download', pdf: 'PDF download', scheduled: 'Scheduled delivery' }

/** Port slice 13: your last 100 report runs, including refusals and failures. */
const ReportHistoryPage = async () => {
  const context = await requireTenantPermission('reporting.view')
  const runs = await recentRuns(context.activeOrganization.id, context.user.id)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbReportAnalytics />
          Report history
        </h1>
        <p className='text-textSecondary mt-2'>Your last 100 runs, downloads and scheduled deliveries.</p>
      </div>
      <ReportingTabs current='history' />
      {runs.length ? (
        <Card>
          <CardContent className='overflow-x-auto p-0'>
            <table className='w-full border-collapse text-sm' data-report-history>
              <thead>
                <tr className='border-b text-left'>
                  <th className='px-4 py-2 font-semibold'>When (UTC)</th>
                  <th className='px-4 py-2 font-semibold'>Report</th>
                  <th className='px-4 py-2 font-semibold'>What</th>
                  <th className='px-4 py-2 font-semibold'>Result</th>
                  <th className='px-4 py-2 text-right font-semibold'>Records</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const report = getReportDefinition(run.report_key)

                  return (
                    <tr key={run.id} className='border-b' data-report-run={run.report_key}>
                      <td className='px-4 py-2 whitespace-nowrap'>{String(run.created_at).slice(0, 16).replace('T', ' ')}</td>
                      <td className='px-4 py-2'>
                        {run.saved_report_id && run.forge_saved_reports?.name ? (
                          <Link href={'/reporting/saved/' + run.saved_report_id} className='text-primary hover:underline'>
                            {run.forge_saved_reports.name}
                          </Link>
                        ) : report ? (
                          <Link href={'/reporting/' + report.key} className='text-primary hover:underline'>
                            {report.name}
                          </Link>
                        ) : (
                          run.report_key
                        )}
                      </td>
                      <td className='px-4 py-2'>{KIND[run.kind] || run.kind}</td>
                      <td className={'px-4 py-2 ' + (run.status === 'succeeded' ? '' : 'text-red-600')}>{run.status === 'denied' ? 'No access' : humanizeKey(run.status)}</td>
                      <td className='px-4 py-2 text-right tabular-nums'>{run.row_count ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='text-textSecondary p-6 text-center text-sm'>No reports run yet.</CardContent>
        </Card>
      )}
    </div>
  )
}

export default ReportHistoryPage
