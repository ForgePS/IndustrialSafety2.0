import { redirect } from 'next/navigation'
import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import type { Audience, AudiencePerson, NoticeKind, Recipient, ResponseStatus } from '@/lib/forgeEmergencyRules'
import { alertNotice, resolveAudience } from '@/lib/forgeEmergencyRules'
import { fetchAllRows } from '@/lib/forgeFetchAll'
import { companyMembers } from '@/lib/forgeSavedReports'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import { getTenantContext } from '@/lib/forgeTenantContext'

/**
 * Port slice 14: Emergency Management data. Plans and drills follow emergency_management.view / edit scope;
 * alerts follow emergency_alerts.view scope; everyone sees the alerts sent to them. All reads and writes use
 * the service role, with every check made here.
 */

const db = () => createServiceRoleClient() as any

type Access = { effective: EffectivePermission[] }

export const grantOf = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** null = organization-wide; a list = only these locations (empty when the person has none assigned). */
export const scopeLocations = async (organizationId: string, userId: string, permission: EffectivePermission | null) => {
  if (!permission) return []
  if (permission.scope === 'organization') return null

  if (permission.scope === 'location' || permission.scope === 'division') {
    const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })

    return locationIds as string[]
  }

  // Own / assigned: the location on the person's own employee record.
  const { data } = await db().from('forge_personnel').select('location_id').eq('organization_id', organizationId).eq('auth_user_id', userId).is('archived_at', null)

  return [...new Set<string>((data || []).map((row: any) => row.location_id).filter(Boolean))]
}

// ---------------------------------------------------------------------------
// Plans, scenarios, drills, teams
// ---------------------------------------------------------------------------

export const PLAN_COLUMNS =
  'id, organization_id, kind, title, status, scenario_type, location_id, plan_id, summary, body, review_due_on, event_date, participants, duration_minutes, after_action, completed_at, created_by, updated_by, archived_at, created_at, updated_at, locations(name)'

/** Whether a plan is in the person's scope: company-wide plans are for everyone; otherwise its location. */
const planInScope = (plan: any, locations: string[] | null) => locations === null || !plan.location_id || locations.includes(plan.location_id)

export const listPlans = async ({ organizationId, userId, access, archived = false }: { organizationId: string; userId: string; access: Access; archived?: boolean }) => {
  const view = grantOf(access, 'emergency_management.view')
  const edit = grantOf(access, 'emergency_management.edit')

  if (!view) return []

  const [viewLocations, editLocations] = await Promise.all([scopeLocations(organizationId, userId, view), edit ? scopeLocations(organizationId, userId, edit) : Promise.resolve([])])

  let query = db().from('forge_emergency_plans').select(PLAN_COLUMNS).eq('organization_id', organizationId).order('kind').order('title')

  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)

  const { data, error } = await query

  if (error) throw new Error('Unable to load emergency plans: ' + error.message)

  return (data || [])

    // Organization scope edits everything; location scope edits the plans at its own locations only.
    .map((plan: any) => ({ ...plan, canEdit: Boolean(edit) && (editLocations === null || (Boolean(plan.location_id) && editLocations!.includes(plan.location_id))) }))
    .filter((plan: any) => plan.canEdit || (planInScope(plan, viewLocations) && plan.status !== 'draft'))
}

export const loadPlan = async ({ organizationId, userId, access, id }: { organizationId: string; userId: string; access: Access; id: string }) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null

  const plans = await listPlans({ organizationId, userId, access })
  const archived = plans.find((plan: any) => plan.id === id) ? [] : await listPlans({ organizationId, userId, access, archived: true })

  return plans.find((plan: any) => plan.id === id) || archived.find((plan: any) => plan.id === id) || null
}

