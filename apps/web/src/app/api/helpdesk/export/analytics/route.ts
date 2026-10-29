import { getHelpdeskStaffAccess } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskAnalytics, getHelpdeskServiceReport, resolveAnalyticsRange } from '@/lib/forgeHelpdeskData'
import { csvResponse, jsonError, toCsv } from '@/lib/forgeHelpdeskHttp'

export async function GET(request: Request) {
  const staff = await getHelpdeskStaffAccess()

  if (!staff?.has('helpdesk.analytics.export')) return jsonError('Access denied.', 403)
  const params = new URL(request.url).searchParams
  const range = resolveAnalyticsRange(params.get('range') || '30d', params.get('from') || undefined, params.get('to') || undefined)
  const organizationId = params.get('tenant') || undefined

  const [data, service]: [any, Awaited<ReturnType<typeof getHelpdeskServiceReport>>] = await Promise.all([
    getHelpdeskAnalytics({ from: range.from, to: range.to, organizationId }),
    getHelpdeskServiceReport({ from: range.from, to: range.to, organizationId, commentLimit: 200 })
  ])

  const metrics: [string, unknown][] = [
    ['Created', data.created],
    ['Resolved', data.resolved],
    ['Open now', data.open],
    ['Backlog (created in range, still open)', data.backlog],
    ['Avg first response (min)', data.first_response_minutes_avg],
    ['MTTA (min)', data.mtta_minutes_avg],
    ['MTTR (min)', data.mttr_minutes_avg],
    ['SLA compliance %', data.sla_compliance_percent],
    ['SLA breaches in range', data.sla_breach_count_in_range],
    ['Reopen rate %', data.reopen_rate_percent],
    ['Duplicate rate %', data.duplicate_rate_percent],
    ['Known issues', data.known_issue_count],
    ['Feature requests', data.feature_request_count],
    ['CSAT average', data.csat_average],
    ['CSAT responses', data.csat_responses],
    ['CSAT satisfied % (4-5)', service.csat_satisfied_percent],
    ['CSAT low ratings (1-2)', service.csat_low_count],
    ['First response overdue now (all dates)', service.first_response_overdue_now],
    ['Resolution overdue now (all dates)', service.resolution_overdue_now],
    ['Unassigned open (all dates)', service.unassigned_open]
  ]

  const rows: unknown[][] = metrics.map(([name, value]) => ['metric', name, value])

  for (const [section, items] of [
    ['by_status', data.by_status],
    ['by_priority', data.by_priority],
    ['by_tenant', data.by_tenant],
    ['by_module', data.by_module],
    ['by_category', data.by_category],
    ['by_assignee', data.by_assignee],
    ['top_recurring', data.top_recurring]
  ] as const) {
    for (const item of (items as any[]) || []) rows.push([section, item.label ?? (item.module ? `${item.module} / ${item.category}` : item.key), item.count])
  }

  for (const day of (data.daily as any[]) || []) rows.push(['daily', day.day, `${day.created} created / ${day.resolved} resolved`])

  // Customer-written text: csvCell neutralises formula injection.
  for (const c of service.csat_comments) rows.push(['rating_comment', `${c.ticket_number} (${c.rating}/5, ${c.organization_name || 'unknown tenant'})`, c.comment])

  return csvResponse(`forge-help-desk-analytics-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv`, toCsv(['Section', 'Item', 'Value'], rows))
}
