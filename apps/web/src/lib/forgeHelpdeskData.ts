import { createServiceRoleClient } from '@repo/supabase/server'

import {
  applyCustomerScope,
  customerTicketScope,
  isUuid,
  type HelpdeskCustomerAccess,
  type HelpdeskStaffAccess
} from '@/lib/forgeHelpdeskAccess'
import { HELPDESK_ACTIVE_STATUSES } from '@/lib/forgeHelpdesk'

const db = () => createServiceRoleClient() as any

const fail = (context: string, error: any) => {
  console.error('[helpdesk]', context, error?.message || error)
  throw new Error('Unable to load ' + context + '.')
}

// ---------------------------------------------------------------------------
// Catalog & settings
// ---------------------------------------------------------------------------
export type HelpdeskSettings = {
  reopen_window_days: number
  allow_customer_close: boolean
  csat_enabled: boolean
  capture_technical_context: boolean
  ai_answer_mode: 'auto' | 'knowledge_only' | 'disabled'
  email_notifications_enabled: boolean
  attachment_max_mb: number
  video_max_mb: number
}

export const getHelpdeskSettings = async (): Promise<HelpdeskSettings> => {
  const { data, error } = await db().from('forge_support_settings').select('*').eq('id', true).single()

  if (error) fail('help desk settings', error)

  return data
}

export const getHelpdeskCatalog = async ({ includeInactive = false } = {}) => {
  let products = db().from('forge_support_products').select('id,product_key,name,description,is_active,sort_order').order('sort_order')
  let areas = db().from('forge_support_product_areas').select('id,product_id,area_key,label,feature_key,is_active,sort_order').order('sort_order')
  let categories = db().from('forge_support_categories').select('id,category_key,label,description,product_id,default_priority,is_active,sort_order').order('sort_order')

  if (!includeInactive) {
    products = products.eq('is_active', true)
    areas = areas.eq('is_active', true)
    categories = categories.eq('is_active', true)
  }

  const [p, a, c] = await Promise.all([products, areas, categories])

  if (p.error || a.error || c.error) fail('help desk catalog', p.error || a.error || c.error)

  return { products: p.data || [], areas: a.data || [], categories: c.data || [] }
}

const userNames = async (ids: (string | null | undefined)[]) => {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]

  if (!unique.length) return new Map<string, { name: string; email: string | null }>()
  const { data } = await db().from('users').select('user_id,name,email').in('user_id', unique)

  return new Map<string, { name: string; email: string | null }>(
    (data || []).map((row: any) => [row.user_id, { name: row.name || row.email || 'Forge user', email: row.email }])
  )
}

// ---------------------------------------------------------------------------
// Customer tickets
// ---------------------------------------------------------------------------
const CUSTOMER_TICKET_FIELDS =
  'id,organization_id,ticket_number,subject,status,priority,customer_reported_severity,source,requester_user_id,requester_name,location_id,' +
  'category_id,module_id,product_id,created_at,updated_at,resolved_at,closed_at,merged_into_ticket_id,first_responded_at,row_version'

export const listCustomerTickets = async (
  access: HelpdeskCustomerAccess,
  { status = 'active', q = '', mineOnly = false }: { status?: string; q?: string; mineOnly?: boolean } = {}
) => {
  const scope = await customerTicketScope(access)
  let query = db()
    .from('forge_support_tickets')
    .select(CUSTOMER_TICKET_FIELDS + ',category:forge_support_categories(label),module:forge_support_product_areas(label),location:locations(name)')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(200)

  query = mineOnly ? query.eq('organization_id', access.organizationId).eq('requester_user_id', access.user.id) : applyCustomerScope(query, access, scope)
  if (status === 'active') query = query.in('status', HELPDESK_ACTIVE_STATUSES)
  else if (status === 'closed') query = query.in('status', ['resolved', 'closed'])
  else if (status !== 'all') query = query.eq('status', status)
  const term = q.trim().slice(0, 100)

  if (term) {
    query = /^SUP-\d{4}-\d+$/i.test(term) ? query.eq('ticket_number', term.toUpperCase()) : query.textSearch('search_vector', term, { type: 'websearch', config: 'english' })
  }

  const { data, error } = await query

  if (error) fail('tickets', error)

  return { tickets: data || [], canSeeOthers: scope.tenant || scope.locationIds.length > 0 || scope.watchedIds.length > 0 }
}