/** Whether a person may create or move a plan to this location (blank = company-wide needs organization scope). */
export const canEditAt = async (organizationId: string, userId: string, access: Access, locationId: string | null) => {
  const edit = grantOf(access, 'emergency_management.edit')

  if (!edit) return false

  const locations = await scopeLocations(organizationId, userId, edit)

  return locations === null || (locationId !== null && locations.includes(locationId))
}

export const teamMembers = async (teamId: string) => {
  const { data } = await db()
    .from('forge_emergency_team_members')
    .select('personnel_id, team_role, forge_personnel(first_name, last_name, preferred_name, phone, job_title)')
    .eq('team_id', teamId)

  return (data || [])
    .map((row: any) => ({
      personnelId: row.personnel_id as string,
      role: row.team_role as string | null,
      name: personName(row.forge_personnel),
      jobTitle: row.forge_personnel?.job_title || null,
      phone: row.forge_personnel?.phone || null
    }))
    .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
}

export const personName = (person: any) =>
  person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Unnamed' : 'Unknown'

export const companyLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string }[]
}

export const companyDepartments = async (organizationId: string) => {
  const { data } = await db().from('forge_departments').select('id, name, location_id').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string; location_id: string | null }[]
}

/** Every personnel record in the company, paged past the API's 1,000-row cap so no one is silently left out. */
export const activePersonnel = async (organizationId: string): Promise<AudiencePerson[]> => {
  const data = await fetchAllRows(
    () =>
      db()
        .from('forge_personnel')
        .select('id, first_name, last_name, preferred_name, auth_user_id, location_id, department_id, employment_status, archived_at')
        .eq('organization_id', organizationId)
        .order('last_name')
        .order('id'),
    'Unable to load personnel'
  )

  return data.map(
    (row: any): AudiencePerson => ({
      id: row.id,
      name: personName(row),
      userId: row.auth_user_id,
      locationId: row.location_id,
      departmentId: row.department_id,
      status: row.employment_status || 'active',
      archived: Boolean(row.archived_at)
    })
  )
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export const ALERT_COLUMNS =
  'id, organization_id, alert_number, alert_type, severity, headline, message, instructions, is_drill, requires_response, status, audience, location_ids, template_id, recipient_count, sent_by, sent_at, cleared_by, cleared_at, updated_at'

/** Who would receive an alert, for the preview and for sending. */
export const buildAudience = async (organizationId: string, audience: Audience) => {
  const [personnel, members] = await Promise.all([activePersonnel(organizationId), companyMembers(organizationId)])

  return resolveAudience({ audience, personnel, members: members.map(member => ({ userId: member.id, name: member.name })) })
}

/** What an alert sender may send: drills, live alerts, and where. */
export const sendRights = async (organizationId: string, userId: string, access: Access) => {
  const live = grantOf(access, 'emergency_alerts.send')
  const drill = grantOf(access, 'emergency_alerts.run_drills')

  return {
    live: live ? { locations: await scopeLocations(organizationId, userId, live) } : null,
    drill: drill || live ? { locations: await scopeLocations(organizationId, userId, drill || live) } : null
  }
}

/** The send grant that covers this alert (drill or live), or null. */
export const rightFor = async (organizationId: string, userId: string, access: Access, isDrill: boolean) => {
  const rights = await sendRights(organizationId, userId, access)

  if (!isDrill) return rights.live

  // A drill can be sent with either grant; use the wider of the two.
  if (rights.live && rights.drill) return rights.live.locations === null ? rights.live : rights.drill

  return rights.drill
}

const alertInScope = (alert: any, locations: string[] | null, userId: string) =>
  locations === null || alert.sent_by === userId || (alert.location_ids || []).some((id: string) => locations.includes(id))

/** Alerts the person can see: in their emergency_alerts.view scope, plus every alert sent to them. */
export const listAlerts = async ({ organizationId, userId, access, limit = 200 }: { organizationId: string; userId: string; access: Access; limit?: number }) => {
  const view = grantOf(access, 'emergency_alerts.view')
  const supabase = db()

  const { data: mine } = await supabase.from('forge_emergency_alert_recipients').select('alert_id').eq('organization_id', organizationId).eq('user_id', userId)
  const myIds = new Set<string>((mine || []).map((row: any) => row.alert_id))

  let alerts: any[] = []

  if (view) {
    const locations = await scopeLocations(organizationId, userId, view)
    const { data, error } = await supabase.from('forge_emergency_alerts').select(ALERT_COLUMNS).eq('organization_id', organizationId).order('sent_at', { ascending: false }).limit(limit)

    if (error) throw new Error('Unable to load alerts: ' + error.message)
    alerts = (data || []).filter((alert: any) => myIds.has(alert.id) || alertInScope(alert, locations, userId))
  } else if (myIds.size) {
    const { data } = await supabase.from('forge_emergency_alerts').select(ALERT_COLUMNS).eq('organization_id', organizationId).in('id', [...myIds]).order('sent_at', { ascending: false }).limit(limit)

    alerts = data || []
  }

  return alerts.map(alert => ({ ...alert, isRecipient: myIds.has(alert.id) }))
}

/** One alert, with whether the person can see its roll call and change it. */
export const loadAlert = async ({ organizationId, userId, access, id }: { organizationId: string; userId: string; access: Access; id: string }) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null

  const supabase = db()
  const { data: alert } = await supabase.from('forge_emergency_alerts').select(ALERT_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!alert) return null

  const { data: me } = await supabase.from('forge_emergency_alert_recipients').select('user_id').eq('alert_id', id).eq('user_id', userId).maybeSingle()
  const view = grantOf(access, 'emergency_alerts.view')
  const canSeeAll = Boolean(view) && alertInScope(alert, await scopeLocations(organizationId, userId, view), userId)

  if (!me && !canSeeAll) return null

  const right = await rightFor(organizationId, userId, access, alert.is_drill)
  const locations = right?.locations

  const canManage =
    Boolean(right) && (locations === null || (alert.location_ids.length > 0 && alert.location_ids.every((locationId: string) => locations!.includes(locationId))))

  return { alert, isRecipient: Boolean(me), canSeeAll, canManage }
}

