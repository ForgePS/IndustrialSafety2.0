import { TbDownload } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'

import ReportFilters from '@/components/reporting/ReportFilters'
import ReportTable from '@/components/reporting/ReportTable'
import { reportParamsQuery, type ReportColumn, type ReportDefinitionMeta, type ReportParams, type ReportResult } from '@/lib/forgeReportRules'

/** Port slice 13: filters, export buttons and results for one run (a built-in report or a saved one). */
const ReportRunView = ({
  meta,
  params,
  result,
  visible,
  locations,
  action,
  exportPath,
  exportExtra = {},
  canExport,
  hidden,
  children
}: {
  meta: ReportDefinitionMeta
  params: ReportParams
  result: ReportResult
  visible: ReportColumn[]
  locations: { id: string; name: string }[]
  action: string
  exportPath: string
  exportExtra?: Record<string, string>
  canExport: boolean
  hidden?: Record<string, string>
  children?: React.ReactNode
}) => {
  const query = new URLSearchParams(reportParamsQuery(params))

  for (const [key, value] of Object.entries(exportExtra)) query.set(key, value)

  const href = (format: 'csv' | 'pdf') => {
    const withFormat = new URLSearchParams(query)

    withFormat.set('format', format)

    return exportPath + '?' + withFormat.toString()
  }

  return (
    <div className='flex flex-col gap-6'>
      <ReportFilters action={action} meta={meta} params={params} period={result.period} visible={visible} locations={locations} hidden={hidden} />
      <div className='flex flex-wrap items-start gap-2'>
        {canExport ? (
          <>
            <Button asChild>
              {/* File downloads, not pages: plain anchors keep the browser from client-routing them. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href={href('csv')} download data-report-export='csv'>
                <TbDownload />
                Download CSV
              </a>
            </Button>
            <Button asChild variant='outline'>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href={href('pdf')} download data-report-export='pdf'>
                <TbDownload />
                Download PDF
              </a>
            </Button>
          </>
        ) : null}
        {children}
      </div>
      <p className='text-textSecondary text-sm' data-report-period>
        {meta.usesYear ? `Year ${params.year || new Date().getUTCFullYear()}` : meta.dateLabel ? `${meta.dateLabel}: ${result.period.label}` : 'As of today'}
        {result.period.from || result.period.to ? ` (${result.period.from || 'start'} to ${result.period.to || 'today'})` : ''}
      </p>
      <ReportTable result={result} />
    </div>
  )
}

export default ReportRunView