export const getCustomerTicketDetail = async (access: HelpdeskCustomerAccess, id: string) => {
  if (!isUuid(id)) return null

  const { data: ticket, error } = await db()
    .from('forge_support_tickets')
    .select(
      CUSTOMER_TICKET_FIELDS +
        ',description,resolution_summary,fix_version,reopen_count,category:forge_support_categories(label),module:forge_support_product_areas(label),' +
        'product:forge_support_products(name),location:locations(name)'
    )
    .eq('id', id)
    .eq('organization_id', access.organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) fail('ticket', error)
  if (!ticket) return null
  const scope = await customerTicketScope(access)

  if (!scope.canView(ticket)) return null

  const [messages, events, attachments, csat, incidents, merged, settings] = await Promise.all([
    db()
      .from('forge_support_messages')
      .select('id,author_user_id,author_kind,message_type,body,created_at')
      .eq('ticket_id', id)
      .eq('organization_id', access.organizationId)
      .eq('visibility', 'public')
      .is('deleted_at', null)
      .order('created_at')
      .limit(500),
    db()
      .from('forge_support_events')
      .select('id,event_type,from_value,to_value,detail,created_at')
      .eq('ticket_id', id)
      .eq('organization_id', access.organizationId)
      .eq('visibility', 'public')
      .order('created_at')
      .limit(500),
    db()
      .from('forge_support_attachments')
      .select('id,file_name,mime_type,byte_size,uploaded_by,created_at')
      .eq('ticket_id', id)
      .eq('organization_id', access.organizationId)
      .eq('visibility', 'public')
      .is('deleted_at', null)
      .order('created_at'),
    db().from('forge_support_customer_satisfaction').select('rating,comment,submitted_at').eq('ticket_id', id).maybeSingle(),
    db()
      .from('forge_support_incident_tickets')
      .select('incident:forge_support_platform_incidents(id,incident_number,title,status,impact,public_message,is_public,started_at,resolved_at)')
      .eq('ticket_id', id)
      .is('unlinked_at', null),
    ticket.merged_into_ticket_id
      ? db().from('forge_support_tickets').select('id,ticket_number').eq('id', ticket.merged_into_ticket_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getHelpdeskSettings()
  ])

  if (messages.error || events.error || attachments.error) fail('ticket conversation', messages.error || events.error || attachments.error)
  const authors = await userNames((messages.data || []).map((m: any) => m.author_user_id))
  const reference = ticket.closed_at || ticket.resolved_at
  const withinReopenWindow = !reference || Date.now() - new Date(reference).getTime() <= settings.reopen_window_days * 86400000

  return {
    ticket,
    messages: (messages.data || []).map((m: any) => ({
      ...m,
      author_name: m.author_kind === 'forge' ? (authors.get(m.author_user_id)?.name || 'Forge Support') + ' (Forge Support)' : m.author_kind === 'system' ? 'Forge' : authors.get(m.author_user_id)?.name || 'Customer'
    })),
    events: events.data || [],
    attachments: attachments.data || [],
    csat: csat.data || null,
    incidents: (incidents.data || []).map((row: any) => row.incident).filter((i: any) => i && i.is_public),
    mergedInto: merged.data || null,
    settings,
    permissions: {
      canReply: access.has('helpdesk.ticket.comment') && !ticket.merged_into_ticket_id && !['resolved', 'closed'].includes(ticket.status),
      canAttach: access.has('helpdesk.ticket.comment') && !['resolved', 'closed'].includes(ticket.status),
      canReopen: access.has('helpdesk.ticket.reopen') && ['resolved', 'closed'].includes(ticket.status) && !ticket.merged_into_ticket_id && withinReopenWindow,
      canClose: access.has('helpdesk.ticket.close') && settings.allow_customer_close && !['closed'].includes(ticket.status) && !ticket.merged_into_ticket_id,
      canRate: settings.csat_enabled && ticket.requester_user_id === access.user.id && ['resolved', 'closed'].includes(ticket.status) && !csat.data && !ticket.merged_into_ticket_id
    }
  }
}

// ---------------------------------------------------------------------------
// Console (Forge staff)
// ---------------------------------------------------------------------------
export const CONSOLE_QUEUES = [
  { key: 'open', label: 'All open' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'my_teams', label: 'My teams' },
  { key: 'breached', label: 'SLA breached' },
  { key: 'at_risk', label: 'SLA at risk' },
  { key: 'p1', label: 'P1 critical' },
  { key: 'waiting_on_customer', label: 'Waiting on customer' },
  { key: 'waiting_on_forge', label: 'Waiting on Forge' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'known_issue', label: 'Known issues' },
  { key: 'feature_request', label: 'Feature requests' },
  { key: 'resolved', label: 'Resolved / closed' },
  { key: 'all', label: 'All tickets' }
] as const

export type ConsoleFilters = {
  queue?: string
  q?: string
  organizationId?: string
  productId?: string
  moduleId?: string
  categoryId?: string
  priority?: string
  status?: string
  assigneeId?: string
  from?: string
  to?: string
}

const CONSOLE_LIST_FIELDS =
  'id,organization_id,ticket_number,subject,status,priority,sla_state,first_response_due_at,resolution_due_at,next_response_due_at,' +
  'assigned_user_id,assigned_team_id,disposition,escalation_level,source,requester_name,created_at,updated_at,merged_into_ticket_id,' +
  'organization:organizations(name),category:forge_support_categories(label),module:forge_support_product_areas(label),team:forge_support_teams(name)'

export const listConsoleTickets = async (staff: HelpdeskStaffAccess, filters: ConsoleFilters) => {
  let query = db().from('forge_support_tickets').select(CONSOLE_LIST_FIELDS).is('deleted_at', null).limit(300)
  const queue = filters.queue || 'open'
  const open = HELPDESK_ACTIVE_STATUSES

  switch (queue) {
    case 'unassigned':
      query = query.in('status', open).is('assigned_user_id', null)
      break
    case 'mine':
      query = query.in('status', open).eq('assigned_user_id', staff.user.id)
      break

    case 'my_teams': {
      const { data: teams } = await db().from('forge_support_team_members').select('team_id').eq('user_id', staff.user.id)
      const ids = (teams || []).map((t: any) => t.team_id)

      query = query.in('status', open).in('assigned_team_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
      break
    }

    case 'breached':
      query = query.in('status', open).eq('sla_state', 'breached')
      break
    case 'at_risk':
      query = query.in('status', open).eq('sla_state', 'at_risk')
      break
    case 'p1':
      query = query.in('status', open).eq('priority', 'p1_critical')
      break
    case 'waiting_on_customer':
    case 'waiting_on_forge':
      query = query.eq('status', queue)
      break
    case 'escalated':
      query = query.in('status', open).gt('escalation_level', 0)
      break
    case 'known_issue':
    case 'feature_request':
      query = query.eq('disposition', queue)
      break
    case 'resolved':
      query = query.in('status', ['resolved', 'closed'])
      break
    case 'all':
      break
    default:
      query = query.in('status', open)
  }

  if (isUuid(filters.organizationId)) query = query.eq('organization_id', filters.organizationId)
  if (isUuid(filters.productId)) query = query.eq('product_id', filters.productId)
  if (isUuid(filters.moduleId)) query = query.eq('module_id', filters.moduleId)
  if (isUuid(filters.categoryId)) query = query.eq('category_id', filters.categoryId)
  if (filters.priority && /^p[1-4]_[a-z]+$/.test(filters.priority)) query = query.eq('priority', filters.priority)
  if (filters.status && /^[a-z_]+$/.test(filters.status)) query = query.eq('status', filters.status)
  if (filters.assigneeId === 'none') query = query.is('assigned_user_id', null)
  else if (isUuid(filters.assigneeId)) query = query.eq('assigned_user_id', filters.assigneeId)
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) query = query.gte('created_at', new Date(filters.from).toISOString())
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) query = query.lt('created_at', new Date(new Date(filters.to).getTime() + 86400000).toISOString())
  const term = (filters.q || '').trim().slice(0, 120)

  if (term) {
    query = /^SUP-\d{4}-\d+$/i.test(term)
      ? query.eq('ticket_number', term.toUpperCase())
      : query.textSearch('search_vector', term, { type: 'websearch', config: 'english' })
  }

  query =
    queue === 'resolved' || queue === 'all'
      ? query.order('updated_at', { ascending: false })
      : query.order('priority').order('resolution_due_at', { ascending: true, nullsFirst: false })
  const { data, error } = await query

  if (error) fail('console queue', error)
  const names = await userNames((data || []).map((t: any) => t.assigned_user_id))

  return (data || []).map((t: any) => ({ ...t, assignee_name: t.assigned_user_id ? names.get(t.assigned_user_id)?.name || 'Forge staff' : null }))
}

