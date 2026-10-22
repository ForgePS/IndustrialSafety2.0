'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import {
  callHelpdeskRpc,
  cleanText,
  getHelpdeskStaffAccess,
  getRequestMeta,
  isUuid,
  type HelpdeskRpcResult,
  type HelpdeskStaffAccess
} from '@/lib/forgeHelpdeskAccess'
import { generateTicketSuggestion, HELPDESK_SUGGESTION_TYPES } from '@/lib/forgeHelpdeskAi'
import { buildDevelopmentIssuePayload, getDevelopmentProvider } from '@/lib/forgeHelpdeskDevelopment'
import { HELPDESK_PRIORITIES } from '@/lib/forgeHelpdesk'

export type ConsoleActionResult = HelpdeskRpcResult

const db = () => createServiceRoleClient() as any
const denied = (message = 'You do not have permission to do that.'): ConsoleActionResult => ({ ok: false, error: message })

const staff = async (permissionKey = 'helpdesk.support.view'): Promise<{ access: HelpdeskStaffAccess | null; error: ConsoleActionResult | null }> => {
  const access = await getHelpdeskStaffAccess()

  if (!access) return { access: null, error: denied('Forge staff access is required.') }
  if (!access.has(permissionKey)) return { access: null, error: denied() }

  return { access, error: null }
}

const refreshTicket = (id?: string | null) => {
  revalidatePath('/help-desk/console')

  if (id) {
    revalidatePath('/help-desk/console/tickets/' + id)
    revalidatePath('/help-desk/tickets/' + id)
  }

  revalidatePath('/help-desk/tickets')
}

const uuidList = (values: unknown, max = 50) => (Array.isArray(values) ? values.filter(isUuid).slice(0, max) : [])

const audit = async (access: HelpdeskStaffAccess, action: string, entityType: string, entityId: string, before: unknown, after: unknown, reason?: string | null) => {
  const meta = await getRequestMeta()

  await db().rpc('forge_support_audit', {
    p_actor_user_id: access.user.id,
    p_actor_type: 'forge_staff',
    p_organization_id: null,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_before: before ?? null,
    p_after: after ?? null,
    p_reason: reason || null,
    p_request_id: meta.request_id,
    p_source_ip: meta.source_ip,
    p_user_agent: meta.user_agent
  })
}

