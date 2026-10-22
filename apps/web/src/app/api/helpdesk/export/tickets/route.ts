import { getHelpdeskStaffAccess } from '@/lib/forgeHelpdeskAccess'
import { listConsoleTickets } from '@/lib/forgeHelpdeskData'
import { label, priorityLabels, slaLabels, statusLabels, dispositionLabels } from '@/lib/forgeHelpdesk'
import { csvResponse, jsonError, toCsv } from '@/lib/forgeHelpdeskHttp'

export async function GET(request: Request) {
  const staff = await getHelpdeskStaffAccess()

  if (!staff?.has('helpdesk.support.view') || !staff.has('helpdesk.analytics.export')) return jsonError('Access denied.', 403)
  const params = new URL(request.url).searchParams

  const tickets = await listConsoleTickets(staff, {
    queue: params.get('queue') || 'all',
    q: params.get('q') || undefined,
    organizationId: params.get('tenant') || undefined,
    moduleId: params.get('module') || undefined,
    categoryId: params.get('category') || undefined,
    priority: params.get('priority') || undefined,
    status: params.get('status') || undefined,
    assigneeId: params.get('assignee') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined
  })

  const csv = toCsv(
    ['Ticket', 'Subject', 'Tenant', 'Status', 'Priority', 'SLA', 'Disposition', 'Request type', 'Product area', 'Team', 'Assignee', 'Requester', 'Source', 'Created', 'Updated', 'Resolution due'],
    tickets.map((t: any) => [
      t.ticket_number,
      t.subject,
      t.organization?.name,
      label(statusLabels, t.status),
      label(priorityLabels, t.priority),
      label(slaLabels, t.sla_state),
      t.disposition ? label(dispositionLabels, t.disposition) : '',
      t.category?.label,
      t.module?.label,
      t.team?.name,
      t.assignee_name,
      t.requester_name,
      t.source,
      t.created_at,
      t.updated_at,
      t.resolution_due_at
    ])
  )

  return csvResponse(`forge-help-desk-tickets-${new Date().toISOString().slice(0, 10)}.csv`, csv)
}
