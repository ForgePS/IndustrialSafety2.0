import { createServiceRoleClient } from '@repo/supabase/server'

import { recordForgeAiAudit } from '@/lib/forgeAiExecution'
import { generateForgeAiRecommendations, verifyForgeAiRecommendations } from '@/lib/forgeAiRecommendations'
import { COMMAND_CENTER_FEATURE, isTenantFeatureAvailable } from '@/lib/forgeFeatureAvailability'
import { runForgeAiRiskAssessments } from '@/lib/forgeAiRisk'
import { runForgeAiWatch } from '@/lib/forgeAiWatch'
import { getScopedForgeAiWatchAlerts } from '@/lib/forgeAiWatchAccess'
import { severityAtLeast } from '@/lib/forgeAiWatchPatterns'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

type Route = {
  id: string | null
  rule_key: string | null
  min_severity: string
  recipient_type: 'tenant_role' | 'user'
  tenant_role_id: string | null
  user_id: string | null
  channel: 'in_app' | 'email'
}

// Used when a tenant has not set up any routes: company owners and administrators get
// high and critical alerts in the app.
export const DEFAULT_ALERT_ROLE_KEYS = ['company-owner', 'company-administrator']

const defaultRoutes = async (supabase: any, organizationId: string): Promise<Route[]> => {
  const { data } = await supabase
    .from('forge_tenant_roles')
    .select('id')
    .eq('organization_id', organizationId)
    .in('role_key', DEFAULT_ALERT_ROLE_KEYS)

  return (data || []).map((role: any) => ({
    id: null,
    rule_key: null,
    min_severity: 'high',
    recipient_type: 'tenant_role' as const,
    tenant_role_id: role.id,
    user_id: null,
    channel: 'in_app' as const
  }))
}

