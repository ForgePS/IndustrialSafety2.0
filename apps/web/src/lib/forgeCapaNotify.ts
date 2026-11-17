import { createServiceRoleClient } from '@repo/supabase/server'

import { correctiveActionWithinScope } from '@/lib/forgeCorrectiveActions'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import {
  CAPA_DUE_SOON_DAYS,
  CAPA_NOTIFY_SOURCE,
  CAPA_REMINDER_STATUSES,
  capaAssignedNotice,
  capaNeedsVerificationNotices,
  capaRemindersDue,
  localDateIso
} from '@/lib/forgeCapaNotifyRules'
import type { CapaNotice } from '@/lib/forgeCapaNotifyRules'

/**
 * Corrective Action (CAPA) notices through the shared notification service (forgeNotifications.ts): each
 * notice is one forge_notification_events row with an in-app delivery and a pending email delivery, which the
 * outbox drain at /api/helpdesk/cron sends (same shape as the training notices). New in 2.0; 1.0 had none.
 *
 * Dedupe: the event payload carries a dedupe_key (forgeCapaNotifyRules). A notice whose key already exists is
 * not queued again. If two runs race, both insert an event, the older one wins and the newer one is deleted
 * before any delivery is written.
 *
 * Every exported function catches its own errors: a notice problem must never undo or fail the CAPA change.
 */

type QueueTotals = { queued: number; duplicate: number; skipped: number }

const CAPA_COLUMNS = 'id, organization_id, action_number, title, status, due_at, assigned_user_id, archived_at, row_version, completed_at, created_by, location_id, division_id'
const VERIFY_PERMISSION = 'corrective_actions.verify'

const emptyTotals = (): QueueTotals => ({ queued: 0, duplicate: 0, skipped: 0 })

const quote = (value: string) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'

const chunks = <T>(items: T[], size: number) => {
  const out: T[][] = []

  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size))

  return out
}

const activeMemberIds = async (supabase: any, organizationId: string, userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))]

  if (!ids.length) return new Set<string>()

  const { data, error } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('user_id', ids)

  if (error) throw new Error('Unable to load organization members: ' + error.message)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

const existingDedupeKeys = async (supabase: any, keys: string[]) => {
  const found = new Set<string>()

  for (const batch of chunks([...new Set(keys)], 100)) {
    const { data, error } = await supabase
      .from('forge_notification_events')
      .select('payload')
      .eq('source_module', CAPA_NOTIFY_SOURCE)
      .filter('payload->>dedupe_key', 'in', '(' + batch.map(quote).join(',') + ')')

    if (error) throw new Error('Unable to read sent CAPA notices: ' + error.message)

    for (const row of data || []) if (row.payload?.dedupe_key) found.add(row.payload.dedupe_key)
  }

  return found
}

/** Writes one event plus in-app and email deliveries per notice, skipping notices already sent. */
const queueCapaNotices = async (notices: CapaNotice[], actorUserId: string | null): Promise<QueueTotals> => {
  const totals = emptyTotals()

  if (!notices.length) return totals

  const supabase = createServiceRoleClient() as any
  const sent = await existingDedupeKeys(supabase, notices.map(notice => notice.dedupeKey))
  const byOrg = new Map<string, CapaNotice[]>()

  for (const notice of notices) {
    if (sent.has(notice.dedupeKey)) {
      totals.duplicate += 1
      continue
    }

    byOrg.set(notice.organizationId, [...(byOrg.get(notice.organizationId) || []), notice])
  }

  for (const [organizationId, items] of byOrg) {
    const members = await activeMemberIds(supabase, organizationId, items.map(item => item.userId))

    for (const notice of items) {
      if (!members.has(notice.userId)) {
        totals.skipped += 1
        continue
      }

      const { data: event, error: eventError } = await supabase
        .from('forge_notification_events')
        .insert({
          organization_id: organizationId,
          source_module: CAPA_NOTIFY_SOURCE,
          event_type: notice.kind,
          visibility: 'customer',
          resource_type: 'corrective_action',
          resource_id: notice.correctiveActionId,
          actor_user_id: actorUserId,
          title: notice.title.slice(0, 200),
          body: notice.body.slice(0, 2000),
          payload: { kind: notice.kind, dedupe_key: notice.dedupeKey, recipient_user_id: notice.userId }
        })
        .select('id')
        .single()

      if (eventError || !event) throw new Error('Unable to queue CAPA notice: ' + (eventError?.message || 'no event'))

      // Race guard: the oldest event with this key wins; a concurrent duplicate removes itself.
      const { data: winners } = await supabase
        .from('forge_notification_events')
        .select('id')
        .eq('source_module', CAPA_NOTIFY_SOURCE)
        .eq('payload->>dedupe_key', notice.dedupeKey)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1)

      if (winners?.[0]?.id && winners[0].id !== event.id) {
        await supabase.from('forge_notification_events').delete().eq('id', event.id)
        totals.duplicate += 1
        continue
      }

      const now = new Date().toISOString()

      const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(
        (['in_app', 'email'] as const).map(channel => ({
          event_id: event.id,
          organization_id: organizationId,
          recipient_user_id: notice.userId,
          recipient_audience: 'customer',
          channel,
          status: channel === 'in_app' ? 'sent' : 'pending',
          title: notice.title.slice(0, 200),
          body: notice.body.slice(0, 2000),
          link_path: notice.linkPath,
          sent_at: channel === 'in_app' ? now : null
        }))
      )

      if (deliveryError) {
        await supabase.from('forge_notification_events').delete().eq('id', event.id)
        throw new Error('Unable to queue CAPA notice deliveries: ' + deliveryError.message)
      }

      totals.queued += 1
    }
  }

  return totals
}

