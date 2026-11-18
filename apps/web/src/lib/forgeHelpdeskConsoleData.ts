import { createServiceRoleClient } from '@repo/supabase/server'

import { isUuid } from '@/lib/forgeHelpdeskAccess'
import { HELPDESK_ACTIVE_STATUSES } from '@/lib/forgeHelpdesk'
import { getHelpdeskCatalog, getHelpdeskSettings, listAssignableStaff } from '@/lib/forgeHelpdeskData'

const db = () => createServiceRoleClient() as any

const fail = (context: string, error: any) => {
  console.error('[helpdesk-console]', context, error?.message || error)
  throw new Error('Unable to load ' + context + '.')
}

const names = async (ids: (string | null | undefined)[]) => {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]

  if (!unique.length) return new Map<string, string>()
  const { data } = await db().from('users').select('user_id,name,email').in('user_id', unique)

  return new Map<string, string>((data || []).map((row: any) => [row.user_id, row.name || row.email || 'Forge user']))
}

export const listTenantOptions = async () => {
  const { data, error } = await db().from('organizations').select('id,name,status').order('name').limit(1000)

  if (error) fail('tenants', error)

  return (data || []) as { id: string; name: string; status: string | null }[]
}

// ---------------------------------------------------------------------------
// Incidents, components, announcements
// ---------------------------------------------------------------------------
export const listIncidents = async ({ status }: { status?: string } = {}) => {
  let query = db()
    .from('forge_support_platform_incidents')
    .select('id,incident_number,title,status,impact,is_public,all_tenants_affected,started_at,resolved_at,updated_at')
    .order('started_at', { ascending: false })
    .limit(200)

  if (status === 'active') query = query.neq('status', 'resolved')
  else if (status === 'resolved') query = query.eq('status', 'resolved')
  const { data, error } = await query

  if (error) fail('incidents', error)
  const ids = (data || []).map((i: any) => i.id)
  const { data: links } = ids.length ? await db().from('forge_support_incident_tickets').select('incident_id').in('incident_id', ids).is('unlinked_at', null) : { data: [] }
  const counts = new Map<string, number>()

  for (const link of links || []) counts.set(link.incident_id, (counts.get(link.incident_id) || 0) + 1)

  return (data || []).map((i: any) => ({ ...i, linked_tickets: counts.get(i.id) || 0 }))
}

export const getIncidentDetail = async (id: string) => {
  if (!isUuid(id)) return null
  const d = db()
  const { data: incident, error } = await d.from('forge_support_platform_incidents').select('*').eq('id', id).maybeSingle()

  if (error) fail('incident', error)
  if (!incident) return null

  const [components, tenants, tickets, updates, announcements] = await Promise.all([
    d.from('forge_support_incident_components').select('component_id,component_status,component:forge_support_platform_components(name)').eq('incident_id', id),
    d.from('forge_support_incident_tenants').select('organization_id,organization:organizations(name)').eq('incident_id', id),
    d
      .from('forge_support_incident_tickets')
      .select('id,linked_at,ticket:forge_support_tickets(id,ticket_number,subject,status,priority,organization:organizations(name))')
      .eq('incident_id', id)
      .is('unlinked_at', null)
      .order('linked_at'),
    d.from('forge_support_incident_updates').select('id,status,message,is_public,posted_by,tickets_updated,customers_notified,created_at').eq('incident_id', id).order('created_at', { ascending: false }),
    d.from('forge_support_announcements').select('id,title,published_at,is_active').eq('incident_id', id)
  ])

  const posters = await names([incident.created_by, incident.resolved_by, ...(updates.data || []).map((u: any) => u.posted_by)])

  return {
    incident: { ...incident, created_by_name: incident.created_by ? posters.get(incident.created_by) || 'Forge staff' : null },
    components: components.data || [],
    tenants: (tenants.data || []).map((t: any) => ({ organization_id: t.organization_id, name: t.organization?.name || 'Tenant' })),
    tickets: (tickets.data || []).filter((t: any) => t.ticket),
    updates: (updates.data || []).map((u: any) => ({ ...u, posted_by_name: u.posted_by ? posters.get(u.posted_by) || 'Forge staff' : 'Forge' })),
    announcements: announcements.data || []
  }
}

