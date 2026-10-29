'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

import {
  callHelpdeskRpc,
  cleanText,
  customerTicketScope,
  getHelpdeskCustomerAccess,
  getRequestMeta,
  isUuid,
  type HelpdeskCustomerAccess
} from '@/lib/forgeHelpdeskAccess'
import { askForge } from '@/lib/forgeHelpdeskAi'
import { getHelpdeskSettings } from '@/lib/forgeHelpdeskData'
import { markNotificationsRead } from '@/lib/forgeNotifications'
import type { TechnicalContextInput } from '@/lib/forgeHelpdesk'

export type HelpdeskActionResult = { ok: boolean; error?: string; [key: string]: unknown }

const db = () => createServiceRoleClient() as any
const denied = (message = 'You do not have access to do that.'): HelpdeskActionResult => ({ ok: false, error: message })

const customer = async (permissionKey: string) => {
  const access = await getHelpdeskCustomerAccess()

  if (!access) return { access: null, error: denied('Sign in and choose a company to use the Help Desk.') }
  if (!access.has(permissionKey)) return { access: null, error: denied() }

  return { access, error: null }
}

// Loads a ticket only if the caller may see it (tenant -> own/watched/location scope).
const loadVisibleTicket = async (access: HelpdeskCustomerAccess, ticketId: unknown) => {
  if (!isUuid(ticketId)) return null

  const { data } = await db()
    .from('forge_support_tickets')
    .select('id,organization_id,requester_user_id,location_id,status,row_version,merged_into_ticket_id,ticket_number')
    .eq('id', ticketId)
    .eq('organization_id', access.organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) return null
  const scope = await customerTicketScope(access)

  return scope.canView(data) ? data : null
}

const refreshTicket = (id: string) => {
  revalidatePath('/help-desk/tickets')
  revalidatePath('/help-desk/tickets/' + id)
  revalidatePath('/help-desk/console')
  revalidatePath('/help-desk/console/tickets/' + id)
}

const TECH_STRING_LIMITS: Record<string, number> = {
  route: 300,
  browser_name: 60,
  browser_version: 40,
  os_name: 60,
  device_type: 20,
  app_version: 40,
  build_version: 60,
  client_timezone: 80,
  correlation_id: 120,
  client_error_id: 120,
  module_key: 80
}

