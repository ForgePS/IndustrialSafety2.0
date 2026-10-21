import { NextResponse } from 'next/server'

import { parseOshaParams } from '@/app/(back)/osha/params'
import { writeForgeAudit } from '@/lib/forgeAudit'
import { getOshaLocations, getScopedOshaCases, oshaLocationIdsInScope } from '@/lib/forgeOsha'
import { OSHA_CASE_OUTCOME_LABELS, OSHA_CASE_TYPE_LABELS, form300EmployeeName } from '@/lib/forgeOshaRules'
import type { OshaCaseOutcome, OshaCaseType } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)

  // Quote every cell and neutralize spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text

  return `"${safe.replace(/"/g, '""')}"`
}

export const GET = async (request: Request) => {
  const context = await requireTenantPermission('osha.export')
  const organizationId = context.activeOrganization.id
  const scopeIds = await oshaLocationIdsInScope({ organizationId, userId: context.user.id, permission: context.permission })
  const locations = await getOshaLocations({ organizationId, locationIds: scopeIds })
  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries())
  const { year, locationId } = parseOshaParams(searchParams, locations.map((item: any) => item.id))

  const cases = (
    await getScopedOshaCases({ organizationId, userId: context.user.id, permission: context.permission, year, locationId })
  ).filter((row: any) => row.recordability === 'recordable')

  const header = [
    'Case number', 'Establishment', 'Employee', 'Job title', 'Date of injury', 'Where', 'Description',
    'Outcome', 'Days away', 'Days restricted', 'Injury or illness type'
  ]

  const lines = cases.map((row: any) => [
    row.case_number,
    row.locations?.name || '',
    form300EmployeeName(row),
    row.job_title,
    row.injury_date,
    row.event_location,
    row.injury_description,
    row.case_outcome ? OSHA_CASE_OUTCOME_LABELS[row.case_outcome as OshaCaseOutcome] : '',
    row.days_away,
    row.restricted_days,
    row.case_type ? OSHA_CASE_TYPE_LABELS[row.case_type as OshaCaseType] : ''
  ])

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'osha.log_exported',
    entityType: 'osha_log',
    entityId: organizationId,
    afterValue: { year, location_id: locationId, rows: lines.length }
  })

  const body = [header, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n')

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="osha-300-log-${year}.csv"`,
      'Cache-Control': 'no-store'
    }
  })
}