const countTickets = async (apply: (q: any) => any) => {
  const { count, error } = await apply(db().from('forge_support_tickets').select('id', { count: 'exact', head: true }).is('deleted_at', null))

  if (error) fail('scorecards', error)

  return count || 0
}

export const getConsoleScorecards = async (staffUserId: string) => {
  const startOfDay = new Date()

  startOfDay.setHours(0, 0, 0, 0)
  const open = HELPDESK_ACTIVE_STATUSES

  const [openCount, newToday, unassigned, breached, atRisk, waitingCustomer, p1, mine, resolvedToday] = await Promise.all([
    countTickets(q => q.in('status', open)),
    countTickets(q => q.gte('created_at', startOfDay.toISOString())),
    countTickets(q => q.in('status', open).is('assigned_user_id', null)),
    countTickets(q => q.in('status', open).eq('sla_state', 'breached')),
    countTickets(q => q.in('status', open).eq('sla_state', 'at_risk')),
    countTickets(q => q.eq('status', 'waiting_on_customer')),
    countTickets(q => q.in('status', open).eq('priority', 'p1_critical')),
    countTickets(q => q.in('status', open).eq('assigned_user_id', staffUserId)),
    countTickets(q => q.gte('resolved_at', startOfDay.toISOString()))
  ])

  return { openCount, newToday, unassigned, breached, atRisk, waitingCustomer, p1, mine, resolvedToday }
}