// ---------------------------------------------------------------------------
// Conversation
// ---------------------------------------------------------------------------
export async function sendConsoleMessageAction(input: {
  ticketId: string
  mode: 'reply' | 'note'
  body: string
  mentions?: string[]
  savedReplyId?: string | null
  aiSuggestionId?: string | null
  setStatus?: string | null
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff()

  if (!access) return error!
  if (!isUuid(input.ticketId)) return denied('Ticket not found.')
  const setStatus = input.setStatus && ['in_progress', 'waiting_on_customer', 'waiting_on_forge', 'resolved'].includes(input.setStatus) ? input.setStatus : null

  const result = await callHelpdeskRpc('forge_support_add_message', {
    p_ticket_id: input.ticketId,
    p_actor_user_id: access.user.id,
    p_actor_type: 'staff',
    p_message_type: input.mode === 'note' ? 'internal_note' : 'support_reply',
    p_body: cleanText(input.body, 10000),
    p_organization_id: null,
    p_mentions: input.mode === 'note' ? uuidList(input.mentions, 20) : [],
    p_saved_reply_id: isUuid(input.savedReplyId) ? input.savedReplyId : null,
    p_ai_suggestion_id: isUuid(input.aiSuggestionId) ? input.aiSuggestionId : null,
    p_set_status: setStatus,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

// ---------------------------------------------------------------------------
// Ticket properties (status, priority, assignment, disposition, escalation...)
// ---------------------------------------------------------------------------
const CHANGE_KEYS = ['status', 'priority', 'assigned_user_id', 'assigned_team_id', 'disposition', 'module_id', 'category_id', 'resolution_summary', 'fix_version', 'escalate'] as const

export async function applyTicketChangeAction(input: {
  ticketId: string
  expectedRowVersion: number
  changes: Partial<Record<(typeof CHANGE_KEYS)[number], string | boolean | null>>
  reason?: string | null
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff()

  if (!access) return error!
  if (!isUuid(input.ticketId)) return denied('Ticket not found.')
  const changes: Record<string, unknown> = {}

  for (const key of CHANGE_KEYS) {
    if (!(key in (input.changes || {}))) continue
    const value = input.changes[key]

    if (key === 'escalate') changes.escalate = value === true
    else if (key === 'resolution_summary') changes[key] = cleanText(value, 4000)
    else if (key === 'fix_version') changes[key] = cleanText(value, 80)
    else if (key.endsWith('_id')) {
      if (isUuid(value)) changes[key] = value
      else if (!value) changes[key] = ''
    }
    else changes[key] = typeof value === 'string' ? value : null
  }

  if (!Object.keys(changes).length) return denied('Nothing to change.')

  const result = await callHelpdeskRpc('forge_support_apply_ticket_change', {
    p_ticket_id: input.ticketId,
    p_actor_user_id: access.user.id,
    p_actor_type: 'staff',
    p_changes: changes,
    p_expected_row_version: Number(input.expectedRowVersion) || null,
    p_organization_id: null,
    p_reason: cleanText(input.reason, 2000) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

export async function bulkAssignAction(input: { ticketIds: string[]; assignedUserId: string | null }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.assign')

  if (!access) return error!
  const ids = uuidList(input.ticketIds, 100)

  if (!ids.length) return denied('Select tickets first.')
  const { data: tickets } = await db().from('forge_support_tickets').select('id,row_version').in('id', ids)
  const meta = await getRequestMeta()
  let updated = 0
  const failures: string[] = []

  for (const ticket of tickets || []) {
    const result = await callHelpdeskRpc('forge_support_apply_ticket_change', {
      p_ticket_id: ticket.id,
      p_actor_user_id: access.user.id,
      p_actor_type: 'staff',
      p_changes: { assigned_user_id: isUuid(input.assignedUserId) ? input.assignedUserId : '' },
      p_expected_row_version: ticket.row_version,
      p_organization_id: null,
      p_reason: 'Bulk assignment',
      p_meta: meta
    })

    if (result.ok) updated += 1
    else failures.push(result.error || 'failed')
  }

  refreshTicket(null)

  return { ok: failures.length === 0, updated, error: failures.length ? `${failures.length} ticket(s) could not be updated: ${failures[0]}` : undefined }
}

export async function setTicketTagsAction(input: { ticketId: string; add?: string[]; remove?: string[] }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.change_status')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_set_ticket_tags', {
    p_ticket_id: input.ticketId,
    p_actor_user_id: access.user.id,
    p_add: uuidList(input.add),
    p_remove: uuidList(input.remove),
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

export async function setWatcherAction(input: { ticketId: string; userId: string; watch: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff()

  if (!access) return error!
  if (!isUuid(input.ticketId) || !isUuid(input.userId)) return denied('Invalid watcher.')

  const result = await callHelpdeskRpc('forge_support_set_watcher', {
    p_ticket_id: input.ticketId,
    p_actor_user_id: access.user.id,
    p_user_id: input.userId,
    p_watch: input.watch === true,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

const resolveTicketRef = async (ref: string) => {
  const value = cleanText(ref, 40).toUpperCase()

  if (isUuid(ref)) return ref
  if (!/^SUP-\d{4}-\d{6,}$/.test(value)) return null
  const { data } = await db().from('forge_support_tickets').select('id').eq('ticket_number', value).maybeSingle()

  return data?.id || null
}

export async function linkTicketsAction(input: { ticketId: string; target: string; relation: 'related' | 'parent_of' | 'child_of' }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.change_status')

  if (!access) return error!
  const targetId = await resolveTicketRef(input.target)

  if (!isUuid(input.ticketId) || !targetId) return denied('Enter a ticket number like SUP-2026-000123.')
  const [source, target] = input.relation === 'child_of' ? [targetId, input.ticketId] : [input.ticketId, targetId]

  const result = await callHelpdeskRpc('forge_support_link_tickets', {
    p_source_ticket_id: source,
    p_target_ticket_id: target,
    p_relation_type: input.relation === 'related' ? 'related' : 'parent_of',
    p_actor_user_id: access.user.id,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    refreshTicket(input.ticketId)
    refreshTicket(targetId)
  }

  return result
}

export async function unlinkTicketsAction(input: { ticketId: string; relationId: string }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.change_status')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_unlink_tickets', {
    p_relation_id: input.relationId,
    p_actor_user_id: access.user.id,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

export async function mergeTicketsAction(input: { duplicateTicketId: string; canonical: string; reason: string }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.merge')

  if (!access) return error!
  const canonicalId = await resolveTicketRef(input.canonical)

  if (!isUuid(input.duplicateTicketId) || !canonicalId) return denied('Enter the ticket number to merge into.')
  const reason = cleanText(input.reason, 2000)

  if (reason.length < 3) return denied('Explain why these tickets are duplicates.')

  const result = await callHelpdeskRpc('forge_support_merge_tickets', {
    p_duplicate_ticket_id: input.duplicateTicketId,
    p_canonical_ticket_id: canonicalId,
    p_actor_user_id: access.user.id,
    p_reason: reason,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    refreshTicket(input.duplicateTicketId)
    refreshTicket(canonicalId)
  }

  return { ...result, canonicalTicketId: canonicalId }
}

export async function removeAttachmentAction(input: { ticketId: string; attachmentId: string; reason: string }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.respond')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_remove_attachment', {
    p_attachment_id: input.attachmentId,
    p_actor_user_id: access.user.id,
    p_actor_type: 'staff',
    p_organization_id: null,
    p_reason: cleanText(input.reason, 500) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

// ---------------------------------------------------------------------------
// AI suggestions (generated on demand, never auto-sent)
// ---------------------------------------------------------------------------
export async function generateSuggestionAction(input: { ticketId: string; type: string }): Promise<ConsoleActionResult> {
  const { access, error } = await staff()

  if (!access) return error!
  if (!isUuid(input.ticketId) || !HELPDESK_SUGGESTION_TYPES.includes(input.type)) return denied('Unsupported suggestion.')

  try {
    const suggestion = await generateTicketSuggestion({ ticketId: input.ticketId, type: input.type, staffUserId: access.user.id })

    refreshTicket(input.ticketId)

    return { ok: true, suggestion }
  } catch (err) {
    console.error('[helpdesk] suggestion', err instanceof Error ? err.message : err)

    return denied('Unable to generate that suggestion right now.')
  }
}

export async function decideSuggestionAction(input: { ticketId: string; suggestionId: string; decision: 'accepted' | 'rejected'; finalOutput?: string | null }): Promise<ConsoleActionResult> {
  const { access, error } = await staff()

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_decide_ai_suggestion', {
    p_suggestion_id: input.suggestionId,
    p_actor_user_id: access.user.id,
    p_decision: input.decision,
    p_final_output: cleanText(input.finalOutput, 20000) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) refreshTicket(input.ticketId)

  return result
}

// ---------------------------------------------------------------------------
// Platform incidents and service status
// ---------------------------------------------------------------------------
const componentList = (raw: unknown) =>
  (Array.isArray(raw) ? raw : [])
    .filter((c: any) => isUuid(c?.component_id) && typeof c?.status === 'string')
    .slice(0, 20)
    .map((c: any) => ({ component_id: c.component_id, status: c.status }))

export async function createIncidentAction(input: {
  title: string
  publicMessage: string
  impact: string
  isPublic: boolean
  allTenantsAffected: boolean
  tenantIds?: string[]
  components?: { component_id: string; status: string }[]
  otherComponentNote?: string
  linkTicketId?: string | null
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.incidents')

  if (!access) return error!
  const meta = await getRequestMeta()

  const result = await callHelpdeskRpc('forge_support_create_incident', {
    p_actor_user_id: access.user.id,
    p_fields: {
      title: cleanText(input.title, 200),
      public_message: cleanText(input.publicMessage, 4000),
      impact: input.impact,
      is_public: input.isPublic === true,
      all_tenants_affected: input.allTenantsAffected === true,
      tenant_ids: uuidList(input.tenantIds, 500),
      components: componentList(input.components),
      other_component_note: cleanText(input.otherComponentNote, 300) || null
    },
    p_meta: meta
  })

  if (result.ok && isUuid(input.linkTicketId)) {
    await callHelpdeskRpc('forge_support_link_incident_ticket', { p_incident_id: result.incident_id, p_ticket_id: input.linkTicketId, p_actor_user_id: access.user.id, p_link: true, p_meta: meta })
    refreshTicket(input.linkTicketId)
  }

  revalidatePath('/help-desk/console/incidents')
  revalidatePath('/help-desk/status')

  return result
}

export async function postIncidentUpdateAction(input: {
  incidentId: string
  status: string
  message: string
  isPublic: boolean
  notifyCustomers: boolean
  ticketAction: 'none' | 'waiting_on_customer' | 'resolved'
  expectedRowVersion: number
  resolution?: { resolution?: string; root_cause?: string; preventive_action?: string }
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.incidents')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_post_incident_update', {
    p_incident_id: input.incidentId,
    p_actor_user_id: access.user.id,
    p_status: input.status,
    p_message: cleanText(input.message, 4000),
    p_is_public: input.isPublic === true,
    p_notify_customers: input.notifyCustomers === true,
    p_ticket_action: ['none', 'waiting_on_customer', 'resolved'].includes(input.ticketAction) ? input.ticketAction : 'none',
    p_expected_row_version: Number(input.expectedRowVersion) || null,
    p_resolution: {
      resolution: cleanText(input.resolution?.resolution, 4000) || null,
      root_cause: cleanText(input.resolution?.root_cause, 4000) || null,
      preventive_action: cleanText(input.resolution?.preventive_action, 4000) || null
    },
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/console/incidents')
    revalidatePath('/help-desk/console/incidents/' + input.incidentId)
    revalidatePath('/help-desk/status')
    refreshTicket(null)
  }

  return result
}

export async function setIncidentScopeAction(input: { incidentId: string; components: { component_id: string; status: string }[]; tenantIds: string[]; allTenants: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.incidents')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_set_incident_scope', {
    p_incident_id: input.incidentId,
    p_actor_user_id: access.user.id,
    p_components: componentList(input.components),
    p_tenant_ids: uuidList(input.tenantIds, 500),
    p_all_tenants: input.allTenants === true,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/console/incidents/' + input.incidentId)
    revalidatePath('/help-desk/status')
  }

  return result
}

export async function linkIncidentTicketAction(input: { incidentId: string; ticket: string; link: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.link_incident')

  if (!access) return error!
  const ticketId = await resolveTicketRef(input.ticket)

  if (!ticketId || !isUuid(input.incidentId)) return denied('Enter a valid ticket number.')

  const result = await callHelpdeskRpc('forge_support_link_incident_ticket', {
    p_incident_id: input.incidentId,
    p_ticket_id: ticketId,
    p_actor_user_id: access.user.id,
    p_link: input.link === true,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    refreshTicket(ticketId)
    revalidatePath('/help-desk/console/incidents/' + input.incidentId)
  }

  return result
}

export async function setComponentStatusAction(input: { componentId: string; status: string; note: string }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.status')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_set_component_status', {
    p_component_id: input.componentId,
    p_actor_user_id: access.user.id,
    p_status: input.status,
    p_note: cleanText(input.note, 1000) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/status')
    revalidatePath('/help-desk/console/incidents')
  }

  return result
}

export async function saveAnnouncementAction(input: {
  announcementId?: string | null
  expectedRowVersion?: number | null
  title: string
  body: string
  announcementType: string
  audience: 'all_users' | 'tenant_admins'
  organizationId?: string | null
  startsAt?: string | null
  endsAt?: string | null
  isActive: boolean
  publish: boolean
  incidentId?: string | null
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.announcements')

  if (!access) return error!
  const date = (value?: string | null) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null)

  const result = await callHelpdeskRpc('forge_support_save_announcement', {
    p_announcement_id: isUuid(input.announcementId) ? input.announcementId : null,
    p_actor_user_id: access.user.id,
    p_fields: {
      title: cleanText(input.title, 200),
      body: cleanText(input.body, 4000),
      announcement_type: input.announcementType,
      audience: input.audience,
      organization_id: isUuid(input.organizationId) ? input.organizationId : null,
      starts_at: date(input.startsAt),
      ends_at: date(input.endsAt),
      is_active: input.isActive === true,
      publish: input.publish === true,
      incident_id: isUuid(input.incidentId) ? input.incidentId : null
    },
    p_expected_row_version: input.expectedRowVersion ?? null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/console/incidents')
    revalidatePath('/help-desk/announcements')
    revalidatePath('/help-desk')
  }

  return result
}

// ---------------------------------------------------------------------------
// Development issues
// ---------------------------------------------------------------------------
export async function createDevelopmentIssueAction(input: {
  ticketId?: string | null
  title: string
  description: string
  issueType: string
  priority: string
  customerImpact?: string
  reproductionSteps?: string
  errorIdentifiers?: string
  knownIssueReference?: string
  pushToProvider?: string | null
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.link_development')

  if (!access) return error!
  const meta = await getRequestMeta()
  const ticketId = isUuid(input.ticketId) ? input.ticketId : null

  const fields = {
    title: cleanText(input.title, 200),
    description: cleanText(input.description, 20000),
    issue_type: input.issueType,
    priority: (HELPDESK_PRIORITIES as readonly string[]).includes(input.priority) ? input.priority : 'p3_normal',
    customer_impact: cleanText(input.customerImpact, 4000),
    reproduction_steps: cleanText(input.reproductionSteps, 8000),
    error_identifiers: cleanText(input.errorIdentifiers, 1000),
    known_issue_reference: cleanText(input.knownIssueReference, 300)
  }

  const result = await callHelpdeskRpc('forge_support_create_development_issue', { p_actor_user_id: access.user.id, p_fields: fields, p_ticket_id: ticketId, p_meta: meta })

  if (!result.ok) return result

  let pushWarning: string | undefined

  if (input.pushToProvider) {
    const provider = getDevelopmentProvider(input.pushToProvider)

    if (!provider) pushWarning = 'The selected development provider is not configured; the issue was kept in Forge.'
    else {
      try {
        const payload = ticketId
          ? await buildDevelopmentIssuePayload(ticketId, {
              summary: fields.title,
              description: fields.description,
              customer_impact: fields.customer_impact,
              reproduction_steps: fields.reproduction_steps,
              error_identifiers: fields.error_identifiers ? fields.error_identifiers.split(/[,\n]/).map(s => s.trim()).filter(Boolean) : [],
              known_issue_reference: fields.known_issue_reference || null
            })
          : null

        if (payload) {
          const ref = await provider.createIssue(payload, `[${result.issue_number}] ${fields.title}`)
          const { data: issue } = await db().from('forge_support_development_issues').select('row_version').eq('id', result.development_issue_id).single()

          await callHelpdeskRpc('forge_support_update_development_issue', {
            p_issue_id: result.development_issue_id,
            p_actor_user_id: access.user.id,
            p_changes: ref,
            p_expected_row_version: issue.row_version,
            p_note: `Pushed to ${provider.label}`,
            p_meta: meta
          })
        }
      } catch (err) {
        console.error('[helpdesk] development provider push', err instanceof Error ? err.message : err)
        pushWarning = 'The issue was created in Forge but could not be pushed to the external tracker.'
      }
    }
  }

  refreshTicket(ticketId)
  revalidatePath('/help-desk/console/development')

  return { ...result, warning: pushWarning }
}

export async function linkDevelopmentIssueAction(input: { issueId: string; ticketId: string; link: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.link_development')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_link_development_issue', {
    p_issue_id: input.issueId,
    p_ticket_id: input.ticketId,
    p_actor_user_id: access.user.id,
    p_link: input.link === true,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    refreshTicket(input.ticketId)
    revalidatePath('/help-desk/console/development/' + input.issueId)
  }

  return result
}

export async function updateDevelopmentIssueAction(input: {
  issueId: string
  expectedRowVersion: number
  state?: string
  fixVersion?: string | null
  priority?: string
  externalProvider?: string
  externalIssueId?: string
  externalUrl?: string
  note?: string
  customerUpdate?: string
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.support.link_development')

  if (!access) return error!
  const changes: Record<string, unknown> = {}

  if (input.state) changes.state = input.state
  if (input.fixVersion !== undefined) changes.fix_version = cleanText(input.fixVersion, 80)
  if (input.priority) changes.priority = input.priority
  if (input.externalProvider) changes.external_provider = input.externalProvider
  if (input.externalIssueId !== undefined) changes.external_issue_id = cleanText(input.externalIssueId, 120)
  if (input.externalUrl !== undefined) changes.external_url = cleanText(input.externalUrl, 500)

  const result = await callHelpdeskRpc('forge_support_update_development_issue', {
    p_issue_id: input.issueId,
    p_actor_user_id: access.user.id,
    p_changes: changes,
    p_expected_row_version: Number(input.expectedRowVersion) || null,
    p_note: cleanText(input.note, 4000) || null,
    p_customer_update: cleanText(input.customerUpdate, 2000) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/console/development')
    revalidatePath('/help-desk/console/development/' + input.issueId)
    refreshTicket(null)
  }

  return result
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------
export async function saveArticleAction(input: {
  articleId?: string | null
  expectedRowVersion?: number | null
  title: string
  slug: string
  summary: string
  body: string
  categoryId: string
  moduleId?: string | null
  visibility: string
  organizationId?: string | null
  searchKeywords?: string
  sourceTicketId?: string | null
  changeNote?: string
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff(input.articleId ? 'helpdesk.knowledge.edit' : 'helpdesk.knowledge.create')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_save_article', {
    p_article_id: isUuid(input.articleId) ? input.articleId : null,
    p_actor_user_id: access.user.id,
    p_fields: {
      title: cleanText(input.title, 200),
      slug: cleanText(input.slug, 120).toLowerCase(),
      summary: cleanText(input.summary, 500),
      body: cleanText(input.body, 100000),
      category_id: input.categoryId,
      module_id: isUuid(input.moduleId) ? input.moduleId : null,
      visibility: input.visibility,
      organization_id: isUuid(input.organizationId) ? input.organizationId : null,
      search_keywords: cleanText(input.searchKeywords, 1000),
      source_ticket_id: isUuid(input.sourceTicketId) ? input.sourceTicketId : null
    },
    p_expected_row_version: input.expectedRowVersion ?? null,
    p_change_note: cleanText(input.changeNote, 500) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/console/knowledge')
    revalidatePath('/help-desk')
  }

  return result
}

export async function transitionArticleAction(input: { articleId: string; toStatus: string; expectedRowVersion: number; note?: string }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.knowledge.edit')

  if (!access) return error!

  const result = await callHelpdeskRpc('forge_support_transition_article', {
    p_article_id: input.articleId,
    p_actor_user_id: access.user.id,
    p_to_status: input.toStatus,
    p_expected_row_version: Number(input.expectedRowVersion) || null,
    p_note: cleanText(input.note, 500) || null,
    p_meta: await getRequestMeta()
  })

  if (result.ok) {
    revalidatePath('/help-desk/console/knowledge')
    revalidatePath('/help-desk/console/knowledge/' + input.articleId)
    revalidatePath('/help-desk')
  }

  return result
}

// ---------------------------------------------------------------------------
// Settings (catalog, SLA, tags, saved replies, teams, general)
// ---------------------------------------------------------------------------
const settingsRefresh = () => {
  revalidatePath('/help-desk/console/settings')
  revalidatePath('/help-desk/console')
}

export async function saveGeneralSettingsAction(input: {
  reopenWindowDays: number
  allowCustomerClose: boolean
  csatEnabled: boolean
  captureTechnicalContext: boolean
  aiAnswerMode: string
  emailNotificationsEnabled: boolean
  attachmentMaxMb: number
  videoMaxMb: number
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.manage')

  if (!access) return error!

  const next = {
    reopen_window_days: Math.round(Number(input.reopenWindowDays)),
    allow_customer_close: input.allowCustomerClose === true,
    csat_enabled: input.csatEnabled === true,
    capture_technical_context: input.captureTechnicalContext === true,
    ai_answer_mode: input.aiAnswerMode,
    email_notifications_enabled: input.emailNotificationsEnabled === true,
    attachment_max_mb: Math.round(Number(input.attachmentMaxMb)),
    video_max_mb: Math.round(Number(input.videoMaxMb))
  }

  if (!(next.reopen_window_days >= 1 && next.reopen_window_days <= 365)) return denied('Reopen window must be 1 to 365 days.')
  if (!['auto', 'knowledge_only', 'disabled'].includes(next.ai_answer_mode)) return denied('Invalid AI answer mode.')
  if (!(next.attachment_max_mb >= 1 && next.attachment_max_mb <= 25 && next.video_max_mb >= 1 && next.video_max_mb <= 25)) return denied('Upload limits must be 1 to 25 MB.')
  const { data: before } = await db().from('forge_support_settings').select('*').eq('id', true).single()
  const { error: updateError } = await db().from('forge_support_settings').update({ ...next, updated_by: access.user.id, updated_at: new Date().toISOString() }).eq('id', true)

  if (updateError) return denied('Unable to save settings.')
  await audit(access, 'helpdesk.settings.updated', 'support_settings', 'global', before, next)
  settingsRefresh()

  return { ok: true }
}

export async function saveSlaPolicyAction(input: {
  policyId?: string | null
  expectedRowVersion?: number | null
  name: string
  priority: string
  organizationId?: string | null
  firstResponseMinutes: number
  nextResponseMinutes?: number | null
  resolutionMinutes: number
  hoursMode: 'calendar' | 'business'
  calendarId?: string | null
  pauseOnWaitingCustomer: boolean
  atRiskPercent: number
  isActive: boolean
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.sla')

  if (!access) return error!

  const row = {
    name: cleanText(input.name, 120),
    priority: input.priority,
    organization_id: isUuid(input.organizationId) ? input.organizationId : null,
    first_response_minutes: Math.round(Number(input.firstResponseMinutes)),
    next_response_minutes: input.nextResponseMinutes ? Math.round(Number(input.nextResponseMinutes)) : null,
    resolution_minutes: Math.round(Number(input.resolutionMinutes)),
    hours_mode: input.hoursMode === 'business' ? 'business' : 'calendar',
    calendar_id: input.hoursMode === 'business' && isUuid(input.calendarId) ? input.calendarId : null,
    pause_on_waiting_customer: input.pauseOnWaitingCustomer === true,
    pause_on_waiting_forge: false,
    at_risk_percent: Math.round(Number(input.atRiskPercent)),
    is_active: input.isActive === true,
    updated_by: access.user.id,
    updated_at: new Date().toISOString()
  }

  if (row.name.length < 2) return denied('Name the SLA policy.')
  if (!(HELPDESK_PRIORITIES as readonly string[]).includes(row.priority)) return denied('Choose a priority.')
  if (!(row.first_response_minutes >= 1 && row.resolution_minutes >= row.first_response_minutes)) return denied('Resolution target must be at least the first response target.')
  if (row.hours_mode === 'business' && !row.calendar_id) return denied('Business-hours policies need a business calendar.')

  if (row.organization_id) {
    const { data: org } = await db().from('organizations').select('id').eq('id', row.organization_id).maybeSingle()

    if (!org) return denied('Tenant not found.')
  }

  const d = db()

  if (isUuid(input.policyId)) {
    const { data: before } = await d.from('forge_support_sla_policies').select('*').eq('id', input.policyId).maybeSingle()

    if (!before) return denied('SLA policy not found.')
    if (input.expectedRowVersion && before.row_version !== input.expectedRowVersion) return { ok: false, conflict: true, error: 'This policy changed after you opened it. Refresh and try again.' }
    const { error: updateError } = await d.from('forge_support_sla_policies').update({ ...row, row_version: before.row_version + 1 }).eq('id', before.id).eq('row_version', before.row_version)

    if (updateError) return denied(updateError.code === '23505' ? 'An active policy already exists for that priority and scope.' : 'Unable to save the SLA policy.')
    await audit(access, 'helpdesk.sla_policy.updated', 'support_sla_policy', before.id, before, row)
  } else {
    const { data: created, error: insertError } = await d.from('forge_support_sla_policies').insert({ ...row, created_by: access.user.id }).select('id').single()

    if (insertError) return denied(insertError.code === '23505' ? 'An active policy already exists for that priority and scope.' : 'Unable to create the SLA policy.')
    await audit(access, 'helpdesk.sla_policy.created', 'support_sla_policy', created.id, null, row)
  }

  settingsRefresh()

  return { ok: true }
}

export async function saveTagAction(input: { tagId?: string | null; label: string; description?: string; color?: string | null; isActive: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.tags')

  if (!access) return error!
  const label = cleanText(input.label, 60)

  if (label.length < 2) return denied('Tag label must be at least 2 characters.')
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const color = input.color && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : null
  const row = { label, slug, description: cleanText(input.description, 300) || null, color, is_active: input.isActive === true, updated_at: new Date().toISOString() }
  const d = db()

  if (isUuid(input.tagId)) {
    const { data: before } = await d.from('forge_support_tags').select('*').eq('id', input.tagId).maybeSingle()

    if (!before) return denied('Tag not found.')
    const { error: updateError } = await d.from('forge_support_tags').update(row).eq('id', before.id)

    if (updateError) return denied(updateError.code === '23505' ? 'A tag with that name already exists.' : 'Unable to save the tag.')
    await audit(access, 'helpdesk.tag.updated', 'support_tag', before.id, before, row)
  } else {
    const { data: created, error: insertError } = await d.from('forge_support_tags').insert({ ...row, created_by: access.user.id }).select('id').single()

    if (insertError) return denied(insertError.code === '23505' ? 'A tag with that name already exists.' : 'Unable to create the tag.')
    await audit(access, 'helpdesk.tag.created', 'support_tag', created.id, null, row)
  }

  settingsRefresh()

  return { ok: true }
}

export async function saveSavedReplyAction(input: { replyId?: string | null; expectedRowVersion?: number | null; name: string; category: string; body: string; teamId?: string | null; isActive: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.templates')

  if (!access) return error!

  const row = {
    name: cleanText(input.name, 120),
    category: cleanText(input.category, 60) || 'general',
    body: cleanText(input.body, 10000),
    team_id: isUuid(input.teamId) ? input.teamId : null,
    is_active: input.isActive === true,
    updated_by: access.user.id,
    updated_at: new Date().toISOString()
  }

  if (row.name.length < 2 || row.body.length < 2) return denied('Saved replies need a name and body.')
  const d = db()

  if (isUuid(input.replyId)) {
    const { data: before } = await d.from('forge_support_saved_replies').select('*').eq('id', input.replyId).maybeSingle()

    if (!before) return denied('Saved reply not found.')
    if (input.expectedRowVersion && before.row_version !== input.expectedRowVersion) return { ok: false, conflict: true, error: 'This saved reply changed after you opened it. Refresh and try again.' }
    const { error: updateError } = await d.from('forge_support_saved_replies').update({ ...row, row_version: before.row_version + 1 }).eq('id', before.id).eq('row_version', before.row_version)

    if (updateError) return denied('Unable to save the reply.')
    await audit(access, 'helpdesk.saved_reply.updated', 'support_saved_reply', before.id, { name: before.name, body: before.body }, { name: row.name, body: row.body })
  } else {
    const { data: created, error: insertError } = await d.from('forge_support_saved_replies').insert({ ...row, created_by: access.user.id }).select('id').single()

    if (insertError) return denied('Unable to create the reply.')
    await audit(access, 'helpdesk.saved_reply.created', 'support_saved_reply', created.id, null, { name: row.name })
  }

  settingsRefresh()

  return { ok: true }
}

export async function saveCatalogItemAction(input: {
  kind: 'category' | 'area'
  id?: string | null
  label: string
  key?: string
  description?: string
  defaultPriority?: string | null
  isActive: boolean
  sortOrder: number
}): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.categories')

  if (!access) return error!
  const label = cleanText(input.label, 120)

  if (label.length < 2) return denied('Label must be at least 2 characters.')
  const key = (cleanText(input.key, 60) || label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const table = input.kind === 'category' ? 'forge_support_categories' : 'forge_support_product_areas'
  const row: Record<string, unknown> = { label, is_active: input.isActive === true, sort_order: Math.round(Number(input.sortOrder) || 0), updated_at: new Date().toISOString() }

  if (input.kind === 'category') {
    row.description = cleanText(input.description, 300) || null
    row.default_priority = input.defaultPriority && (HELPDESK_PRIORITIES as readonly string[]).includes(input.defaultPriority) ? input.defaultPriority : null
  }

  const d = db()

  if (isUuid(input.id)) {
    const { data: before } = await d.from(table).select('*').eq('id', input.id).maybeSingle()

    if (!before) return denied('Item not found.')
    const { error: updateError } = await d.from(table).update(row).eq('id', before.id)

    if (updateError) return denied('Unable to save.')
    await audit(access, `helpdesk.catalog.${input.kind}.updated`, 'support_catalog', before.id, before, row)
  } else {
    if (input.kind === 'category') row.category_key = key
    else {
      const { data: product } = await d.from('forge_support_products').select('id').eq('product_key', 'forge_industrial_safety').single()

      row.area_key = key
      row.product_id = product.id
    }

    const { data: created, error: insertError } = await d.from(table).insert(row).select('id').single()

    if (insertError) return denied(insertError.code === '23505' ? 'That key already exists.' : 'Unable to create.')
    await audit(access, `helpdesk.catalog.${input.kind}.created`, 'support_catalog', created.id, null, row)
  }

  settingsRefresh()

  return { ok: true }
}

export async function setTeamMemberAction(input: { teamId: string; userId: string; member: boolean; isLead?: boolean }): Promise<ConsoleActionResult> {
  const { access, error } = await staff('helpdesk.admin.manage')

  if (!access) return error!
  if (!isUuid(input.teamId) || !isUuid(input.userId)) return denied('Invalid team member.')
  const d = db()
  const { data: platformUser } = await d.from('forge_platform_users').select('user_id').eq('user_id', input.userId).eq('is_active', true).maybeSingle()

  if (!platformUser) return denied('Only active Forge staff can join support teams.')

  if (input.member) {
    const { error: upsertError } = await d.from('forge_support_team_members').upsert({ team_id: input.teamId, user_id: input.userId, is_lead: input.isLead === true }, { onConflict: 'team_id,user_id' })

    if (upsertError) return denied('Unable to update the team.')
  } else {
    await d.from('forge_support_team_members').delete().eq('team_id', input.teamId).eq('user_id', input.userId)
  }

  await audit(access, input.member ? 'helpdesk.team.member_set' : 'helpdesk.team.member_removed', 'support_team', input.teamId, null, { user_id: input.userId, is_lead: input.isLead === true })
  settingsRefresh()

  return { ok: true }
}
