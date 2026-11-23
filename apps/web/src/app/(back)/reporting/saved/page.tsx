import type { Metadata } from 'next'
import Link from 'next/link'
import { TbReportAnalytics } from 'react-icons/tb'
import { createServiceRoleClient } from '@repo/supabase/server'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ReportingTabs from '@/components/reporting/ReportingTabs'
import { getReportDefinition } from '@/lib/forgeReportCatalog'
import { describeSchedule } from '@/lib/forgeReportRules'
import { listSavedReports } from '@/lib/forgeSavedReports'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Saved reports' }

/** Port slice 13: your saved reports, and the ones shared with the company that you can run. */
const SavedReportsPage = async () => {
  const context = await requireTenantPermission('reporting.view')
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const saved = await listSavedReports(organizationId, userId, context.access)

  const { data: schedules } = saved.length
    ? await (createServiceRoleClient() as any)
        .from('forge_report_schedules')
        .select('saved_report_id, frequency, hour, weekday, monthday, timezone, enabled')
        .in(
          'saved_report_id',
          saved.map(row => row.id)
        )
    : { data: [] }

  const scheduleFor = new Map<string, any>((schedules || []).map((row: any) => [row.saved_report_id, row]))
  const mine = saved.filter(row => row.owner_user_id === userId)
  const shared = saved.filter(row => row.owner_user_id !== userId)

  const list = (rows: typeof saved, empty: string, testId: string) =>
    rows.length ? (
      <Card>
        <CardContent className='overflow-x-auto p-0'>
          <table className='w-full border-collapse text-sm' data-saved-reports={testId}>
            <thead>
              <tr className='border-b text-left'>
                <th className='px-4 py-2 font-semibold'>Name</th>
                <th className='px-4 py-2 font-semibold'>Report</th>
                <th className='px-4 py-2 font-semibold'>Shared</th>
                <th className='px-4 py-2 font-semibold'>Schedule</th>
                <th className='px-4 py-2 font-semibold'>Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const schedule = scheduleFor.get(row.id)

                return (
                  <tr key={row.id} className='border-b' data-saved-report={row.name}>
                    <td className='px-4 py-2'>
                      <Link href={'/reporting/saved/' + row.id} className='text-primary font-medium hover:underline'>
                        {row.name}
                      </Link>
                      {row.description ? <div className='text-textSecondary text-xs'>{row.description}</div> : null}
                    </td>
                    <td className='px-4 py-2'>{getReportDefinition(row.report_key)?.name}</td>
                    <td className='px-4 py-2'>{row.visibility === 'organization' ? 'Company' : 'Only you'}</td>
                    <td className='px-4 py-2'>{schedule ? (schedule.enabled ? describeSchedule(schedule) : 'Paused') : '—'}</td>
                    <td className='px-4 py-2'>{row.owner_user_id === userId ? 'You' : row.ownerName}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    ) : (
      <Card>
        <CardContent className='text-textSecondary p-6 text-center text-sm'>{empty}</CardContent>
      </Card>
    )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <h1 className='text-textPrimary flex items-center gap-3 text-3xl font-bold'>
          <TbReportAnalytics />
          Saved reports
        </h1>
        <p className='text-textSecondary mt-2'>Reports saved with their filters. Shared reports show each person only what their own permissions allow.</p>
      </div>
      <ReportingTabs current='saved' />
      <section className='flex flex-col gap-3'>
        <h2 className='text-textPrimary text-lg font-semibold'>Yours</h2>
        {list(mine, 'Run a report from the library and choose Save report to keep it here.', 'mine')}
      </section>
      <section className='flex flex-col gap-3'>
        <h2 className='text-textPrimary text-lg font-semibold'>Shared with the company</h2>
        {list(shared, 'Nothing has been shared with you yet.', 'shared')}
      </section>
    </div>
  )
}

export default SavedReportsPage
