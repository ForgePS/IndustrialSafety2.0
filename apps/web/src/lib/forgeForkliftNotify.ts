import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { isTenantFeatureAvailable } from '@/lib/forgeFeatureAvailability'
import { companyTimeZone, covers, forkliftRights, loadForkliftSettings } from '@/lib/forgeForkliftAccess'
import { daysBetween, formatDate, todayIn } from '@/lib/forgeForkliftRules'

/**
 * Port slice 19: forklift operator notices through the shared notification service (forge_notification_events plus
 * an in-app delivery and a pending email delivery that the outbox drain at /api/helpdesk/cron sends), same shape as
 * forgePermitNotify.ts.
 *
 * - Status changes: the operator's own signed-in user is told when they are suspended, revoked or required to take
 *   refresher training (never when they did it themselves).
 * - Scheduled (runForkliftCron): authorizations coming up for re-evaluation within the company's reminder window
 *   (expiry_notice_days) and ones that have expired. The people with forklifts.authorize whose scope covers the
 *   operator's location are told, plus the operator's own user for "expiring". Once per operator, kind and
 *   expiry date (forge_forklift_notice_log), so a new evaluation starts a new window.
 *
 * Workflow notices never throw: a notice problem must never fail the step.
 */

const SOURCE = 'forklifts'

const db = () => createServiceRoleClient() as any

type Notice = { userId: string; kind: string; dedupeKey: string; title: string; body: string; link: string }

const operatorPath = (operatorId: string) => `/forklifts/operators/${operatorId}`

const activeMemberIds = async (organizationId: string, userIds?: string[]) => {
  if (userIds && !userIds.length) return new Set<string>()

  let query = db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)

  if (userIds) query = query.in('user_id', [...new Set(userIds)])

  const { data, error } = await query

  if (error) throw new Error('Unable to load organization members: ' + error.message)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

/** Queues each notice once (deduped on payload.dedupe_key). Returns the ids of the events created. */
const queueNotices = async (organizationId: string, operatorId: string, notices: Notice[], actorUserId: string | null) => {
  const created: string[] = []

  if (!notices.length) return created

  const supabase = db()

  const members = await activeMemberIds(
    organizationId,
    notices.map(notice => notice.userId)
  )

  for (const notice of notices) {
    if (!members.has(notice.userId)) continue

    const { data: existing } = await supabase.from('forge_notification_events').select('id').eq('source_module', SOURCE).eq('payload->>dedupe_key', notice.dedupeKey).limit(1)

    if (existing?.length) continue

    const { data: event, error: eventError } = await supabase
      .from('forge_notification_events')
      .insert({
        organization_id: organizationId,
        source_module: SOURCE,
        event_type: notice.kind,
        visibility: 'customer',
        resource_type: 'forklift_operator',
        resource_id: operatorId,
        actor_user_id: actorUserId,
        title: notice.title.slice(0, 200),
        body: notice.body.slice(0, 2000),
        payload: { kind: notice.kind, dedupe_key: notice.dedupeKey, recipient_user_id: notice.userId }
      })
      .select('id')
      .single()

    if (eventError || !event) throw new Error('Unable to queue forklift notice: ' + (eventError?.message || 'no event'))

    // Race guard: the oldest event with this key wins; a concurrent duplicate removes itself.
    const { data: winners } = await supabase
      .from('forge_notification_events')
      .select('id')
      .eq('source_module', SOURCE)
      .eq('payload->>dedupe_key', notice.dedupeKey)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)

    if (winners?.[0]?.id && winners[0].id !== event.id) {
      await supabase.from('forge_notification_events').delete().eq('id', event.id)
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
        link_path: notice.link,
        sent_at: channel === 'in_app' ? now : null
      }))
    )

    if (deliveryError) {
      await supabase.from('forge_notification_events').delete().eq('id', event.id)
      throw new Error('Unable to queue forklift notice deliveries: ' + deliveryError.message)
    }

    created.push(event.id)
  }

  return created
}

type RightsCache = Map<string, Awaited<ReturnType<typeof forkliftRights>>>