export const listAssignableStaff = async () => {
  const { data: roles } = await db().from('forge_support_platform_role_permissions').select('platform_role').eq('permission_key', 'helpdesk.support.respond')
  const roleKeys = (roles || []).map((r: any) => r.platform_role)

  if (!roleKeys.length) return []
  const { data, error } = await db().from('forge_platform_users').select('user_id,platform_role').eq('is_active', true).in('platform_role', roleKeys)

  if (error) fail('support staff', error)
  const names = await userNames((data || []).map((row: any) => row.user_id))
  const { data: members } = await db().from('forge_support_team_members').select('team_id,user_id')

  return (data || [])
    .map((row: any) => ({
      user_id: row.user_id,
      platform_role: row.platform_role,
      name: names.get(row.user_id)?.name || 'Forge staff',
      email: names.get(row.user_id)?.email || null,
      team_ids: (members || []).filter((m: any) => m.user_id === row.user_id).map((m: any) => m.team_id)
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name))
}

export const getConsoleTicketDetail = async (id: string) => {
  if (!isUuid(id)) return null

  const { data: ticket, error } = await db()
    .from('forge_support_tickets')
    .select(
      '*,organization:organizations(id,name,slug,status),category:forge_support_categories(id,label),module:forge_support_product_areas(id,label),' +
        'product:forge_support_products(id,name,product_key),team:forge_support_teams(id,name),location:locations(id,name),division:divisions(id,name)'
    )
    .eq('id', id)
    .maybeSingle()

  if (error) fail('ticket', error)
  if (!ticket) return null
  const d = db()

  const [
    context,
    messages,
    mentions,
    events,
    attachments,
    statusHistory,
    priorityHistory,
    assignments,
    tags,
    watchers,
    relations,
    incidentLinks,
    devLinks,
    sla,
    slaEvents,
    suggestions,
    csat,
    tenantTickets,
    assist,
    merged,
    mergedFrom
  ] = await Promise.all([
    d.from('forge_support_ticket_technical_context').select('*').eq('ticket_id', id).maybeSingle(),
    d.from('forge_support_messages').select('id,author_user_id,author_kind,visibility,message_type,body,saved_reply_id,ai_suggestion_id,source_ticket_id,created_at').eq('ticket_id', id).is('deleted_at', null).order('created_at').limit(1000),
    d.from('forge_support_message_mentions').select('message_id,mentioned_user_id').eq('ticket_id', id),
    d.from('forge_support_events').select('id,actor_user_id,event_type,from_value,to_value,detail,visibility,metadata,created_at').eq('ticket_id', id).order('created_at').limit(1000),
    d.from('forge_support_attachments').select('id,file_name,mime_type,byte_size,visibility,uploaded_by,scan_status,scan_provider,sha256,created_at').eq('ticket_id', id).is('deleted_at', null).order('created_at'),
    d.from('forge_support_ticket_status_history').select('from_status,to_status,changed_by,actor_type,reason,created_at').eq('ticket_id', id).order('created_at'),
    d.from('forge_support_ticket_priority_history').select('from_priority,to_priority,changed_by,reason,created_at').eq('ticket_id', id).order('created_at'),
    d.from('forge_support_ticket_assignments').select('from_user_id,to_user_id,from_team_id,to_team_id,assigned_by,reason,created_at').eq('ticket_id', id).order('created_at'),
    d.from('forge_support_ticket_tags').select('tag:forge_support_tags(id,label,slug,color)').eq('ticket_id', id),
    d.from('forge_support_ticket_watchers').select('user_id,watcher_type,created_at').eq('ticket_id', id),
    d.from('forge_support_ticket_relations').select('id,source_ticket_id,target_ticket_id,relation_type,created_at').or(`source_ticket_id.eq.${id},target_ticket_id.eq.${id}`).is('archived_at', null),
    d.from('forge_support_incident_tickets').select('id,linked_at,incident:forge_support_platform_incidents(id,incident_number,title,status,impact)').eq('ticket_id', id).is('unlinked_at', null),
    d.from('forge_support_development_links').select('id,linked_at,issue:forge_support_development_issues(id,issue_number,title,state,issue_type,fix_version,external_provider,external_url)').eq('ticket_id', id).is('unlinked_at', null),
    d.from('forge_support_sla_instances').select('*').eq('ticket_id', id).maybeSingle(),
    d.from('forge_support_sla_events').select('event_type,target,detail,occurred_at').eq('ticket_id', id).order('occurred_at'),
    d.from('forge_support_ai_suggestions').select('id,suggestion_type,provider,model,output,output_text,status,generated_by,generated_at,decided_by,decided_at,final_output,used_in_message_id').eq('ticket_id', id).order('generated_at', { ascending: false }).limit(30),
    d.from('forge_support_customer_satisfaction').select('rating,comment,submitted_at').eq('ticket_id', id).maybeSingle(),
    d.from('forge_support_tickets').select('id,ticket_number,subject,status,priority,created_at').eq('organization_id', ticket.organization_id).neq('id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
    ticket.assist_session_id ? d.from('forge_support_assist_sessions').select('question,answer,answer_provider,troubleshooting_steps,article_ids,viewed_article_ids,created_at').eq('id', ticket.assist_session_id).maybeSingle() : Promise.resolve({ data: null }),
    ticket.merged_into_ticket_id ? d.from('forge_support_tickets').select('id,ticket_number,subject').eq('id', ticket.merged_into_ticket_id).maybeSingle() : Promise.resolve({ data: null }),
    d.from('forge_support_tickets').select('id,ticket_number,subject').eq('merged_into_ticket_id', id)
  ])

  for (const result of [messages, events, attachments]) if (result.error) fail('ticket workspace', result.error)

  const relatedIds = (relations.data || []).map((r: any) => (r.source_ticket_id === id ? r.target_ticket_id : r.source_ticket_id))

  const { data: relatedTickets } = relatedIds.length
    ? await d.from('forge_support_tickets').select('id,ticket_number,subject,status').in('id', relatedIds)
    : { data: [] }

  const people = await userNames([
    ticket.requester_user_id,
    ticket.assigned_user_id,
    ...(messages.data || []).map((m: any) => m.author_user_id),
    ...(events.data || []).map((e: any) => e.actor_user_id),
    ...(watchers.data || []).map((w: any) => w.user_id),
    ...(mentions.data || []).map((m: any) => m.mentioned_user_id),
    ...(attachments.data || []).map((a: any) => a.uploaded_by),
    ...(suggestions.data || []).map((s: any) => s.decided_by)
  ])

  const nameOf = (uid: string | null | undefined) => (uid ? people.get(uid)?.name || 'Unknown user' : 'System')

  return {
    ticket,
    technicalContext: context.data || null,
    messages: (messages.data || []).map((m: any) => ({
      ...m,
      author_name: m.author_kind === 'system' ? 'Forge' : nameOf(m.author_user_id),
      mentions: (mentions.data || []).filter((x: any) => x.message_id === m.id).map((x: any) => nameOf(x.mentioned_user_id))
    })),
    events: (events.data || []).map((e: any) => ({ ...e, actor_name: nameOf(e.actor_user_id) })),
    attachments: (attachments.data || []).map((a: any) => ({ ...a, uploaded_by_name: nameOf(a.uploaded_by) })),
    statusHistory: statusHistory.data || [],
    priorityHistory: priorityHistory.data || [],
    assignments: assignments.data || [],
    tags: (tags.data || []).map((t: any) => t.tag).filter(Boolean),
    watchers: (watchers.data || []).map((w: any) => ({ ...w, name: nameOf(w.user_id), email: people.get(w.user_id)?.email || null })),
    relations: (relations.data || []).map((r: any) => {
      const otherId = r.source_ticket_id === id ? r.target_ticket_id : r.source_ticket_id
      const other = (relatedTickets || []).find((t: any) => t.id === otherId)

      const direction =
        r.relation_type === 'parent_of' ? (r.source_ticket_id === id ? 'Parent of' : 'Child of') : r.relation_type === 'duplicate_of' ? (r.source_ticket_id === id ? 'Duplicate of' : 'Has duplicate') : 'Related to'

      return { ...r, direction, other }
    }),
    incidents: (incidentLinks.data || []).filter((l: any) => l.incident),
    developmentLinks: (devLinks.data || []).filter((l: any) => l.issue),
    sla: sla.data || null,
    slaEvents: slaEvents.data || [],
    suggestions: (suggestions.data || []).map((s: any) => ({ ...s, decided_by_name: s.decided_by ? nameOf(s.decided_by) : null })),
    csat: csat.data || null,
    tenantTickets: tenantTickets.data || [],
    assist: assist.data || null,
    mergedInto: merged.data || null,
    mergedFrom: mergedFrom.data || [],
    requester: { name: ticket.requester_name || nameOf(ticket.requester_user_id), email: ticket.requester_email || people.get(ticket.requester_user_id)?.email || null },
    assigneeName: ticket.assigned_user_id ? nameOf(ticket.assigned_user_id) : null
  }
}

export const getConsoleReferenceData = async () => {
  const d = db()

  const [teams, savedReplies, tags, incidents, devIssues, staff] = await Promise.all([
    d.from('forge_support_teams').select('id,team_key,name,is_active,is_default_triage').eq('is_active', true).order('name'),
    d.from('forge_support_saved_replies').select('id,name,category,body').eq('is_active', true).order('category').order('name'),
    d.from('forge_support_tags').select('id,label,slug,color,organization_id').eq('is_active', true).order('label'),
    d.from('forge_support_platform_incidents').select('id,incident_number,title,status,impact').neq('status', 'resolved').order('started_at', { ascending: false }),
    d.from('forge_support_development_issues').select('id,issue_number,title,state,issue_type').not('state', 'in', '(closed,wont_fix,duplicate)').order('created_at', { ascending: false }).limit(100),
    listAssignableStaff()
  ])

  return {
    teams: teams.data || [],
    savedReplies: savedReplies.data || [],
    tags: tags.data || [],
    activeIncidents: incidents.data || [],
    openDevelopmentIssues: devIssues.data || [],
    staff
  }
}

// Duplicate candidates: same tenant, open, similar text (Postgres full-text OR match).
export const findSimilarTickets = async (ticket: { id: string; organization_id: string; subject: string }, { sameTenantOnly = true } = {}) => {
  const words = ticket.subject
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 8)

  if (!words.length) return []
  let query = db()
    .from('forge_support_tickets')
    .select('id,organization_id,ticket_number,subject,status,priority,created_at,organization:organizations(name)')
    .neq('id', ticket.id)
    .is('deleted_at', null)
    .is('merged_into_ticket_id', null)
    .textSearch('search_vector', words.join(' or '), { type: 'websearch', config: 'english' })
    .order('created_at', { ascending: false })
    .limit(10)

  if (sameTenantOnly) query = query.eq('organization_id', ticket.organization_id)
  const { data } = await query

  return data || []
}

// ---------------------------------------------------------------------------
// Service status, incidents, announcements
// ---------------------------------------------------------------------------
export const getServiceStatus = async ({ includeInternal = false } = {}) => {
  const d = db()
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  let active = d
    .from('forge_support_platform_incidents')
    .select('id,incident_number,title,public_message,status,impact,started_at,identified_at,monitoring_at,is_public,components:forge_support_incident_components(component_status,component:forge_support_platform_components(name))')
    .neq('status', 'resolved')
    .order('started_at', { ascending: false })
  let resolved = d
    .from('forge_support_platform_incidents')
    .select('id,incident_number,title,public_message,status,impact,started_at,resolved_at,is_public')
    .eq('status', 'resolved')
    .gte('resolved_at', since)
    .order('resolved_at', { ascending: false })

  if (!includeInternal) {
    active = active.eq('is_public', true)
    resolved = resolved.eq('is_public', true)
  }

  const [components, activeIncidents, recentIncidents, maintenance] = await Promise.all([
    d.from('forge_support_platform_components').select('id,component_key,name,description,current_status,status_updated_at,sort_order').eq('is_active', true).order('sort_order'),
    active,
    resolved,
    d
      .from('forge_support_announcements')
      .select('id,title,body,starts_at,ends_at')
      .eq('announcement_type', 'planned_maintenance')
      .is('organization_id', null)
      .eq('is_active', true)
      .not('published_at', 'is', null)
      .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
      .order('starts_at')
  ])

  if (components.error || activeIncidents.error || recentIncidents.error) fail('service status', components.error || activeIncidents.error || recentIncidents.error)
  const incidentIds = [...(activeIncidents.data || []), ...(recentIncidents.data || [])].map((i: any) => i.id)

  const { data: updates } = incidentIds.length
    ? await d.from('forge_support_incident_updates').select('incident_id,status,message,created_at').in('incident_id', incidentIds).eq('is_public', true).order('created_at', { ascending: false })
    : { data: [] }

  const comps = components.data || []

  const overall = comps.some((c: any) => c.current_status === 'major_outage')
    ? 'major_outage'
    : comps.some((c: any) => c.current_status === 'partial_outage')
      ? 'partial_outage'
      : comps.some((c: any) => c.current_status === 'degraded_performance')
        ? 'degraded_performance'
        : comps.some((c: any) => c.current_status === 'maintenance')
          ? 'maintenance'
          : 'operational'

  const withUpdates = (list: any[]) => list.map(i => ({ ...i, updates: (updates || []).filter((u: any) => u.incident_id === i.id) }))

  return {
    overall,
    components: comps,
    activeIncidents: withUpdates(activeIncidents.data || []),
    recentIncidents: withUpdates(recentIncidents.data || []),
    maintenance: maintenance.data || []
  }
}

export const listCustomerAnnouncements = async (access: HelpdeskCustomerAccess, { limit = 20 } = {}) => {
  const { data, error } = await db()
    .from('forge_support_announcements')
    .select('id,title,body,announcement_type,organization_id,audience,starts_at,ends_at,published_at,incident_id')
    .eq('is_active', true)
    .not('published_at', 'is', null)
    .or(`organization_id.is.null,organization_id.eq.${access.organizationId}`)
    .order('published_at', { ascending: false })
    .limit(limit * 2)

  if (error) fail('announcements', error)

  return (data || []).filter(
    (a: any) =>
      (!a.ends_at || new Date(a.ends_at).getTime() > Date.now()) &&
      (a.audience !== 'tenant_admins' || access.has('helpdesk.ticket.view_tenant')) &&
      (a.announcement_type === 'planned_maintenance' || new Date(a.starts_at).getTime() <= Date.now())
  ).slice(0, limit)
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export const ANALYTICS_RANGES = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'custom', label: 'Custom' }
] as const

