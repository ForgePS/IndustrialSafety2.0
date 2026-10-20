import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export type SupportNotice = {
  id: string
  ticketId: string
  ticketNumber: string
  subject: string
  kind: string
  readAt: string | null
  createdAt: string
}
export type SupportFeedbackRecord = {
  rating: number
  comment: string | null
  created_at: string
}
export type SupportReport = {
  summary: {
    total: number; active: number; resolved: number
    response_overdue: number; resolution_overdue: number
    average_response_hours: number | null; average_resolution_hours: number | null
    responded_with_target: number; responses_within_target: number
  }
  feedback: { responses: number; average_rating: number | null; satisfied: number }
  categories: Array<{ category: string; total: number }>
  priorities: Array<{ priority: string; total: number }>
  backlog: { total: number; unassigned: number }
}

export async function getSupportInbox(audience: 'customer' | 'staff'): Promise<SupportNotice[]> {
  const db = createServiceRoleClient() as any
  let userId: string
  let organizationId: string | null = null

  if (audience === 'staff') {
    const actor = await requireForgePlatformRole(['forge_owner', 'forge_creator', 'forge_support'])
    userId = actor.user.id
  } else {
    const actor = await requireTenantPermission('customer_support.view')
    userId = actor.user.id
    organizationId = actor.activeOrganization.id
  }

  let query = db.from('forge_support_notifications')
    .select('id,ticket_id,kind,read_at,created_at,forge_support_tickets!inner(ticket_number,subject,requester_user_id)')
    .eq('recipient_user_id', userId)
    .eq('audience', audience)

  if (organizationId) {
    query = query.eq('organization_id', organizationId)
      .eq('forge_support_tickets.requester_user_id', userId)
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error('Unable to load support notifications.')

  return (data || []).map((row: any) => ({
    id: row.id,
    ticketId: row.ticket_id,
    ticketNumber: row.forge_support_tickets.ticket_number,
    subject: row.forge_support_tickets.subject,
    kind: row.kind,
    readAt: row.read_at,
    createdAt: row.created_at
  }))
}