export const alertUpdates = async (alertId: string) => {
  const { data } = await db().from('forge_emergency_alert_updates').select('id, kind, headline, message, instructions, created_by, created_at').eq('alert_id', alertId).order('created_at')

  return data || []
}

/** Everyone an alert went to (up to MAX_RECIPIENTS, paged past the API row cap): the roll call and who gets updates. */
export const alertRecipients = async (alertId: string): Promise<Recipient[]> => {
  const data = await fetchAllRows(
    () => db().from('forge_emergency_alert_recipients').select('user_id, personnel_id, name, location_id, department_id').eq('alert_id', alertId).order('name').order('user_id'),
    'Unable to load alert recipients'
  )

  return data.map((row: any) => ({ userId: row.user_id, personnelId: row.personnel_id, name: row.name, locationId: row.location_id, departmentId: row.department_id }))
}

export const alertResponses = async (alertId: string) => {
  const data = await fetchAllRows(
    () => db().from('forge_emergency_alert_responses').select('user_id, status, note, responded_at').eq('alert_id', alertId).order('user_id'),
    'Unable to load alert responses'
  )

  return data.map((row: any) => ({ userId: row.user_id as string, status: row.status as ResponseStatus, note: row.note as string | null, respondedAt: row.responded_at as string }))
}

export const myResponse = async (alertId: string, userId: string) => {
  const { data } = await db().from('forge_emergency_alert_responses').select('status, note, responded_at').eq('alert_id', alertId).eq('user_id', userId).maybeSingle()

  return data as { status: ResponseStatus; note: string | null; responded_at: string } | null
}