export const resolveAnalyticsRange = (range: string | undefined, from?: string, to?: string) => {
  const end = new Date()
  const start = new Date()

  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0)
      break
    case '7d':
      start.setDate(start.getDate() - 7)
      break
    case '90d':
      start.setDate(start.getDate() - 90)
      break

    case 'custom': {
      const f = from ? new Date(from) : null
      const t = to ? new Date(to) : null

      if (f && t && !Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && t >= f) {
        const inclusiveEnd = new Date(t.getTime() + 86400000)

        if (inclusiveEnd.getTime() - f.getTime() <= 400 * 86400000) return { key: 'custom', from: f, to: inclusiveEnd }
      }

      start.setDate(start.getDate() - 30)

      return { key: '30d', from: start, to: end }
    }

    default:
      start.setDate(start.getDate() - 30)

      return { key: '30d', from: start, to: end }
  }

  return { key: range as string, from: start, to: end }
}

export const getHelpdeskAnalytics = async ({ from, to, organizationId, productId }: { from: Date; to: Date; organizationId?: string; productId?: string }) => {
  const { data, error } = await db().rpc('forge_support_analytics', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_organization_id: isUuid(organizationId) ? organizationId : null,
    p_product_id: isUuid(productId) ? productId : null
  })

  if (error) fail('analytics', error)

  return data as Record<string, any>
}

// Lazy SLA evaluation for console loads; the cron route is the scheduled path.
let lastSlaEvaluation = 0

export const evaluateSlaIfStale = async (maxAgeMs = 60000) => {
  if (Date.now() - lastSlaEvaluation < maxAgeMs) return
  lastSlaEvaluation = Date.now()
  const { error } = await db().rpc('forge_support_evaluate_sla', {})

  if (error) console.error('[helpdesk] SLA evaluation failed', error.message)
}
