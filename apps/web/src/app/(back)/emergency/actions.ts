'use server'

import { randomBytes } from 'crypto'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import {
  alertRecipients,
  buildAudience,
  canEditAt,
  loadAlert,
  loadPlan,
  queueAlertNotices,
  rightFor
} from '@/lib/forgeEmergency'
import { alertNumber, audienceWithinScope, cleanAlertInput, cleanAlertMessage, cleanAudience, cleanPlanInput, cleanResponse, EXCLUSION_LABELS, isUuid, MAX_RECIPIENTS } from '@/lib/forgeEmergencyRules'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { getTenantContext } from '@/lib/forgeTenantContext'

/**
 * Port slice 14: Emergency Management actions. Every check is made here, whatever the page showed.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

/** The signed-in member with their access, whatever their permissions (everyone can answer their own alerts). */
const member = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  const access = await getEffectiveTenantAccess({ organizationId: context.activeOrganization.id, userId: context.user.id })

  return { userId: context.user.id as string, organizationId: context.activeOrganization.id as string, access }
}

const audit = (who: { userId: string; organizationId: string }, action: string, entityType: string, entityId: string, afterValue: Record<string, unknown> | null, beforeValue: Record<string, unknown> | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action, entityType, entityId, beforeValue, afterValue }).catch(() => {})

// ---------------------------------------------------------------------------
// Plans, scenarios, drills, teams
// ---------------------------------------------------------------------------

