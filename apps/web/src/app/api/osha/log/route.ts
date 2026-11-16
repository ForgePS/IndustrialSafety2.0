import { NextResponse } from 'next/server'

import { parseOshaParams } from '@/app/(back)/osha/params'
import { writeForgeAudit } from '@/lib/forgeAudit'
import { csvResponse } from '@/lib/forgeCsv'
import { getOshaLocations, getScopedOshaCases, oshaLocationIdsInScope } from '@/lib/forgeOsha'
import { OSHA_CASE_OUTCOME_LABELS, OSHA_CASE_TYPE_LABELS, form300EmployeeName } from '@/lib/forgeOshaRules'
import type { OshaCaseOutcome, OshaCaseType } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const GET = async (request: Request) => {
  const context = await requireTenantPermission('osha.export')
  const organizationId = context.activeOrganization.id
  const scopeIds = await oshaLocationIdsInScope({ organizationId, userId: context.user.id, permission: context.permission })
  const locations = await getOshaLocations({ organizationId, locationIds: scopeIds })
  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries())
  const { year, locationId } = parseOshaParams(searchParams, locations.map((item: any) => item.id))

  // 29 CFR 1904.30: each establishment keeps its own Form 300 log, so the export covers exactly one.
  if (!locationId) {
    return NextResponse.json(
      { error: 'Select an establishment to export. OSHA requires a separate Form 300 log for each establishment.' },
      { status: 400 }
    )
  }

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

  const establishment = locations.find((item: any) => item.id === locationId)

  return csvResponse(`osha-300-log-${year}-${establishment?.code || establishment?.name || 'establishment'}.csv`, header, lines)
}