// Notify routed recipients about alerts that are open and not yet notified. A recipient only
// hears about alerts they could open in AI Watch, so a notification never discloses a record
// outside their permissions or locations. Each alert is notified once (again if it reopens).
export const notifyForgeAiWatchAlerts = async ({ organizationId }: { organizationId: string }) => {
  const supabase = createServiceRoleClient() as any

  const { data: pending, error } = await supabase
    .from('forge_ai_watch_alerts')
    .select('id, rule_key, severity, title, summary, data, forge_ai_watch_rules(notification_mode)')
    .eq('organization_id', organizationId)
    .eq('status', 'open')
    .is('notified_at', null)
    .order('first_detected_at')
    .limit(500)

  if (error) throw new Error('Unable to load alerts to notify: ' + error.message)
  if (!pending?.length) return { alerts: 0, deliveries: 0 }

  const now = new Date().toISOString()
  const quiet = pending.filter((alert: any) => alert.forge_ai_watch_rules?.notification_mode === 'none')
  const candidates = pending.filter((alert: any) => alert.forge_ai_watch_rules?.notification_mode !== 'none')

  const { data: configured } = await supabase
    .from('forge_ai_alert_routes')
    .select('id, rule_key, min_severity, recipient_type, tenant_role_id, user_id, channel')
    .eq('organization_id', organizationId)
    .eq('enabled', true)

  const routes: Route[] = configured?.length ? configured : await defaultRoutes(supabase, organizationId)

  // Who each route reaches: active members of the tenant only.
  const roleIds = routes.filter(route => route.tenant_role_id).map(route => route.tenant_role_id)

  const [{ data: roleMembers }, { data: memberships }] = await Promise.all([
    roleIds.length
      ? supabase.from('forge_tenant_user_roles').select('user_id, role_id').eq('organization_id', organizationId).in('role_id', roleIds)
      : Promise.resolve({ data: [] }),
    supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)
  ])

  const active = new Set((memberships || []).map((row: any) => row.user_id))

  // recipient -> channel -> alert ids routed to them
  const routed = new Map<string, Map<'in_app' | 'email', Set<string>>>()

  for (const route of routes) {
    const users =
      route.recipient_type === 'user'
        ? [route.user_id]
        : (roleMembers || []).filter((row: any) => row.role_id === route.tenant_role_id).map((row: any) => row.user_id)

    for (const userId of users) {
      if (!userId || !active.has(userId)) continue

      for (const alert of candidates) {
        if (route.rule_key && route.rule_key !== alert.rule_key) continue
        if (!severityAtLeast(alert.severity, route.min_severity)) continue

        const channels = routed.get(userId) || new Map()
        const ids = channels.get(route.channel) || new Set<string>()

        ids.add(alert.id)
        channels.set(route.channel, ids)
        routed.set(userId, channels)
      }
    }
  }

  // Drop anything a recipient could not open themselves.
  const recipientsByAlert = new Map<string, Array<{ userId: string; channel: 'in_app' | 'email' }>>()

  for (const [userId, channels] of routed) {
    const access = await getEffectiveTenantAccess({ organizationId, userId })
    const permissionByKey = new Map(access.effective.map(item => [item.permissionKey, item]))
    const alertPermission = permissionByKey.get('forge_ai.view_alerts')

    if (!alertPermission?.allowed) continue

    const visible = new Set(
      (await getScopedForgeAiWatchAlerts({ organizationId, userId, alertPermission, permissionByKey })).map((alert: any) => alert.id)
    )

    for (const [channel, ids] of channels) {
      for (const alertId of ids) {
        if (!visible.has(alertId)) continue

        const list = recipientsByAlert.get(alertId) || []

        list.push({ userId, channel })
        recipientsByAlert.set(alertId, list)
      }
    }
  }

  let deliveries = 0

  for (const alert of candidates) {
    const recipients = recipientsByAlert.get(alert.id) || []
    let eventId: string | null = null

    // Claim the alert before notifying: when two cycles overlap, only the one whose update
    // still finds notified_at empty sends anything.
    const { data: claimed, error: claimError } = await supabase
      .from('forge_ai_watch_alerts')
      .update({ notified_at: now })
      .eq('id', alert.id)
      .is('notified_at', null)
      .select('id')

    if (claimError) throw new Error(claimError.message)
    if (!claimed?.length) continue

    const release = () => supabase.from('forge_ai_watch_alerts').update({ notified_at: null }).eq('id', alert.id)

    if (recipients.length) {
      const { data: event, error: eventError } = await supabase
        .from('forge_notification_events')
        .insert({
          organization_id: organizationId,
          source_module: 'forge_ai',
          event_type: 'watch_alert',
          visibility: 'customer',
          resource_type: 'forge_ai_watch_alert',
          resource_id: alert.id,
          title: String(alert.title).slice(0, 200),
          body: String(alert.summary).slice(0, 2000),
          payload: { rule_key: alert.rule_key, severity: alert.severity }
        })
        .select('id')
        .single()

      if (eventError || !event) {
        await release()
        throw new Error(eventError?.message || 'Unable to record the notification.')
      }
      eventId = event.id

      const { error: deliveryError } = await supabase.from('forge_notification_deliveries').upsert(
        recipients.map(recipient => ({
          event_id: event.id,
          organization_id: organizationId,
          recipient_user_id: recipient.userId,
          recipient_audience: 'customer',
          channel: recipient.channel,
          status: recipient.channel === 'in_app' ? 'sent' : 'pending',
          sent_at: recipient.channel === 'in_app' ? now : null,
          title: String(alert.title).slice(0, 200),
          body: String(alert.summary).slice(0, 2000),
          link_path: '/ai/watch?alert=' + alert.id
        })),
        { onConflict: 'event_id,recipient_user_id,channel', ignoreDuplicates: true }
      )

      if (deliveryError) {
        await supabase.from('forge_notification_events').delete().eq('id', event.id)
        await release()
        throw new Error(deliveryError.message)
      }

      deliveries += recipients.length
    }

    await supabase
      .from('forge_ai_watch_alerts')
      .update({ notification_event_id: eventId, notified_recipients: new Set(recipients.map(item => item.userId)).size })
      .eq('id', alert.id)
  }

  if (quiet.length) {
    await supabase
      .from('forge_ai_watch_alerts')
      .update({ notified_at: now, notified_recipients: 0 })
      .in('id', quiet.map((alert: any) => alert.id))
      .is('notified_at', null)
  }

  await recordForgeAiAudit({
    organizationId,
    actorType: 'system',
    eventType: 'watch.notified',
    resourceType: 'forge_ai_watch_alert',
    detail: { alerts: candidates.length, quiet: quiet.length, deliveries, default_routes: !configured?.length }
  })

  return { alerts: candidates.length, deliveries }
}

