import { NextResponse } from 'next/server'

import { csvResponse } from '@/lib/forgeCsv'
import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { wcTodayIso } from '@/lib/forgeWorkersComp'
import { buildWcReport, isWcReportKey } from '@/lib/forgeWorkersCompReports'

export const GET = async (_request: Request, { params }: { params: Promise<{ key: string }> }) => {
  const context = await requireTenantPermission('workers_comp.export')
  const { key } = await params

  if (!isWcReportKey(key)) return NextResponse.json({ error: 'Unknown report.' }, { status: 404 })

  const medicalPermission = context.access.effective.find(item => item.permissionKey === 'workers_comp.medical.view' && item.allowed) || null

  const report = await buildWcReport({
    key,
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    permission: context.permission,
    medicalPermission
  })

  if ('error' in report) return NextResponse.json({ error: report.error }, { status: 403 })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId: context.activeOrganization.id,
    action: 'workers_comp.report_exported',
    entityType: 'workers_comp_report',
    entityId: context.activeOrganization.id,
    afterValue: { report: key, rows: report.rows.length }
  })

  return csvResponse(`workers-comp-${key.replace(/_/g, '-')}-${wcTodayIso()}.csv`, report.header, report.rows)
}
