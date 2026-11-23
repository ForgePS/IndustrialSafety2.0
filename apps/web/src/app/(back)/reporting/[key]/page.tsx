import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TbArrowLeft } from 'react-icons/tb'
import { Card, CardContent } from '@repo/ui/components/ui/card'

import ReportRunView from '@/components/reporting/ReportRunView'
import SaveReportForm from '@/components/reporting/SaveReportForm'
import { reportMeta } from '@/lib/forgeReportCatalog'
import { can, reportFor, reportLocations, runReport } from '@/lib/forgeReportRun'
import { visibleColumns } from '@/lib/forgeReportRules'
import { loadSavedReport } from '@/lib/forgeSavedReports'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Report' }

/**
 * Port slice 13: run one built-in report. `?saved=<id>` edits a saved report's filters, and Save then updates it
 * (owner only).
 */
const ReportPage = async ({
  params,
  searchParams
}: {
  params: Promise<{ key: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) => {
  const context = await requireTenantPermission('reporting.view')
  const { key } = await params
  const raw = await searchParams
  const reportKey = decodeURIComponent(key)
  const report = reportFor(context.access, reportKey)

  if (!report) notFound()

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const savedId = typeof raw.saved === 'string' ? raw.saved : null
  const saved = savedId ? await loadSavedReport(organizationId, userId, savedId, context.access) : null
  const editing = saved && saved.owner_user_id === userId && saved.report_key === report.key ? saved : null

  const [run, locations] = await Promise.all([
    runReport({ organizationId, userId, reportKey: report.key, rawParams: raw, kind: 'view', access: context.access, savedReportId: editing?.id }),
    reportLocations(organizationId)
  ])

  const visible = visibleColumns(report.columns, permission => can(context.access, permission))

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <Link href={editing ? '/reporting/saved/' + editing.id : '/reporting'} className='text-textSecondary mb-2 inline-flex items-center gap-1 text-sm hover:underline'>
          <TbArrowLeft />
          {editing ? editing.name : 'Report library'}
        </Link>
        <h1 className='text-textPrimary text-3xl font-bold' data-report-title>
          {report.name}
        </h1>
        <p className='text-textSecondary mt-2 max-w-3xl'>{report.description}</p>
      </div>
      {run.ok ? (
        <ReportRunView
          meta={reportMeta(report)}
          params={run.params}
          result={run.result}
          visible={visible}
          locations={locations}
          action={'/reporting/' + report.key}
          exportPath={'/reporting/' + report.key + '/export'}
          canExport={can(context.access, 'reporting.export')}
          hidden={editing ? { saved: editing.id } : undefined}
        >
          <SaveReportForm
            reportKey={report.key}
            params={run.params as Record<string, unknown>}
            canShare={can(context.access, 'reporting.share')}
            existing={editing ? { id: editing.id, name: editing.name, description: editing.description, shared: editing.visibility === 'organization' } : undefined}
          />
        </ReportRunView>
      ) : (
        <Card>
          <CardContent className='p-6 text-sm' role='alert'>
            {run.message}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ReportPage
