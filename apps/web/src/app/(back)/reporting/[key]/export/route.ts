import { NextResponse, type NextRequest } from 'next/server'

import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { reportPdf } from '@/lib/forgeReportPdf'
import { runReport, todayIso } from '@/lib/forgeReportRun'
import { reportCsv, reportFilename } from '@/lib/forgeReportRules'

/**
 * Port slice 13: a report as CSV or PDF, made on demand from the same run as the screen (no files are kept).
 * Needs reporting.export besides the report's own permissions.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const context = await tenantPermissionOrNull('reporting.export')

  if (!context) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const { key } = await params
  const search = request.nextUrl.searchParams
  const format = search.get('format') === 'pdf' ? 'pdf' : 'csv'

  const raw: Record<string, unknown> = {}

  for (const name of new Set(search.keys())) {
    const values = search.getAll(name)

    raw[name] = values.length > 1 ? values : values[0]
  }

  const today = todayIso()

  const run = await runReport({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    reportKey: decodeURIComponent(key),
    rawParams: raw,
    kind: format,
    access: context.access,
    today
  })

  if (!run.ok) return NextResponse.json({ error: run.message }, { status: run.reason === 'denied' ? 404 : 500 })

  const filename = reportFilename(run.report.key, run.result.period, format, today)
  const headers = { 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' }

  if (format === 'csv') return new NextResponse(reportCsv(run.result), { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8' } })

  const who = context.user.email || 'you'
  const period = run.report.usesYear ? `Year ${run.params.year || today.slice(0, 4)}` : run.report.dateLabel ? `${run.report.dateLabel}: ${run.result.period.label}` : 'As of ' + today

  const bytes = await reportPdf({
    title: run.report.name,
    subtitle: `${context.activeOrganization.name || ''} · ${period}${run.result.period.from || run.result.period.to ? ` (${run.result.period.from || 'start'} to ${run.result.period.to || today})` : ''}`,
    result: run.result,
    generatedFor: `Made ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC for ${who}. Shows only the records this person may see.`
  })

  return new NextResponse(Buffer.from(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf' } })
}