/** Active members holding forklifts.authorize whose grant reaches the location. */
export const forkliftAuthorizersAt = async (organizationId: string, locationId: string | null, cache?: RightsCache) => {
  const supabase = db()
  const { data: permissions } = await supabase.from('forge_permission_registry').select('id').eq('permission_key', 'forklifts.authorize')
  const permissionIds = (permissions || []).map((row: any) => row.id)

  if (!permissionIds.length) return []

  const [{ data: grants }, { data: overrides }] = await Promise.all([
    supabase.from('forge_tenant_role_permissions').select('role_id').in('permission_id', permissionIds).eq('allowed', true),
    supabase.from('forge_user_permission_overrides').select('user_id').eq('organization_id', organizationId).in('permission_id', permissionIds).eq('override_state', 'allow')
  ])

  const roleIds = [...new Set<string>((grants || []).map((row: any) => row.role_id))]

  const { data: roleUsers } = roleIds.length
    ? await supabase.from('forge_tenant_user_roles').select('user_id').eq('organization_id', organizationId).in('role_id', roleIds)
    : { data: [] }

  const candidates = [...(await activeMemberIds(organizationId, [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]))]

  const checked = await Promise.all(
    candidates.map(async userId => {
      let rights = cache?.get(userId)

      if (!rights) {
        rights = await forkliftRights(organizationId, userId, await getEffectiveTenantAccess({ organizationId, userId }))
        cache?.set(userId, rights)
      }

      return covers(rights.authorize, locationId) ? userId : null
    })
  )

  return checked.filter((userId): userId is string => Boolean(userId))
}

/** The operator row with the person's name, location and linked user. */
const loadOperatorRow = async (organizationId: string, operatorId: string) => {
  const { data } = await db()
    .from('forge_forklift_operators')
    .select(
      'id, personnel_id, status, truck_classes, expires_on, evaluated_on, refresher_required, refresher_reason, refresher_required_at, suspend_reason, suspended_at, revoke_reason, revoked_at, ' +
        'forge_personnel!forge_forklift_operators_personnel_id_fkey!inner(first_name, last_name, location_id, auth_user_id)'
    )
    .eq('organization_id', organizationId)
    .eq('id', operatorId)
    .maybeSingle()

  return data as any | null
}

const personName = (row: any) => `${row.forge_personnel?.first_name || ''} ${row.forge_personnel?.last_name || ''}`.trim() || 'Operator'

export type OperatorStatusAction = 'suspend' | 'revoke' | 'require_refresher'

/** Suspended, revoked or refresher required: the operator's own user (not when they did it themselves). */
export const notifyOperatorStatus = async ({ organizationId, operatorId, actorUserId, action }: { organizationId: string; operatorId: string; actorUserId: string; action: string }) => {
  if (!['suspend', 'revoke', 'require_refresher'].includes(action)) return 0

  try {
    const row = await loadOperatorRow(organizationId, operatorId)
    const userId = row?.forge_personnel?.auth_user_id as string | null

    if (!row || !userId || userId === actorUserId) return 0

    const notice =
      action === 'suspend'
        ? row.status === 'suspended' && {
            kind: 'forklift_operator_suspended',
            key: `forklift-suspended:${row.id}:${row.suspended_at}`,
            title: 'Your forklift authorization is suspended',
            body: `Your forklift authorization is suspended: ${row.suspend_reason}. Do not operate a forklift until it is reinstated.`
          }
        : action === 'revoke'
          ? row.status === 'revoked' && {
              kind: 'forklift_operator_revoked',
              key: `forklift-revoked:${row.id}:${row.revoked_at}`,
              title: 'Your forklift authorization was revoked',
              body: `Your forklift authorization was revoked: ${row.revoke_reason}. Do not operate a forklift.`
            }
          : row.refresher_required && {
              kind: 'forklift_refresher_required',
              key: `forklift-refresher:${row.id}:${row.refresher_required_at}`,
              title: 'Forklift refresher training required',
              body: `You need refresher training and a new evaluation before you operate a forklift again: ${row.refresher_reason}.`
            }

    if (!notice) return 0

    return (
      await queueNotices(
        organizationId,
        row.id,
        [{ userId, kind: notice.kind, dedupeKey: notice.key, title: notice.title, body: notice.body, link: operatorPath(row.id) }],
        actorUserId
      )
    ).length
  } catch (error) {
    console.error('[forklifts] status notice', operatorId, (error as Error).message)

    return 0
  }
}

// ---------------------------------------------------------------------------
// Scheduled notices
// ---------------------------------------------------------------------------

export type ForkliftNoticeKind = 'expiring' | 'expired'

type Due = { operator: any; kind: ForkliftNoticeKind; dueOn: string; title: string; body: string }

/** What each authorized operator is due a notice for today (company date). */
export const operatorNoticesDue = (operators: any[], { today, noticeDays }: { today: string; noticeDays: number }): Due[] => {
  const due: Due[] = []

  for (const operator of operators) {
    if (operator.status !== 'authorized') continue
    const name = personName(operator)
    const left = daysBetween(today, operator.expires_on)
    const when = formatDate(operator.expires_on)

    if (left < 0) {
      due.push({
        operator,
        kind: 'expired',
        dueOn: operator.expires_on,
        title: `Forklift evaluation expired: ${name}`,
        body: `${name}'s forklift evaluation expired on ${when}. They must not operate a forklift until they are evaluated again.`
      })
    } else if (left <= noticeDays) {
      due.push({
        operator,
        kind: 'expiring',
        dueOn: operator.expires_on,
        title: `Forklift re-evaluation due: ${name}`,
        body: `${name}'s forklift authorization expires on ${when} (${left === 0 ? 'today' : left === 1 ? 'tomorrow' : `in ${left} days`}). Evaluate them again before then.`
      })
    }
  }

  return due
}

