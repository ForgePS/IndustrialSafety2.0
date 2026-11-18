import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@repo/supabase/server'

import {
  customerTicketScope,
  getHelpdeskCustomerAccess,
  getHelpdeskStaffAccess,
  isUuid,
  type HelpdeskCustomerAccess,
  type HelpdeskStaffAccess
} from '@/lib/forgeHelpdeskAccess'

export const jsonError = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status })

// Mutating routes accept only same-origin browser requests (CSRF defence for cookie auth).
export const isSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')

  if (!origin || !host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export type TicketActor =
  | { kind: 'staff'; staff: HelpdeskStaffAccess; ticket: any }
  | { kind: 'customer'; customer: HelpdeskCustomerAccess; ticket: any }

// Resolves who is acting on a ticket. Staff need console access; customers need the
// ticket inside their active company and visibility scope. Unknown or foreign IDs return null.
export const resolveTicketActor = async (ticketId: string, { customerPermission }: { customerPermission: string }): Promise<TicketActor | null> => {
  if (!isUuid(ticketId)) return null
  const db = createServiceRoleClient() as any

  const { data: ticket } = await db
    .from('forge_support_tickets')
    .select('id,organization_id,requester_user_id,location_id,status,ticket_number,deleted_at')
    .eq('id', ticketId)
    .maybeSingle()

  if (!ticket || ticket.deleted_at) return null

  const staff = await getHelpdeskStaffAccess()

  if (staff?.has('helpdesk.support.view')) return { kind: 'staff', staff, ticket }

  const customer = await getHelpdeskCustomerAccess()

  if (!customer || customer.organizationId !== ticket.organization_id || !customer.has(customerPermission)) return null
  const scope = await customerTicketScope(customer)

  if (!scope.canView(ticket)) return null

  return { kind: 'customer', customer, ticket }
}

export const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return ''
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value)


  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text

  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

export const toCsv = (headers: string[], rows: unknown[][]) => [headers.map(csvCell).join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\r\n')

export const csvResponse = (fileName: string, body: string) =>
  new NextResponse('\uFEFF' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store'
    }
  })
