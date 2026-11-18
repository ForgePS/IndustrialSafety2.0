import { NextResponse, type NextRequest } from 'next/server'

import { getCapaReportData } from '@/lib/forgeCapaReport'
import { capaReportCsv, capaReportFilename, resolveCapaReportPeriod } from '@/lib/forgeCapaReportRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/** CAPA report as CSV: one row per CAPA opened or closed in the period, or open now. Needs corrective_actions.view; rows follow its scope. */
export async function GET(request: NextRequest) {
  const context = await tenantPermissionOrNull('corrective_actions.view')

  if (!context) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const params = request.nextUrl.searchParams
  const today = new Date().toISOString().slice(0, 10)

  const period = resolveCapaReportPeriod(
    { preset: params.get('preset') ?? undefined, from: params.get('from') ?? undefined, to: params.get('to') ?? undefined },
    today
  )

  const { records, labels } = await getCapaReportData({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    permission: context.permission
  })

  return new NextResponse(capaReportCsv(records, period, today, labels), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${capaReportFilename(period)}"`,
      'Cache-Control': 'no-store'
    }
  })
}