export const savePlan = async (input: Record<string, unknown> & { id?: string }): Promise<Result> => {
  const context = await tenantPermissionOrNull('emergency_management.edit')

  if (!context) return { error: "You don't have permission to manage emergency plans." }

  const who = { userId: context.user.id, organizationId: context.activeOrganization.id }
  const clean = cleanPlanInput(input)

  if ('error' in clean) return { error: clean.error }

  let existing: any = null

  if (input.id) {
    existing = await loadPlan({ ...who, access: context.access, id: String(input.id) })
    if (!existing || !existing.canEdit) return { error: "That record wasn't found, or you can't change it." }
    if (existing.archived_at) return { error: 'Restore it before changing it.' }
    if (existing.kind !== clean.kind) return { error: "The kind of record can't be changed." }
  }

  if (!(await canEditAt(who.organizationId, who.userId, context.access, clean.locationId))) {
    return { error: clean.locationId ? 'You can only manage plans at your own locations.' : 'Company-wide plans need company-wide permission. Pick one of your locations.' }
  }

  const supabase = db()

  if (clean.locationId) {
    const { data: location } = await supabase.from('locations').select('id').eq('organization_id', who.organizationId).eq('id', clean.locationId).maybeSingle()

    if (!location) return { error: 'Pick a location.' }
  }

  if (clean.planId) {
    const { data: plan } = await supabase.from('forge_emergency_plans').select('id, kind').eq('organization_id', who.organizationId).eq('id', clean.planId).is('archived_at', null).maybeSingle()

    if (!plan || plan.kind !== 'plan' || plan.id === input.id) return { error: 'Pick an action plan.' }
  }

  const row = {
    organization_id: who.organizationId,
    kind: clean.kind,
    title: clean.title,
    status: clean.status,
    scenario_type: clean.scenarioType,
    location_id: clean.locationId,
    plan_id: clean.planId,
    summary: clean.summary,
    body: clean.body,
    review_due_on: clean.reviewDueOn,
    event_date: clean.eventDate,
    participants: clean.participants,
    duration_minutes: clean.durationMinutes,
    after_action: clean.afterAction,
    completed_at: clean.kind === 'drill' && clean.status === 'completed' ? existing?.completed_at || new Date().toISOString() : null,
    updated_by: who.userId,
    updated_at: new Date().toISOString()
  }

  const { data, error } = existing
    ? await supabase.from('forge_emergency_plans').update(row).eq('id', existing.id).select('id').single()
    : await supabase.from('forge_emergency_plans').insert({ ...row, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: 'Unable to save: ' + (error?.message || 'no record') }

  await audit(who, existing ? 'emergency_plan.updated' : 'emergency_plan.created', 'emergency_plan', data.id, row, existing)
  revalidatePath('/emergency', 'layout')

  return { id: data.id, message: 'Saved.' }
}

export const archivePlan = async (id: string, archive: boolean): Promise<Result> => {
  const context = await tenantPermissionOrNull('emergency_management.edit')

  if (!context) return { error: "You don't have permission to manage emergency plans." }

  const who = { userId: context.user.id, organizationId: context.activeOrganization.id }
  const plan = await loadPlan({ ...who, access: context.access, id })

  if (!plan || !plan.canEdit) return { error: "That record wasn't found, or you can't change it." }

  const { error } = await db()
    .from('forge_emergency_plans')
    .update({ archived_at: archive ? new Date().toISOString() : null, updated_by: who.userId, updated_at: new Date().toISOString() })
    .eq('id', plan.id)

  if (error) return { error: 'Unable to save: ' + error.message }

  await audit(who, archive ? 'emergency_plan.archived' : 'emergency_plan.restored', 'emergency_plan', plan.id, null)
  revalidatePath('/emergency', 'layout')

  return { message: archive ? 'Archived.' : 'Restored.' }
}

export const saveTeamMembers = async (teamId: string, members: { personnelId: string; role?: string }[]): Promise<Result> => {
  const context = await tenantPermissionOrNull('emergency_management.edit')

  if (!context) return { error: "You don't have permission to manage emergency plans." }

  const who = { userId: context.user.id, organizationId: context.activeOrganization.id }
  const team = await loadPlan({ ...who, access: context.access, id: teamId })

  if (!team || !team.canEdit || team.kind !== 'team' || team.archived_at) return { error: "That team wasn't found, or you can't change it." }

  const list = (Array.isArray(members) ? members : []).filter(item => isUuid(item?.personnelId))
  const unique = [...new Map(list.map(item => [item.personnelId, { personnelId: item.personnelId, role: String(item.role || '').trim().slice(0, 80) || null }])).values()]

  if (unique.length > 200) return { error: 'A team can have up to 200 members.' }

  const supabase = db()

  if (unique.length) {
    const { data: found } = await supabase.from('forge_personnel').select('id').eq('organization_id', who.organizationId).is('archived_at', null).in('id', unique.map(item => item.personnelId))

    if ((found || []).length !== unique.length) return { error: 'Pick people from this company.' }
  }

  const { error: deleteError } = await supabase.from('forge_emergency_team_members').delete().eq('team_id', team.id)

  if (deleteError) return { error: 'Unable to save the team: ' + deleteError.message }

  if (unique.length) {
    const { error } = await supabase
      .from('forge_emergency_team_members')
      .insert(unique.map(item => ({ team_id: team.id, organization_id: who.organizationId, personnel_id: item.personnelId, team_role: item.role })))

    if (error) return { error: 'Unable to save the team: ' + error.message }
  }

  await audit(who, 'emergency_team.members_saved', 'emergency_plan', team.id, { members: unique })
  revalidatePath('/emergency/' + team.id)

  return { message: 'Team saved.' }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const saveTemplate = async (input: Record<string, unknown> & { id?: string; name?: string; enabled?: boolean }): Promise<Result> => {
  const context = await tenantPermissionOrNull('emergency_alerts.manage_templates')

  if (!context) return { error: "You don't have permission to manage alert templates." }

  const who = { userId: context.user.id, organizationId: context.activeOrganization.id }
  const name = String(input.name || '').trim().replace(/\s+/g, ' ')

  if (!name) return { error: 'Give the template a name.' }
  if (name.length > 120) return { error: 'Keep the name to 120 characters.' }

  const message = cleanAlertMessage(input)

  if ('error' in message) return { error: message.error }

  const row = {
    organization_id: who.organizationId,
    name,
    alert_type: message.alertType,
    severity: message.severity,
    headline: message.headline,
    message: message.message,
    instructions: message.instructions,
    requires_response: input.requiresResponse !== false,
    enabled: input.enabled !== false,
    updated_at: new Date().toISOString()
  }

  const supabase = db()

  const { data, error } = input.id
    ? await supabase.from('forge_emergency_alert_templates').update(row).eq('organization_id', who.organizationId).eq('id', String(input.id)).select('id').maybeSingle()
    : await supabase.from('forge_emergency_alert_templates').insert({ ...row, created_by: who.userId }).select('id').single()

  if (error?.code === '23505') return { error: 'A template with that name already exists.' }
  if (error || !data) return { error: 'Unable to save the template' + (error ? ': ' + error.message : '.') }

  await audit(who, input.id ? 'emergency_alert_template.updated' : 'emergency_alert_template.created', 'emergency_alert_template', data.id, row)
  revalidatePath('/emergency/alerts', 'layout')

  return { id: data.id, message: 'Template saved.' }
}

export const deleteTemplate = async (id: string): Promise<Result> => {
  const context = await tenantPermissionOrNull('emergency_alerts.manage_templates')

  if (!context) return { error: "You don't have permission to manage alert templates." }
  if (!isUuid(id)) return { error: "That template wasn't found." }

  const who = { userId: context.user.id, organizationId: context.activeOrganization.id }
  const { error } = await db().from('forge_emergency_alert_templates').delete().eq('organization_id', who.organizationId).eq('id', id)

  if (error) return { error: 'Unable to delete the template: ' + error.message }

  await audit(who, 'emergency_alert_template.deleted', 'emergency_alert_template', id, null)
  revalidatePath('/emergency/alerts', 'layout')

  return { message: 'Template deleted.' }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AudiencePreview = {
  error?: string
  recipients?: number
  sample?: string[]
  excluded?: { reason: string; label: string; count: number; names: string[] }[]
  tooMany?: boolean
}

/** Who an alert would reach, for the compose screen. Only for people who can send. */
export const previewAudience = async (rawAudience: unknown, isDrill: boolean): Promise<AudiencePreview> => {
  const who = await member()

  if (!who) return { error: 'Sign in again.' }

  const right = await rightFor(who.organizationId, who.userId, who.access, Boolean(isDrill))

  if (!right) return { error: isDrill ? "You don't have permission to send drill alerts." : "You don't have permission to send live alerts." }

  const audience = cleanAudience(rawAudience)

  if ('error' in audience) return { error: audience.error }

  const outOfScope = audienceWithinScope(audience, right.locations)

  if (outOfScope) return { error: outOfScope }

  const resolved = await buildAudience(who.organizationId, audience)

  return {
    recipients: resolved.recipients.length,
    sample: resolved.recipients.slice(0, 12).map(recipient => recipient.name),
    excluded: Object.entries(resolved.byReason).map(([reason, count]) => ({
      reason,
      label: EXCLUSION_LABELS[reason as keyof typeof EXCLUSION_LABELS],
      count,
      names: resolved.exclusions.filter(item => item.reason === reason).slice(0, 12).map(item => item.name)
    })),
    tooMany: resolved.tooMany
  }
}

export const sendAlert = async (input: Record<string, unknown> & { audience: unknown; templateId?: string; confirmed?: boolean }): Promise<Result> => {
  const who = await member()

  if (!who) return { error: 'Sign in again.' }

  const clean = cleanAlertInput(input)

  if ('error' in clean) return { error: clean.error }

  const right = await rightFor(who.organizationId, who.userId, who.access, clean.isDrill)

  if (!right) return { error: clean.isDrill ? "You don't have permission to send drill alerts." : "You don't have permission to send live alerts." }
  if (input.confirmed !== true) return { error: 'Confirm before sending.' }

  const audience = cleanAudience(input.audience)

  if ('error' in audience) return { error: audience.error }

  const outOfScope = audienceWithinScope(audience, right.locations)

  if (outOfScope) return { error: outOfScope }

  const supabase = db()

  // Locations, departments and people must be this company's.
  const checks: [string, string[]][] = [
    ['locations', audience.locationIds],
    ['forge_departments', audience.departmentIds],
    ['forge_personnel', audience.personnelIds]
  ]

  for (const [table, ids] of checks) {
    if (!ids.length) continue
    const { data } = await supabase.from(table).select('id').eq('organization_id', who.organizationId).in('id', ids)

    if ((data || []).length !== ids.length) return { error: 'Pick locations, departments and people from this company.' }
  }

  const resolved = await buildAudience(who.organizationId, audience)

  if (!resolved.recipients.length) return { error: "Nobody in that audience can be reached. Pick a wider audience." }
  if (resolved.tooMany) return { error: `That audience is over ${MAX_RECIPIENTS.toLocaleString('en-US')} people. Narrow it down.` }

  let templateId: string | null = null

  if (input.templateId && isUuid(input.templateId)) {
    const { data } = await supabase.from('forge_emergency_alert_templates').select('id').eq('organization_id', who.organizationId).eq('id', input.templateId).maybeSingle()

    templateId = data?.id || null
  }

  const now = new Date()
  let alert: any = null

  for (let attempt = 0; attempt < 3 && !alert; attempt += 1) {
    const { data, error } = await supabase
      .from('forge_emergency_alerts')
      .insert({
        organization_id: who.organizationId,
        alert_number: alertNumber(now, randomBytes(3).toString('hex')),
        alert_type: clean.alertType,
        severity: clean.severity,
        headline: clean.headline,
        message: clean.message,
        instructions: clean.instructions,
        is_drill: clean.isDrill,
        requires_response: clean.requiresResponse,
        audience,
        location_ids: audience.locationIds,
        template_id: templateId,
        recipient_count: resolved.recipients.length,
        sent_by: who.userId,
        sent_at: now.toISOString()
      })
      .select('*')
      .single()

    if (data) alert = data
    else if (error?.code !== '23505') return { error: 'Unable to send the alert: ' + (error?.message || 'no record') }
  }

  if (!alert) return { error: 'Unable to number the alert. Try again.' }

  const rows = resolved.recipients.map(recipient => ({
    alert_id: alert.id,
    organization_id: who.organizationId,
    user_id: recipient.userId,
    personnel_id: recipient.personnelId,
    name: recipient.name,
    location_id: recipient.locationId,
    department_id: recipient.departmentId
  }))

  for (let start = 0; start < rows.length; start += 1000) {
    const { error } = await supabase.from('forge_emergency_alert_recipients').insert(rows.slice(start, start + 1000))

    if (error) {
      // Nobody has been told yet: take the alert back rather than leave it half sent.
      await supabase.from('forge_emergency_alerts').delete().eq('id', alert.id)

      return { error: 'Unable to send the alert: ' + error.message }
    }
  }

  const { data: update } = await supabase
    .from('forge_emergency_alert_updates')
    .insert({ alert_id: alert.id, organization_id: who.organizationId, kind: 'issued', headline: alert.headline, message: alert.message, instructions: alert.instructions, created_by: who.userId })
    .select('id')
    .single()

  const notices = await queueAlertNotices({ alert, kind: 'issued', recipients: resolved.recipients, actorUserId: who.userId, updateId: update?.id || 'issued' })

  await audit(who, clean.isDrill ? 'emergency_alert.drill_sent' : 'emergency_alert.sent', 'emergency_alert', alert.id, {
    alert_number: alert.alert_number,
    audience,
    recipients: resolved.recipients.length,
    notices: notices.ok ? 'queued' : notices.error
  })
  revalidatePath('/emergency/alerts', 'layout')

  return {
    id: alert.id,
    message: notices.ok
      ? `Sent to ${resolved.recipients.length.toLocaleString('en-US')} ${resolved.recipients.length === 1 ? 'person' : 'people'}.`
      : `The alert is active, but ${notices.error.toLowerCase()}`
  }
}

/** Sends a new version of an active alert to everyone it went to. */
export const updateAlert = async (id: string, input: Record<string, unknown>): Promise<Result> => {
  const who = await member()

  if (!who) return { error: 'Sign in again.' }

  const found = await loadAlert({ ...who, access: who.access, id })

  if (!found || !found.canManage) return { error: "That alert wasn't found, or you can't change it." }
  if (found.alert.status !== 'active') return { error: 'This alert has been cleared.' }

  const message = cleanAlertMessage({ ...input, alertType: found.alert.alert_type })

  if ('error' in message) return { error: message.error }

  const supabase = db()

  const { data: alert, error } = await supabase
    .from('forge_emergency_alerts')
    .update({ severity: message.severity, headline: message.headline, message: message.message, instructions: message.instructions, updated_at: new Date().toISOString() })
    .eq('id', found.alert.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle()

  if (error || !alert) return { error: 'Unable to update the alert' + (error ? ': ' + error.message : '.') }

  const { data: update } = await supabase
    .from('forge_emergency_alert_updates')
    .insert({ alert_id: alert.id, organization_id: who.organizationId, kind: 'update', headline: alert.headline, message: alert.message, instructions: alert.instructions, created_by: who.userId })
    .select('id')
    .single()

  const recipients = await alertRecipients(alert.id)
  const notices = await queueAlertNotices({ alert, kind: 'update', recipients, actorUserId: who.userId, updateId: update?.id || 'update-' + Date.now() })

  await audit(who, 'emergency_alert.updated', 'emergency_alert', alert.id, { headline: alert.headline, severity: alert.severity }, { headline: found.alert.headline, severity: found.alert.severity })
  revalidatePath('/emergency/alerts', 'layout')

  return { message: notices.ok ? `Update sent to ${recipients.length.toLocaleString('en-US')} ${recipients.length === 1 ? 'person' : 'people'}.` : `Updated, but ${notices.error.toLowerCase()}` }
}

/** Ends an alert and tells everyone it went to. Responses close with it. */
export const clearAlert = async (id: string, input: Record<string, unknown>): Promise<Result> => {
  const who = await member()

  if (!who) return { error: 'Sign in again.' }

  const found = await loadAlert({ ...who, access: who.access, id })

  if (!found || !found.canManage) return { error: "That alert wasn't found, or you can't change it." }
  if (found.alert.status !== 'active') return { error: 'This alert has already been cleared.' }

  const text = String(input.message || '').trim() || 'The emergency is over. Return to normal operations unless told otherwise.'

  if (text.length > 1000) return { error: 'Keep the message to 1,000 characters.' }

  const instructions = String(input.instructions || '').trim() || null

  if (instructions && instructions.length > 2000) return { error: 'Keep the instructions to 2,000 characters.' }

  const supabase = db()
  const now = new Date().toISOString()

  const { data: alert, error } = await supabase
    .from('forge_emergency_alerts')
    .update({ status: 'cleared', cleared_by: who.userId, cleared_at: now, updated_at: now })
    .eq('id', found.alert.id)
    .eq('status', 'active')
    .select('*')
    .maybeSingle()

  if (error || !alert) return { error: 'Unable to clear the alert' + (error ? ': ' + error.message : '.') }

  const { data: update } = await supabase
    .from('forge_emergency_alert_updates')
    .insert({ alert_id: alert.id, organization_id: who.organizationId, kind: 'all_clear', headline: alert.headline, message: text, instructions, created_by: who.userId })
    .select('id')
    .single()

  const recipients = await alertRecipients(alert.id)
  const notices = await queueAlertNotices({ alert: { ...alert, message: text, instructions }, kind: 'all_clear', recipients, actorUserId: who.userId, updateId: update?.id || 'all-clear' })

  await audit(who, 'emergency_alert.cleared', 'emergency_alert', alert.id, { message: text })
  revalidatePath('/emergency/alerts', 'layout')

  return { message: notices.ok ? `All clear sent to ${recipients.length.toLocaleString('en-US')} ${recipients.length === 1 ? 'person' : 'people'}.` : `Cleared, but ${notices.error.toLowerCase()}` }
}

/** "I'm safe" or "I need help" from someone the alert was sent to, while it is active. */
export const respondToAlert = async (id: string, input: Record<string, unknown>): Promise<Result> => {
  const who = await member()

  if (!who) return { error: 'Sign in again.' }

  const found = await loadAlert({ ...who, access: who.access, id })

  if (!found || !found.isRecipient) return { error: "This alert wasn't sent to you." }
  if (found.alert.status !== 'active') return { error: 'This alert has been cleared.' }
  if (!found.alert.requires_response) return { error: "This alert doesn't ask for a response." }

  const clean = cleanResponse(input)

  if ('error' in clean) return { error: clean.error }

  const now = new Date().toISOString()

  const { error } = await db()
    .from('forge_emergency_alert_responses')
    .upsert({ alert_id: found.alert.id, organization_id: who.organizationId, user_id: who.userId, status: clean.status, note: clean.note, responded_at: now, updated_at: now }, { onConflict: 'alert_id,user_id' })

  if (error) return { error: 'Unable to save your response: ' + error.message }

  await audit(who, 'emergency_alert.responded', 'emergency_alert', found.alert.id, { status: clean.status })

  // Someone needs help: tell the sender at once (in-app and email), once per person and alert.
  if (clean.status === 'need_help' && found.alert.sent_by && found.alert.sent_by !== who.userId) {
    const [recipient] = (await alertRecipients(found.alert.id)).filter(item => item.userId === who.userId)

    await queueHelpNotice(found.alert, found.alert.sent_by, recipient?.name || 'Someone', clean.note, who.userId).catch(() => {})
  }

  revalidatePath('/emergency/alerts/' + found.alert.id)

  return { message: clean.status === 'safe' ? 'Thanks. You are marked safe.' : 'Help request sent. Stay where you are if it is safe to do so.' }
}

const queueHelpNotice = async (alert: any, senderId: string, name: string, note: string | null, responderId: string) => {
  const supabase = db()
  const dedupeKey = `emergency-help:${alert.id}:${responderId}`
  const { data: existing } = await supabase.from('forge_notification_events').select('id').eq('source_module', 'emergency_alerts').eq('payload->>dedupe_key', dedupeKey).limit(1)

  if (existing?.length) return

  const title = `${alert.is_drill ? '[DRILL] ' : ''}Needs help: ${name} (${alert.alert_number})`.slice(0, 200)
  const body = (note ? `${name} answered "${alert.headline}" with I need help: ${note}` : `${name} answered "${alert.headline}" with I need help.`).slice(0, 2000)

  const { data: event } = await supabase
    .from('forge_notification_events')
    .insert({
      organization_id: alert.organization_id,
      source_module: 'emergency_alerts',
      event_type: 'emergency_alert_need_help',
      visibility: 'customer',
      resource_type: 'emergency_alert',
      resource_id: alert.id,
      actor_user_id: responderId,
      title,
      body,
      payload: { kind: 'need_help', dedupe_key: dedupeKey }
    })
    .select('id')
    .single()

  if (!event) return

  const now = new Date().toISOString()

  await supabase.from('forge_notification_deliveries').insert(
    (['in_app', 'email'] as const).map(channel => ({
      event_id: event.id,
      organization_id: alert.organization_id,
      recipient_user_id: senderId,
      recipient_audience: 'customer',
      channel,
      status: channel === 'in_app' ? 'sent' : 'pending',
      title,
      body,
      link_path: '/emergency/alerts/' + alert.id,
      sent_at: channel === 'in_app' ? now : null
    }))
  )
}