const sanitizeTechnicalContext = (raw: unknown): Partial<TechnicalContextInput> => {
  if (!raw || typeof raw !== 'object') return {}
  const input = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}

  for (const [key, max] of Object.entries(TECH_STRING_LIMITS)) {
    const value = cleanText(input[key], max)

    if (value) out[key] = value
  }

  if (typeof out.route === 'string') out.route = String(out.route).split(/[?#]/)[0]
  const pageUrl = cleanText(input.page_url, 1000).split(/[?#]/)[0]

  if (/^https?:\/\//.test(pageUrl)) out.page_url = pageUrl
  if (out.device_type && !['desktop', 'tablet', 'mobile', 'unknown'].includes(String(out.device_type))) delete out.device_type

  for (const key of ['viewport_width', 'viewport_height']) {
    const n = Number(input[key])

    if (Number.isInteger(n) && n >= 0 && n <= 20000) out[key] = n
  }

  if (typeof input.is_mobile === 'boolean') out.is_mobile = input.is_mobile
  if (typeof input.client_timestamp === 'string' && !Number.isNaN(Date.parse(input.client_timestamp))) out.client_timestamp = new Date(input.client_timestamp).toISOString()

  return out as Partial<TechnicalContextInput>
}

// ---------------------------------------------------------------------------
// Ask Forge
// ---------------------------------------------------------------------------
export async function askForgeAction(input: { question: string; moduleId?: string | null }): Promise<HelpdeskActionResult> {
  const { access, error } = await customer('helpdesk.knowledge.view')

  if (!access) return error!
  const question = cleanText(input.question, 4000)

  if (question.length < 3) return denied('Describe what you need help with.')
  const { data: product } = await db().from('forge_support_products').select('id').eq('product_key', 'forge_industrial_safety').maybeSingle()
  let moduleId: string | null = null

  if (isUuid(input.moduleId)) {
    const { data: area } = await db().from('forge_support_product_areas').select('id').eq('id', input.moduleId).eq('is_active', true).maybeSingle()

    moduleId = area?.id || null
  }

  try {
    const result = await askForge({ organizationId: access.organizationId, userId: access.user.id, question, productId: product?.id || null, moduleId })

    return { ok: true, ...result }
  } catch (err) {
    console.error('[helpdesk] ask forge', err instanceof Error ? err.message : err)

    return denied('Ask Forge is unavailable right now. You can still submit a ticket.')
  }
}

export async function recordAssistOutcomeAction(input: { sessionId: string; outcome: 'resolved' | 'not_resolved'; comment?: string; viewedArticleIds?: string[] }): Promise<HelpdeskActionResult> {
  const { access, error } = await customer('helpdesk.knowledge.view')

  if (!access) return error!
  if (!isUuid(input.sessionId) || !['resolved', 'not_resolved'].includes(input.outcome)) return denied('Invalid request.')
  const viewed = (input.viewedArticleIds || []).filter(isUuid).slice(0, 20)

  const { data, error: updateError } = await db()
    .from('forge_support_assist_sessions')
    .update({ outcome: input.outcome, feedback_comment: cleanText(input.comment, 2000) || null, viewed_article_ids: viewed, updated_at: new Date().toISOString() })
    .eq('id', input.sessionId)
    .eq('organization_id', access.organizationId)
    .eq('user_id', access.user.id)
    .is('ticket_id', null)
    .select('id')
    .maybeSingle()

  if (updateError || !data) return denied('That Ask Forge session is no longer available.')

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export async function createHelpdeskTicketAction(input: {
  idempotencyKey: string
  subject: string
  description: string
  categoryId: string
  moduleId?: string | null
  severity?: string | null
  locationId?: string | null
  assistSessionId?: string | null
  source?: 'web' | 'mobile' | 'ask_forge'
  technicalContext?: unknown
}): Promise<HelpdeskActionResult> {
  const { access, error } = await customer('helpdesk.ticket.create')

  if (!access) return error!
  const key = cleanText(input.idempotencyKey, 120)

  if (!/^[A-Za-z0-9_-]{8,120}$/.test(key)) return denied('Refresh the page and try again.')
  if (!isUuid(input.categoryId)) return denied('Choose a request type.')
  const locationId = isUuid(input.locationId) ? input.locationId : null

  if (locationId && !access.has('helpdesk.ticket.view_tenant') && !access.locationIds.includes(locationId)) {
    return denied('Choose one of your assigned Locations.')
  }

  const settings = await getHelpdeskSettings()
  const { data: product } = await db().from('forge_support_products').select('id').eq('product_key', 'forge_industrial_safety').single()
  const { data: role } = await db().from('organization_memberships').select('role').eq('organization_id', access.organizationId).eq('user_id', access.user.id).maybeSingle()
  const technical = settings.capture_technical_context ? { ...sanitizeTechnicalContext(input.technicalContext), user_role: role?.role || null, product_key: 'forge_industrial_safety' } : {}
  const source = input.source && ['web', 'mobile', 'ask_forge'].includes(input.source) ? input.source : 'web'

  const result = await callHelpdeskRpc('forge_support_create_ticket', {
    p_organization_id: access.organizationId,
    p_requester_user_id: access.user.id,
    p_payload: {
      subject: cleanText(input.subject, 160),
      description: cleanText(input.description, 10000),
      product_id: product?.id,
      category_id: input.categoryId,
      module_id: isUuid(input.moduleId) ? input.moduleId : null,
      customer_reported_severity: input.severity || null,
      location_id: locationId,
      source: isUuid(input.assistSessionId) ? 'ask_forge' : source,
      assist_session_id: isUuid(input.assistSessionId) ? input.assistSessionId : null,
      technical_context: technical
    },
    p_idempotency_key: key,
    p_meta: await getRequestMeta()
  })

  if (!result.ok) return result
  revalidatePath('/help-desk/tickets')
  revalidatePath('/help-desk/console')

  return { ok: true, ticketId: result.ticket_id, ticketNumber: result.ticket_number, duplicate: Boolean(result.duplicate) }
}

export async function replyToTicketAction(input: { ticketId: string; body: string }): Promise<HelpdeskActionResult> {
  const { access, error } = await customer('helpdesk.ticket.comment')

  if (!access) return error!
  const ticket = await loadVisibleTicket(access, input.ticketId)

  if (!ticket) return denied('Ticket not found.')

  const result = await callHelpdeskRpc('forge_support_add_message', {
    p_ticket_id: ticket.id,
    p_actor_user_id: access.user.id,
    p_actor_type: 'customer',
    p_message_type: 'customer_message',
    p_body: cleanText(input.body, 10000),
    p_organization_id: access.organizationId,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(ticket.id)

  return result
}

export async function customerStatusAction(input: { ticketId: string; action: 'reopen' | 'close'; expectedRowVersion: number; reason?: string }): Promise<HelpdeskActionResult> {
  const permission = input.action === 'reopen' ? 'helpdesk.ticket.reopen' : 'helpdesk.ticket.close'
  const { access, error } = await customer(permission)

  if (!access) return error!
  const ticket = await loadVisibleTicket(access, input.ticketId)

  if (!ticket) return denied('Ticket not found.')
  const reason = cleanText(input.reason, 2000)

  if (input.action === 'reopen' && reason.length < 3) return denied('Tell us why the issue is not resolved.')

  if (input.action === 'close') {
    const settings = await getHelpdeskSettings()

    if (!settings.allow_customer_close) return denied('Closing tickets is handled by Forge Support.')
  }

  const result = await callHelpdeskRpc('forge_support_apply_ticket_change', {
    p_ticket_id: ticket.id,
    p_actor_user_id: access.user.id,
    p_actor_type: 'customer',
    p_changes: { status: input.action === 'reopen' ? 'reopened' : 'closed' },
    p_expected_row_version: Number(input.expectedRowVersion) || ticket.row_version,
    p_organization_id: access.organizationId,
    p_reason: reason || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(ticket.id)

  return result
}

export async function submitCsatAction(input: { ticketId: string; rating: number; comment?: string }): Promise<HelpdeskActionResult> {
  const { access, error } = await customer('helpdesk.ticket.view_own')

  if (!access) return error!
  const ticket = await loadVisibleTicket(access, input.ticketId)

  if (!ticket || ticket.requester_user_id !== access.user.id) return denied('Only the requester can rate this ticket.')
  const rating = Number(input.rating)

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return denied('Choose a rating from 1 to 5.')

  const result = await callHelpdeskRpc('forge_support_submit_csat', {
    p_ticket_id: ticket.id,
    p_requester_user_id: access.user.id,
    p_organization_id: access.organizationId,
    p_rating: rating,
    p_comment: cleanText(input.comment, 2000) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(ticket.id)

  return result
}

export async function articleFeedbackAction(input: { articleId: string; helpful: boolean; comment?: string }): Promise<HelpdeskActionResult> {
  const { access, error } = await customer('helpdesk.knowledge.view')

  if (!access) return error!
  if (!isUuid(input.articleId) || typeof input.helpful !== 'boolean') return denied('Invalid feedback.')

  return callHelpdeskRpc('forge_support_article_feedback', {
    p_article_id: input.articleId,
    p_user_id: access.user.id,
    p_organization_id: access.organizationId,
    p_helpful: input.helpful,
    p_comment: cleanText(input.comment, 1000) || null
  })
}

export async function markNotificationsReadAction(input: { ids: string[] | 'all' }): Promise<HelpdeskActionResult> {
  const {
    data: { user }
  } = await getAuthUser()

  if (!user) return denied('Sign in to manage notifications.')
  const ids = input.ids === 'all' ? 'all' : (input.ids || []).filter(isUuid).slice(0, 200)

  await markNotificationsRead(user.id, ids)
  revalidatePath('/notifications')

  return { ok: true }
}