/** Active alerts sent to the person that still want an answer from them, for the dashboard and banner. */
export const alertsAwaitingMe = async (organizationId: string, userId: string) => {
  const supabase = db()

  const { data } = await supabase
    .from('forge_emergency_alert_recipients')
    .select('alert_id, forge_emergency_alerts!inner(id, alert_number, headline, alert_type, severity, is_drill, status, requires_response, sent_at)')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('forge_emergency_alerts.status', 'active')

  const alerts = (data || []).map((row: any) => row.forge_emergency_alerts).filter((alert: any) => alert?.requires_response)

  if (!alerts.length) return []

  const { data: answered } = await supabase.from('forge_emergency_alert_responses').select('alert_id').eq('user_id', userId).in('alert_id', alerts.map((alert: any) => alert.id))
  const done = new Set((answered || []).map((row: any) => row.alert_id))

  return alerts.filter((alert: any) => !done.has(alert.id))
}

export const listTemplates = async (organizationId: string, { enabledOnly = false } = {}) => {
  let query = db().from('forge_emergency_alert_templates').select('*').eq('organization_id', organizationId).order('name')

  if (enabledOnly) query = query.eq('enabled', true)

  const { data } = await query

  return data || []
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

const SOURCE = 'emergency_alerts'

/**
 * One notification event per step (issued, update, all-clear) with an in-app delivery (sent) and an email
 * delivery (pending, for the outbox drain) per recipient. Inserted in batches; a failure is returned, not
 * thrown, so the alert itself is never undone by a notice problem.
 */
export const queueAlertNotices = async ({ alert, kind, recipients, actorUserId, updateId }: { alert: any; kind: NoticeKind; recipients: Recipient[]; actorUserId: string; updateId: string }) => {
  const supabase = db()

  const notice = alertNotice(
    { alertType: alert.alert_type, severity: alert.severity, headline: alert.headline, message: alert.message, instructions: alert.instructions, isDrill: alert.is_drill, requiresResponse: alert.requires_response },
    kind
  )

  try {
    const { data: event, error } = await supabase
      .from('forge_notification_events')
      .insert({
        organization_id: alert.organization_id,
        source_module: SOURCE,
        event_type: 'emergency_alert_' + kind,
        visibility: 'customer',
        resource_type: 'emergency_alert',
        resource_id: alert.id,
        actor_user_id: actorUserId,
        title: notice.title,
        body: notice.body,
        payload: { kind, alert_number: alert.alert_number, is_drill: alert.is_drill, dedupe_key: `emergency:${alert.id}:${updateId}` }
      })
      .select('id')
      .single()

    if (error || !event) throw new Error(error?.message || 'no event')

    const now = new Date().toISOString()
    const link = '/emergency/alerts/' + alert.id

    const rows = recipients.flatMap(recipient =>
      (['in_app', 'email'] as const).map(channel => ({
        event_id: event.id,
        organization_id: alert.organization_id,
        recipient_user_id: recipient.userId,
        recipient_audience: 'customer',
        channel,
        status: channel === 'in_app' ? 'sent' : 'pending',
        title: notice.title,
        body: notice.body,
        link_path: link,
        sent_at: channel === 'in_app' ? now : null
      }))
    )

    for (let start = 0; start < rows.length; start += 1000) {
      const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(rows.slice(start, start + 1000))

      if (deliveryError) throw new Error(deliveryError.message)
    }

    return { ok: true as const, delivered: recipients.length }
  } catch (failure) {
    return { ok: false as const, error: 'Notices could not all be queued: ' + (failure as Error).message }
  }
}

/**
 * The signed-in member with their access, for the alert pages: anyone in the company can open the alerts sent
 * to them, whatever their permissions. Sends people without an active company to the dashboard.
 */
export const requireMember = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) redirect('/dashboard')

  const access = await getEffectiveTenantAccess({ organizationId: context.activeOrganization.id, userId: context.user.id })

  return { ...context, user: context.user, activeOrganization: context.activeOrganization, access }
}
