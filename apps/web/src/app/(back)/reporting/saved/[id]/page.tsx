import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TbArrowLeft } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'

import DeleteSavedReportButton from '@/components/reporting/DeleteSavedReportButton'
import ReportTable from '@/components/reporting/ReportTable'
import ScheduleForm from '@/components/reporting/ScheduleForm'
import { getReportDefinition } from '@/lib/forgeReportCatalog'
import { can, runReport } from '@/lib/forgeReportRun'
import { describeSchedule, reportParamsQuery } from '@/lib/forgeReportRules'
import { companyMembers, loadSavedReport, loadSchedule } from '@/lib/forgeSavedReports'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Saved report' }

/**
 * Port slice 13: a saved report, run with the viewer's own permissions. The owner can change its filters, share
 * it, schedule it or delete it.
 */
const SavedReportPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const context = await requireTenantPermission('reporting.view')
  const { id } = await params
  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const saved = await loadSavedReport(organizationId, userId, id, context.access)

  if (!saved) notFound()

  const report = getReportDefinition(saved.report_key)!
  const isOwner = saved.owner_user_id === userId

  const run = await runReport({
    organizationId,
    userId,
    reportKey: saved.report_key,
    rawParams: saved.params,
    kind: 'view',
    access: context.access,
    savedReportId: saved.id
  })

  const schedule = await loadSchedule(organizationId, saved.id)
  const canSchedule = isOwner && can(context.access, 'reporting.schedule')
  const members = canSchedule ? await companyMembers(organizationId) : []
  const query = run.ok ? reportParamsQuery(run.params) : ''
  const exportHref = (format: 'csv' | 'pdf') => `/reporting/${report.key}/export?${query}${query ? '&' : ''}format=${format}`

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href='/reporting/saved' className='text-textSecondary mb-2 inline-flex items-center gap-1 text-sm hover:underline'>
          <TbArrowLeft />
          Saved reports
        </Link>
        <h1 className='text-textPrimary text-3xl font-bold' data-report-title>
          {saved.name}
        </h1>
        <p className='text-textSecondary mt-2'>
          {report.name}
          {' · '}
          {saved.visibility === 'organization' ? 'Shared with the company' : 'Only you'}
          {isOwner ? '' : ` · Saved by ${saved.ownerName || 'someone else'}`}
        </p>
        {saved.description ? <p className='text-textSecondary mt-1'>{saved.description}</p> : null}
      </div>

      <div className='flex flex-wrap gap-2'>
        {run.ok && can(context.access, 'reporting.export') ? (
          <>
            <Button asChild>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href={exportHref('csv')} download data-report-export='csv'>
                Download CSV
              </a>
            </Button>
            <Button asChild variant='outline'>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href={exportHref('pdf')} download data-report-export='pdf'>
                Download PDF
              </a>
            </Button>
          </>
        ) : null}
        <Button asChild variant='outline'>
          <Link href={`/reporting/${report.key}?${query}${isOwner ? `${query ? '&' : ''}saved=${saved.id}` : ''}`}>{isOwner ? 'Change filters' : 'Open in the report'}</Link>
        </Button>
        {isOwner ? <DeleteSavedReportButton id={saved.id} name={saved.name} /> : null}
      </div>

      {run.ok ? (
        <>
          <p className='text-textSecondary text-sm' data-report-period>
            {report.usesYear ? `Year ${run.params.year || new Date().getUTCFullYear()}` : report.dateLabel ? `${report.dateLabel}: ${run.result.period.label}` : 'As of today'}
            {run.result.period.from || run.result.period.to ? ` (${run.result.period.from || 'start'} to ${run.result.period.to || 'today'})` : ''}
          </p>
          <ReportTable result={run.result} />
        </>
      ) : (
        <Card>
          <CardContent className='p-6 text-sm' role='alert'>
            {run.message}
          </CardContent>
        </Card>
      )}

      {isOwner ? (
        <Card data-report-schedule>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              {schedule
                ? `${schedule.enabled ? describeSchedule(schedule) : 'Paused'}. ${
                    schedule.enabled ? 'Next: ' + new Date(schedule.next_run_at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC.' : ''
                  }${schedule.last_status ? ` Last run: ${schedule.last_status}${schedule.last_error ? ' (' + schedule.last_error + ')' : ''}.` : ''}`
                : 'Send this report to people in the company on a schedule.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canSchedule ? (
              <ScheduleForm
                savedReportId={saved.id}
                exists={Boolean(schedule)}
                ownerId={userId}
                shared={saved.visibility === 'organization'}
                members={members}
                initial={{
                  frequency: schedule?.frequency || 'weekly',
                  hour: schedule?.hour ?? 7,
                  weekday: schedule?.weekday ?? 1,
                  monthday: schedule?.monthday ?? 1,
                  timezone: schedule?.timezone || '',
                  enabled: schedule?.enabled ?? true,
                  recipients: schedule?.recipients || [userId]
                }}
              />
            ) : (
              <p className='text-textSecondary text-sm'>You need the Schedule Reports permission to send reports on a schedule.</p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default SavedReportPage
