import { getHelpdeskStaffAccess } from '@/lib/forgeHelpdeskAccess'
import { getHelpdeskAnalytics, resolveAnalyticsRange } from '@/lib/forgeHelpdeskData'
import { csvResponse, jsonError, toCsv } from '@/lib/forgeHelpdeskHttp'

export async function GET(request: Request) {
  const staff = await getHelpdeskStaffAccess()

  if (!staff?.has('helpdesk.analytics.export')) return jsonError('Access denied.', 403)
  const params = new URL(request.url).searchParams
  const range = resolveAnalyticsRange(params.get('range') || '30d', params.get('from') || undefined, params.get('to') || undefined)
  const data: any = await getHelpdeskAnalytics({ from: range.from, to: range.to, organizationId: params.get('tenant') || undefined })

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
    ['CSAT responses', data.csat_responses]
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

  return csvResponse(`forge-help-desk-analytics-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.csv`, toCsv(['Section', 'Item', 'Value'], rows))
}