const loadCapa = async (supabase: any, organizationId: string, correctiveActionId: string) => {
  const { data, error } = await supabase
    .from('forge_corrective_actions')
    .select(CAPA_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('id', correctiveActionId)
    .maybeSingle()

  if (error) throw new Error('Unable to load Corrective Action: ' + error.message)

  return data
}

/**
 * "Corrective Action assigned to you" for the CAPA's current assignee. Call after a create, and after an update
 * that changed the assignee. Skipped when there is no assignee with a login or the actor is the assignee.
 */
export const notifyCapaAssigned = async ({
  organizationId,
  correctiveActionId,
  actorUserId
}: {
  organizationId: string
  correctiveActionId: string
  actorUserId: string | null
}): Promise<QueueTotals> => {
  try {
    const capa = await loadCapa(createServiceRoleClient() as any, organizationId, correctiveActionId)
    const notice = capa ? capaAssignedNotice(capa, actorUserId) : null

    return notice ? await queueCapaNotices([notice], actorUserId) : emptyTotals()
  } catch (error) {
    console.error('[corrective-actions] assigned notice', correctiveActionId, (error as Error).message)

    return emptyTotals()
  }
}

/**
 * Active members who may verify this CAPA: corrective_actions.verify granted (role or override, as
 * getEffectiveTenantAccess resolves it) with a scope that covers the CAPA, the same check verifyCorrectiveAction makes.
 */
export const getCapaVerifierIds = async (organizationId: string, capa: any): Promise<string[]> => {
  const supabase = createServiceRoleClient() as any

  const { data: permission } = await supabase.from('forge_permission_registry').select('id').eq('permission_key', VERIFY_PERMISSION).maybeSingle()

  if (!permission) return []

  // Cheap prefilter: members holding a role that grants the permission, or an explicit allow override.
  const [{ data: grants }, { data: overrides }] = await Promise.all([
    supabase.from('forge_tenant_role_permissions').select('role_id').eq('permission_id', permission.id).eq('allowed', true),
    supabase
      .from('forge_user_permission_overrides')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('permission_id', permission.id)
      .eq('override_state', 'allow')
  ])

  const roleIds = [...new Set<string>((grants || []).map((row: any) => row.role_id))]

  const { data: roleUsers } = roleIds.length
    ? await supabase.from('forge_tenant_user_roles').select('user_id').eq('organization_id', organizationId).in('role_id', roleIds)
    : { data: [] }

  const candidates = [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]
  const members = await activeMemberIds(supabase, organizationId, candidates)

  const checked = await Promise.all(
    [...members].map(async userId => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })
      const grant = access.effective.find(item => item.permissionKey === VERIFY_PERMISSION && item.allowed)

      if (!grant) return null

      const inScope = await correctiveActionWithinScope({ organizationId, userId, scope: grant.scope, action: capa })

      return inScope ? userId : null
    })
  )

  return checked.filter((userId): userId is string => Boolean(userId))
}

/**
 * "Corrective Action needs verification" for everyone who can verify it, except the submitter. Call after a
 * successful submitCorrectiveActionForVerification.
 */
export const notifyCapaNeedsVerification = async ({
  organizationId,
  correctiveActionId,
  actorUserId
}: {
  organizationId: string
  correctiveActionId: string
  actorUserId: string | null
}): Promise<QueueTotals> => {
  try {
    const capa = await loadCapa(createServiceRoleClient() as any, organizationId, correctiveActionId)

    if (!capa || capa.status !== 'pending_verification') return emptyTotals()

    const verifiers = await getCapaVerifierIds(organizationId, capa)

    return await queueCapaNotices(capaNeedsVerificationNotices(capa, verifiers, actorUserId), actorUserId)
  } catch (error) {
    console.error('[corrective-actions] verification notice', correctiveActionId, (error as Error).message)

    return emptyTotals()
  }
}

/**
 * The scheduled sweep: due-soon (within CAPA_DUE_SOON_DAYS) and overdue notices to the assignee of every open
 * or in-progress CAPA across organizations. Each notice sends once per due date, so the job can run hourly.
 */
export const runCapaReminderSweep = async ({ now = new Date() }: { now?: Date } = {}) => {
  const result = { checked: 0, ...emptyTotals(), error: null as string | null }

  try {
    const supabase = createServiceRoleClient() as any
    const todayIso = localDateIso(now)

    // Generous horizon (time-zone slack); capaRemindersDue makes the exact local-date call.
    const horizon = new Date(now.getTime() + (CAPA_DUE_SOON_DAYS + 2) * 86_400_000).toISOString()
    const rows: any[] = []

    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('forge_corrective_actions')
        .select(CAPA_COLUMNS)
        .in('status', CAPA_REMINDER_STATUSES)
        .is('archived_at', null)
        .not('assigned_user_id', 'is', null)
        .not('due_at', 'is', null)
        .lte('due_at', horizon)
        .order('id')
        .range(from, from + 999)

      if (error) throw new Error('Unable to load Corrective Actions: ' + error.message)

      rows.push(...(data || []))

      if (!data || data.length < 1000) break
    }

    result.checked = rows.length

    const totals = await queueCapaNotices(capaRemindersDue(rows, todayIso), null)

    Object.assign(result, totals)
  } catch (error) {
    console.error('[corrective-actions] reminder sweep', (error as Error).message)
    result.error = (error as Error).message
  }

  return result
}
