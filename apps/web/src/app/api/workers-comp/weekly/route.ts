import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getScopedWcCases, wcTodayIso } from '@/lib/forgeWorkersComp'
import { WC_STAGE_LABELS, WC_WORK_STATUS_LABELS, thursdayWeekOf, weeklyUpdateStatus } from '@/lib/forgeWorkersCompRules'
import type { WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text

  return `"${safe.replace(/"/g, '""')}"`
}

/** Weekly open-case status report (1.0 emailed this every Friday; 2.0 offers it as a download for now). */
export const GET = async (request: Request) => {
  const context = await requireTenantPermission('workers_comp.export')
  const organizationId = context.activeOrganization.id
  const today = wcTodayIso()
  const requested = new URL(request.url).searchParams.get('week') || today
  const weekOf = thursdayWeekOf(/^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today)

  const cases = (await getScopedWcCases({ organizationId, userId: context.user.id, permission: context.permission })).filter(
    (row: any) => row.status === 'active' && row.injury_date <= weekOf
  )

  const supabase = createServiceRoleClient() as any

  const { data: updates } = cases.length
    ? await supabase.from('forge_wc_weekly_updates').select('case_id, notes').eq('organization_id', organizationId).eq('week_of', weekOf).in('case_id', cases.map((row: any) => row.id))
    : { data: [] }

  const notes = new Map<string, string>((updates || []).map((row: any) => [row.case_id, row.notes]))

  const header = ['Case', 'Employee', 'Injury date', 'Location', 'Stage', 'Work status', 'Days away', 'Days restricted', 'Claim number', 'Update status', 'Weekly note']

  const lines = cases.map((row: any) => [
    row.case_number,
    row.employee_name,
    row.injury_date,
    row.locations?.name || '',
    WC_STAGE_LABELS[row.stage as WcStage],
    row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : '',
    row.daysAway,
    row.restrictedDays,
    row.is_self_pay ? 'Self pay' : row.claim_number || '',
    weeklyUpdateStatus(weekOf, notes.has(row.id), today),
    notes.get(row.id) || ''
  ])

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.weekly_exported',
    entityType: 'workers_comp_weekly',
    entityId: organizationId,
    afterValue: { week_of: weekOf, rows: lines.length }
  })

  return new NextResponse([header, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="workers-comp-weekly-${weekOf}.csv"`,
      'Cache-Control': 'no-store'
    }
  })
}