/** Scheduled notices for one organization. */
export const queueForkliftNotices = async (organizationId: string, now = new Date()) => {
  const supabase = db()
  const [settings, timeZone] = await Promise.all([loadForkliftSettings(organizationId), companyTimeZone(organizationId)])
  const today = todayIn(timeZone, now)
  const until = new Date(Date.parse(today + 'T00:00:00Z') + settings.expiry_notice_days * 86400_000).toISOString().slice(0, 10)

  const { data: operators, error } = await supabase
    .from('forge_forklift_operators')
    .select('id, personnel_id, status, expires_on, forge_personnel!forge_forklift_operators_personnel_id_fkey!inner(first_name, last_name, location_id, auth_user_id)')
    .eq('organization_id', organizationId)
    .eq('status', 'authorized')
    .lte('expires_on', until)

  if (error) throw new Error('Unable to load forklift operators: ' + error.message)

  const due = operatorNoticesDue((operators || []) as any[], { today, noticeDays: settings.expiry_notice_days })

  if (!due.length) return { due: 0, sent: 0, queued: 0 }

  const rightsCache: RightsCache = new Map()
  const byLocation = new Map<string, string[]>()
  let sent = 0
  let queued = 0
  const failures: string[] = []

  for (const item of due) {
    // Claim the notice first: one already logged (an earlier or parallel run) is skipped.
    const { data: claimed, error: claimError } = await supabase
      .from('forge_forklift_notice_log')
      .upsert({ organization_id: organizationId, operator_id: item.operator.id, kind: item.kind, due_on: item.dueOn }, { onConflict: 'operator_id,kind,due_on', ignoreDuplicates: true })
      .select('id')

    if (claimError) {
      failures.push(claimError.message)
      continue
    }

    if (!claimed?.length) continue

    try {
      const locationId = (item.operator.forge_personnel?.location_id as string | null) || null
      const key = locationId || 'none'

      if (!byLocation.has(key)) byLocation.set(key, await forkliftAuthorizersAt(organizationId, locationId, rightsCache))

      const own = item.kind === 'expiring' ? (item.operator.forge_personnel?.auth_user_id as string | null) : null
      const recipients = [...new Set([...(byLocation.get(key) || []), ...(own ? [own] : [])])]

      const created = await queueNotices(
        organizationId,
        item.operator.id,
        recipients.map(userId => ({
          userId,
          kind: `forklift_operator_${item.kind}`,
          dedupeKey: `forklift-${item.kind}:${item.operator.id}:${item.dueOn}:${userId}`,
          title: userId === own ? 'Your forklift re-evaluation is due' : item.title,
          body: userId === own ? `Your forklift authorization expires on ${formatDate(item.dueOn)}. Ask your supervisor to arrange your evaluation.` : item.body,
          link: operatorPath(item.operator.id)
        })),
        null
      )

      sent += 1
      queued += created.length
    } catch (failure) {
      await supabase.from('forge_forklift_notice_log').delete().eq('id', claimed[0].id)
      console.error('[forklifts] scheduled notice', item.operator.id, (failure as Error).message)
      failures.push((failure as Error).message)
    }
  }

  return { due: due.length, sent, queued, ...(failures.length ? { failures: failures.length } : {}) }
}

/** The scheduled job: every organization with authorized operators. */
export const runForkliftCron = async ({ now = new Date() }: { now?: Date } = {}) => {
  const { data, error } = await db().from('forge_forklift_operators').select('organization_id').eq('status', 'authorized')

  if (error) throw new Error('Unable to load forklift organizations: ' + error.message)

  const organizationIds = [...new Set<string>((data || []).map((row: any) => row.organization_id))]
  const results = []

  for (const organizationId of organizationIds) {
    try {
      if (!(await isTenantFeatureAvailable({ organizationId, featureKey: 'forklifts' }))) {
        results.push({ organizationId, skipped: 'Forklifts are not turned on.' })
        continue
      }

      results.push({ organizationId, ...(await queueForkliftNotices(organizationId, now)) })
    } catch (failure) {
      console.error('[forklifts] cron', organizationId, (failure as Error).message)
      results.push({ organizationId, error: (failure as Error).message })
    }
  }

  return { checked: organizationIds.length, results }
}