// One full monitoring cycle for a tenant: refresh risk indicators (so the elevated-risk rule
// sees current scores), evaluate every Watch rule, turn the results into recommendations and
// verify finished ones, then notify. Risk scoring and recommendations are Command Center
// features: a tenant without the Command Center gets the Watch rules and notifications only.
export const runForgeAiMonitoringCycle = async ({
  organizationId,
  triggerType,
  actorUserId = null
}: {
  organizationId: string
  triggerType: 'manual' | 'scheduled' | 'event'
  actorUserId?: string | null
}) => {
  const commandCenter = await isTenantFeatureAvailable({ organizationId, featureKey: COMMAND_CENTER_FEATURE })

  const risk = commandCenter
    ? await runForgeAiRiskAssessments({ organizationId, triggerType, actorUserId })
    : { modelVersion: null, scopes: [] as Awaited<ReturnType<typeof runForgeAiRiskAssessments>>['scopes'] }

  const watch = await runForgeAiWatch({
    organizationId,
    triggerType: triggerType === 'event' ? 'system' : triggerType,
    startedBy: actorUserId
  })

  const recommendations = commandCenter
    ? await generateForgeAiRecommendations({ organizationId, actorUserId })
    : { candidates: 0, created: 0, superseded: 0 }

  const verification = commandCenter
    ? await verifyForgeAiRecommendations({ organizationId })
    : { checked: 0, verified: 0, failed: 0, overdue: 0 }

  const notified = await notifyForgeAiWatchAlerts({ organizationId })

  return { commandCenter, risk, watch, recommendations, verification, notified }
}

// Event-driven monitoring: run a cycle for each tenant that has new domain events (incident
// submitted, CAPA, observation, risk and JSA transitions) since its last reaction. The first
// call for a tenant only sets its cursor, so history is not replayed.
export const processForgeAiWatchEvents = async ({ organizationIds }: { organizationIds: string[] }) => {
  const supabase = createServiceRoleClient() as any
  const results: Array<Record<string, unknown>> = []

  for (const organizationId of organizationIds) {
    const { data: cursor } = await supabase
      .from('forge_ai_watch_cursors')
      .select('last_event_at')
      .eq('organization_id', organizationId)
      .maybeSingle()

    const { data: latest } = await supabase
      .from('forge_domain_event_outbox')
      .select('occurred_at')
      .eq('organization_id', organizationId)
      .order('occurred_at', { ascending: false })
      .limit(1)

    const newest = latest?.[0]?.occurred_at || null

    if (!cursor) {
      await supabase
        .from('forge_ai_watch_cursors')
        .upsert({ organization_id: organizationId, last_event_at: newest || new Date().toISOString(), updated_at: new Date().toISOString() })
      results.push({ organizationId, initialized: true })
      continue
    }

    const { count } = await supabase
      .from('forge_domain_event_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gt('occurred_at', cursor.last_event_at)

    if (!count) {
      results.push({ organizationId, events: 0 })
      continue
    }

    try {
      const cycle = await runForgeAiMonitoringCycle({ organizationId, triggerType: 'event' })

      await supabase
        .from('forge_ai_watch_cursors')
        .update({ last_event_at: newest, updated_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
      results.push({ organizationId, events: count, alertsCreated: cycle.watch.alertsCreated, deliveries: cycle.notified.deliveries })
    } catch (error) {
      // The cursor stays put, so the next call retries these events.
      results.push({ organizationId, events: count, error: error instanceof Error ? error.message : 'Monitoring cycle failed.' })
    }
  }

  return results
}
