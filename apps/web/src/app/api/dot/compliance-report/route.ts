import { NextResponse } from 'next/server'

import { createServiceRoleClient } from '@repo/supabase/server'

import { getDotSettings, getScopedDriverFiles } from '@/lib/forgeDot'
import { buildReportRow, reportCsv } from '@/lib/forgeDotRules'
import { audit, tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/** DQF compliance report as CSV (1.0 dqf-compliance-YYYY-MM-DD.csv). Needs dot.export; rows follow its scope. */
export async function GET() {
  const context = await tenantPermissionOrNull('dot.export')

  if (!context) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const organizationId = context.activeOrganization.id

  const [files, settings] = await Promise.all([
    getScopedDriverFiles({ organizationId, userId: context.user.id, permission: context.permission }),
    getDotSettings(organizationId)
  ])

  const rows = files.map(file =>
    buildReportRow(
      { name: file.name, employeeNumber: file.person?.employee_number || '', location: file.person?.locations?.name || '' },
      file.worksheet,
      settings.hidden_document_types
    )
  )

  const today = new Date().toISOString().slice(0, 10)

  await audit({
    supabase: createServiceRoleClient() as any,
    actorUserId: context.user.id,
    organizationId,
    action: 'dot.compliance_exported',
    entityType: 'dot_report',
    entityId: organizationId,
    after: { rows: rows.length }
  })

  return new NextResponse(reportCsv(rows, settings.hidden_document_types), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="dqf-compliance-${today}.csv"`,
      'Cache-Control': 'no-store'
    }
  })
}