export const listConsoleAnnouncements = async () => {
  const { data, error } = await db()
    .from('forge_support_announcements')
    .select('id,title,body,announcement_type,audience,organization_id,starts_at,ends_at,is_active,published_at,incident_id,row_version,organization:organizations(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) fail('announcements', error)

  return data || []
}

// ---------------------------------------------------------------------------
// Development issues
// ---------------------------------------------------------------------------
export const listDevelopmentIssues = async ({ state, q }: { state?: string; q?: string } = {}) => {
  let query = db()
    .from('forge_support_development_issues')
    .select('id,issue_number,title,issue_type,state,priority,fix_version,external_provider,external_issue_id,external_url,created_at,updated_at,module:forge_support_product_areas(label)')
    .order('updated_at', { ascending: false })
    .limit(200)

  if (state === 'open') query = query.not('state', 'in', '(released,wont_fix,duplicate,closed)')
  else if (state && /^[a-z_]+$/.test(state) && state !== 'all') query = query.eq('state', state)
  const term = (q || '').trim().slice(0, 100)

  if (term) query = /^DEV-\d{4}-\d+$/i.test(term) ? query.eq('issue_number', term.toUpperCase()) : query.ilike('title', `%${term.replace(/[%_\\]/g, '')}%`)
  const { data, error } = await query

  if (error) fail('development issues', error)
  const ids = (data || []).map((i: any) => i.id)

  const { data: links } = ids.length
    ? await db().from('forge_support_development_links').select('development_issue_id,organization_id').in('development_issue_id', ids).is('unlinked_at', null)
    : { data: [] }

  return (data || []).map((issue: any) => {
    const mine = (links || []).filter((l: any) => l.development_issue_id === issue.id)

    return { ...issue, linked_tickets: mine.length, affected_tenants: new Set(mine.map((l: any) => l.organization_id)).size }
  })
}

export const getDevelopmentIssueDetail = async (id: string) => {
  if (!isUuid(id)) return null
  const d = db()

  const { data: issue, error } = await d
    .from('forge_support_development_issues')
    .select('*,module:forge_support_product_areas(label)')
    .eq('id', id)
    .maybeSingle()

  if (error) fail('development issue', error)
  if (!issue) return null

  const [links, updates] = await Promise.all([
    d
      .from('forge_support_development_links')
      .select('id,linked_at,ticket:forge_support_tickets(id,ticket_number,subject,status,priority,organization:organizations(name))')
      .eq('development_issue_id', id)
      .is('unlinked_at', null)
      .order('linked_at'),
    d.from('forge_support_development_updates').select('id,from_state,to_state,note,shared_with_customers,created_by,created_at').eq('development_issue_id', id).order('created_at', { ascending: false })
  ])

  const people = await names([issue.created_by, issue.linked_by, ...(updates.data || []).map((u: any) => u.created_by)])

  return {
    issue: { ...issue, created_by_name: issue.created_by ? people.get(issue.created_by) || 'Forge staff' : null, linked_by_name: issue.linked_by ? people.get(issue.linked_by) || 'Forge staff' : null },
    links: (links.data || []).filter((l: any) => l.ticket),
    updates: (updates.data || []).map((u: any) => ({ ...u, created_by_name: u.created_by ? people.get(u.created_by) || 'Forge staff' : 'Forge' }))
  }
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------
export const getTenantSupportSummaries = async () => {
  const d = db()
  const since = new Date(Date.now() - 90 * 86400000).toISOString()

  const [orgs, tickets, csat, incidents] = await Promise.all([
    listTenantOptions(),
    d.from('forge_support_tickets').select('organization_id,status,priority,sla_state,created_at').is('deleted_at', null).gte('created_at', since).limit(10000),
    d.from('forge_support_customer_satisfaction').select('organization_id,rating').gte('submitted_at', since).limit(10000),
    d.from('forge_support_incident_tenants').select('organization_id,incident:forge_support_platform_incidents(status)')
  ])

  if (tickets.error) fail('tenant tickets', tickets.error)
  const { data: openRows } = await d.from('forge_support_tickets').select('organization_id,sla_state,priority').is('deleted_at', null).in('status', HELPDESK_ACTIVE_STATUSES).limit(10000)

  return orgs
    .map(org => {
      const recent = (tickets.data || []).filter((t: any) => t.organization_id === org.id)
      const open = (openRows || []).filter((t: any) => t.organization_id === org.id)
      const ratings = (csat.data || []).filter((c: any) => c.organization_id === org.id).map((c: any) => c.rating)

      return {
        ...org,
        open: open.length,
        breached: open.filter((t: any) => t.sla_state === 'breached').length,
        p1: open.filter((t: any) => t.priority === 'p1_critical').length,
        created90: recent.length,
        lastTicketAt: recent.map((t: any) => t.created_at).sort().at(-1) || null,
        csatAverage: ratings.length ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10 : null,
        activeIncidents: (incidents.data || []).filter((i: any) => i.organization_id === org.id && i.incident?.status !== 'resolved').length
      }
    })
    .sort((a, b) => b.open - a.open || b.created90 - a.created90 || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const getHelpdeskSettingsData = async () => {
  const d = db()

  const [settings, catalog, policies, calendars, tags, replies, teams, members, staff] = await Promise.all([
    getHelpdeskSettings(),
    getHelpdeskCatalog({ includeInactive: true }),
    d.from('forge_support_sla_policies').select('*,organization:organizations(name)').order('organization_id', { nullsFirst: true }).order('priority'),
    d.from('forge_support_business_calendars').select('id,name,timezone').order('name'),
    d.from('forge_support_tags').select('id,label,slug,description,color,is_active,organization_id').order('label'),
    d.from('forge_support_saved_replies').select('id,name,category,body,team_id,is_active,row_version').order('category').order('name'),
    d.from('forge_support_teams').select('id,team_key,name,description,is_default_triage,is_active').order('name'),
    d.from('forge_support_team_members').select('team_id,user_id,is_lead'),
    listAssignableStaff()
  ])

  for (const result of [policies, calendars, tags, replies, teams]) if (result.error) fail('help desk settings', result.error)

  return {
    settings,
    catalog,
    policies: policies.data || [],
    calendars: calendars.data || [],
    tags: tags.data || [],
    replies: replies.data || [],
    teams: teams.data || [],
    members: members.data || [],
    staff
  }
}
