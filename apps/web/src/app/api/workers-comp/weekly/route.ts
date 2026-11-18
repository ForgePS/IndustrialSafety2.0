import { writeForgeAudit } from '@/lib/forgeAudit'
import { csvResponse } from '@/lib/forgeCsv'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { getWeeklyStatusReport, wcTodayIso } from '@/lib/forgeWorkersComp'
import { WC_STAGE_LABELS, WC_WORK_STATUS_LABELS, thursdayWeekOf, weeklyUpdateStatus } from '@/lib/forgeWorkersCompRules'
import type { WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

/** Weekly open-case status report: the same content as the weekly status email. */
export const GET = async (request: Request) => {
  const context = await requireTenantPermission('workers_comp.export')
  const organizationId = context.activeOrganization.id
  const today = wcTodayIso()
  const requested = new URL(request.url).searchParams.get('week') || today
  const weekOf = thursdayWeekOf(/^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today)

  const rows = await getWeeklyStatusReport({ organizationId, userId: context.user.id, permission: context.permission, weekOf })

  const header = ['Case', 'Employee', 'Injury date', 'Location', 'Stage', 'Work status', 'Days away', 'Days restricted', 'Claim number', 'Update status', 'Weekly note']

  const lines = rows.map((row: any) => [
    row.case_number,
    row.employee_name,
    row.injury_date,
    row.locations?.name || '',
    WC_STAGE_LABELS[row.stage as WcStage],
    row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : '',
    row.daysAway,
    row.restrictedDays,
    row.is_self_pay ? 'Self pay' : row.claim_number || '',
    weeklyUpdateStatus(weekOf, Boolean(row.weekly_update), today),
    row.weekly_update?.notes || ''
  ])

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.weekly_exported',
    entityType: 'workers_comp_weekly',
    entityId: organizationId,
    afterValue: { week_of: weekOf, rows: lines.length }
  })

  return csvResponse(`workers-comp-weekly-${weekOf}.csv`, header, lines)
}
