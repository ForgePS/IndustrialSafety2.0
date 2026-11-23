import { createServiceRoleClient } from '@repo/supabase/server'

import { formatWhen } from '@/components/permits/format'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { isTenantFeatureAvailable } from '@/lib/forgeFeatureAvailability'
import { companyTimeZone, covers, loadPermitSettings, PERMIT_COLUMNS, permitRights } from '@/lib/forgePermitAccess'
import { PERMIT_TYPE_INFO, permitPath, type PermitSettings, type PermitType } from '@/lib/forgePermitRules'

/**
 * Port slice 18: work permit notices through the shared notification service (forge_notification_events plus an
 * in-app delivery and a pending email delivery that the outbox drain at /api/helpdesk/cron sends), same shape as
 * forgeDocumentNotify.ts. 1.0 told nobody anything.
 *
 * - Submitted: the approvers whose scope covers the permit's location (never the requester).
 * - Approved, sent back (with the reason), issued: the requester.
 * - Suspended: the requester and the approvers in scope, with the reason. A failed gas test says to get everyone
 *   out of the space.
 * - Scheduled (runPermitCron): expiring within 60 minutes, expired but still open, hot work fire watch finished
 *   (ready to close), and confined space entries whose latest gas test is too old. Requester plus approvers in
 *   scope, once per permit, kind and window (forge_permit_notice_log).
 *
 * Nobody is told about their own action. The workflow notices never throw: a notice problem must never fail the step.
 */

const SOURCE = 'permits'

const db = () => createServiceRoleClient() as any

type Notice = { userId: string; kind: string; dedupeKey: string; title: string; body: string; link: string }

const activeMemberIds = async (organizationId: string, userIds?: string[]) => {
  if (userIds && !userIds.length) return new Set<string>()

  let query = db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)

  if (userIds) query = query.in('user_id', [...new Set(userIds)])

  const { data, error } = await query

  if (error) throw new Error('Unable to load organization members: ' + error.message)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

/** Queues each notice once (deduped on payload.dedupe_key). Returns the ids of the events created. */
const queueNotices = async (organizationId: string, permitId: string, notices: Notice[], actorUserId: string | null) => {
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
        resource_type: 'permit',
        resource_id: permitId,
        actor_user_id: actorUserId,
        title: notice.title.slice(0, 200),
        body: notice.body.slice(0, 2000),
        payload: { kind: notice.kind, dedupe_key: notice.dedupeKey, recipient_user_id: notice.userId }
      })
      .select('id')
      .single()

    if (eventError || !event) throw new Error('Unable to queue permit notice: ' + (eventError?.message || 'no event'))

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
      throw new Error('Unable to queue permit notice deliveries: ' + deliveryError.message)
    }

    created.push(event.id)
  }

  return created
}

/** Active members holding permits.approve whose grant reaches the location. */
export const permitApproversAt = async (organizationId: string, locationId: string, cache?: Map<string, Awaited<ReturnType<typeof permitRights>>>) => {
  const supabase = db()
  const { data: permissions } = await supabase.from('forge_permission_registry').select('id').eq('permission_key', 'permits.approve')
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
        rights = await permitRights(organizationId, userId, await getEffectiveTenantAccess({ organizationId, userId }))
        cache?.set(userId, rights)
      }

      return covers(rights.approve, locationId) ? userId : null
    })
  )

  return checked.filter((userId): userId is string => Boolean(userId))
}

const loadPermitRow = async (organizationId: string, permitId: string) => {
  const { data } = await db().from('forge_permits').select(PERMIT_COLUMNS).eq('organization_id', organizationId).eq('id', permitId).maybeSingle()

  return data as any | null
}

const userName = async (userId: string | null) => {
  if (!userId) return null

  const { data } = await db().from('users').select('name, email').eq('user_id', userId).maybeSingle()

  return (data?.name || data?.email || null) as string | null
}

const label = (permit: any) => `${permit.permit_number} (${permit.title})`

const typeLabel = (permit: any) => PERMIT_TYPE_INFO[permit.permit_type as PermitType]?.label || 'Work'

const requesterOf = (permit: any) => (permit.requested_by || permit.created_by || null) as string | null

const link = (permit: any) => permitPath(permit.permit_type as PermitType, permit.id)

type WorkflowNoticeInput = { organizationId: string; permitId: string; actorUserId: string }

/** Sent for approval: the approvers in scope, not the requester. */
export const notifyPermitSubmitted = async ({ organizationId, permitId, actorUserId }: WorkflowNoticeInput) => {
  try {
    const permit = await loadPermitRow(organizationId, permitId)

    if (!permit || permit.status !== 'requested') return 0

    const requester = permit.requested_by
    const approvers = (await permitApproversAt(organizationId, permit.location_id)).filter(userId => userId !== requester && userId !== actorUserId)
    const who = (await userName(requester)) || 'Someone'

    return (
      await queueNotices(
        organizationId,
        permit.id,
        approvers.map(userId => ({
          userId,
          kind: 'permit_submitted',
          dedupeKey: `permit-submitted:${permit.id}:${permit.requested_at}:${userId}`,
          title: `Permit waiting for approval: ${permit.permit_number}`,
          body: `${who} sent ${typeLabel(permit)} permit ${label(permit)} for approval.`,
          link: link(permit)
        })),
        actorUserId
      )
    ).length
  } catch (error) {
    console.error('[permits] submitted notice', permitId, (error as Error).message)

    return 0
  }
}

const notifyRequester = async (
  { organizationId, permitId, actorUserId }: WorkflowNoticeInput,
  build: (permit: any, timeZone: string) => { ok: boolean; kind: string; key: string; title: string; body: string }
) => {
  try {
    const permit = await loadPermitRow(organizationId, permitId)
    const requester = permit ? requesterOf(permit) : null

    if (!permit || !requester || requester === actorUserId) return 0

    const notice = build(permit, await companyTimeZone(organizationId))

    if (!notice.ok) return 0

    return (
      await queueNotices(
        organizationId,
        permit.id,
        [{ userId: requester, kind: notice.kind, dedupeKey: notice.key, title: notice.title, body: notice.body, link: link(permit) }],
        actorUserId
      )
    ).length
  } catch (error) {
    console.error('[permits] requester notice', permitId, (error as Error).message)

    return 0
  }
}

/** Approved: the requester. */
export const notifyPermitApproved = async (input: WorkflowNoticeInput) =>
  notifyRequester(input, permit => ({
    ok: permit.status === 'approved',
    kind: 'permit_approved',
    key: `permit-approved:${permit.id}:${permit.approved_at}`,
    title: `Permit approved: ${permit.permit_number}`,
    body: `${label(permit)} was approved${permit.approval_note ? `: ${permit.approval_note}` : '.'} It still has to be issued at the work before work starts.`
  }))

/** Sent back: the requester, with the reason. */
export const notifyPermitSentBack = async (input: WorkflowNoticeInput) =>
  notifyRequester(input, permit => ({
    ok: permit.status === 'draft' && Boolean(permit.rejected_at),
    kind: 'permit_sent_back',
    key: `permit-sent-back:${permit.id}:${permit.rejected_at}`,
    title: `Permit sent back: ${permit.permit_number}`,
    body: `${label(permit)} was sent back: ${permit.reject_reason || 'no reason given'}. Make the changes and send it again.`
  }))

/** Issued: the requester. */
export const notifyPermitIssued = async (input: WorkflowNoticeInput) =>
  notifyRequester(input, (permit, timeZone) => ({
    ok: permit.status === 'active',
    kind: 'permit_issued',
    key: `permit-issued:${permit.id}:${permit.issued_at}`,
    title: `Permit issued: ${permit.permit_number}`,
    body: `${label(permit)} is issued and work may start. It is valid until ${formatWhen(permit.valid_until, timeZone)}.`
  }))

/** Suspended: the requester and the approvers in scope, with the reason. */
export const notifyPermitSuspended = async ({ organizationId, permitId, actorUserId, gasFailed }: WorkflowNoticeInput & { gasFailed: boolean }) => {
  try {
    const permit = await loadPermitRow(organizationId, permitId)

    if (!permit || permit.status !== 'suspended') return 0

    const requester = requesterOf(permit)
    const approvers = await permitApproversAt(organizationId, permit.location_id)
    const recipients = [...new Set([requester, ...approvers].filter(Boolean) as string[])].filter(userId => userId !== actorUserId)
    const urgent = gasFailed && permit.permit_type === 'confined_space'

    const title = gasFailed ? `Gas test failed, work stopped: ${permit.permit_number}` : `Permit suspended: ${permit.permit_number}`

    const body = urgent
      ? `${label(permit)} is suspended. ${permit.suspend_reason}. Get everyone out of the space. Ventilate and test again before anyone re-enters.`
      : gasFailed
        ? `${label(permit)} is suspended. ${permit.suspend_reason}. Stop the hot work, ventilate and test again.`
        : `${label(permit)} is suspended: ${permit.suspend_reason}. Work must stop until it is resumed.`

    return (
      await queueNotices(
        organizationId,
        permit.id,
        recipients.map(userId => ({
          userId,
          kind: gasFailed ? 'permit_gas_failed' : 'permit_suspended',
          dedupeKey: `permit-suspended:${permit.id}:${permit.suspended_at}:${userId}`,
          title,
          body,
          link: link(permit)
        })),
        actorUserId
      )
    ).length
  } catch (error) {
    console.error('[permits] suspended notice', permitId, (error as Error).message)

    return 0
  }
}

// ---------------------------------------------------------------------------
// Scheduled notices
// ---------------------------------------------------------------------------

export type PermitNoticeKind = 'expiring' | 'expired' | 'fire_watch_done' | 'gas_retest_due'

type Due = { permit: any; kind: PermitNoticeKind; windowKey: string; title: string; body: string }

const EXPIRING_MINUTES = 60

/** What each open permit is due a notice for right now. */
export const permitNoticesDue = (
  permits: any[],
  { settings, timeZone, inside, latestTests, now }: { settings: PermitSettings; timeZone: string; inside: Map<string, number>; latestTests: Map<string, { id: string; tested_at: string } | null>; now: Date }
): Due[] => {
  const due: Due[] = []
  const at = now.getTime()

  for (const permit of permits) {
    const until = new Date(permit.valid_until).getTime()
    const when = formatWhen(permit.valid_until, timeZone)

    if (until <= at) {
      due.push({
        permit,
        kind: 'expired',
        windowKey: new Date(permit.valid_until).toISOString(),
        title: `Permit expired but still open: ${permit.permit_number}`,
        body: `${label(permit)} expired at ${when}. Stop the work and close the permit, or raise a new one.`
      })
    } else if (until - at <= EXPIRING_MINUTES * 60_000) {
      due.push({
        permit,
        kind: 'expiring',
        windowKey: new Date(permit.valid_until).toISOString(),
        title: `Permit ends within the hour: ${permit.permit_number}`,
        body: `${label(permit)} is valid until ${when}. Finish and close it, or raise a new permit to carry on.`
      })
    }

    if (permit.permit_type === 'hot_work' && permit.work_completed_at && ['active', 'suspended'].includes(permit.status)) {
      const end = new Date(permit.work_completed_at).getTime() + settings.fire_watch_minutes * 60_000

      if (end <= at) {
        due.push({
          permit,
          kind: 'fire_watch_done',
          windowKey: new Date(permit.work_completed_at).toISOString(),
          title: `Fire watch finished: ${permit.permit_number}`,
          body: `The ${settings.fire_watch_minutes}-minute fire watch on ${label(permit)} ended at ${formatWhen(new Date(end), timeZone)}. Check the area and close the permit.`
        })
      }
    }

    if (permit.permit_type === 'confined_space' && (inside.get(permit.id) || 0) > 0) {
      const latest = latestTests.get(permit.id) || null
      const stale = !latest || new Date(latest.tested_at).getTime() < at - settings.gas_test_valid_minutes * 60_000

      if (stale) {
        const count = inside.get(permit.id) || 0

        due.push({
          permit,
          kind: 'gas_retest_due',
          windowKey: latest ? latest.id : 'none',
          title: `Gas test due: ${permit.permit_number}`,
          body: `${count === 1 ? '1 person is' : `${count} people are`} inside the space on ${label(permit)} and the last gas test is more than ${settings.gas_test_valid_minutes} minutes old. Test the atmosphere again now.`
        })
      }
    }
  }

  return due
}

/** Scheduled notices for one organization. */
export const queuePermitNotices = async (organizationId: string, now = new Date()) => {
  const supabase = db()

  const { data: permits, error } = await supabase
    .from('forge_permits')
    .select(PERMIT_COLUMNS)
    .eq('organization_id', organizationId)
    .in('status', ['approved', 'active', 'suspended'])

  if (error) throw new Error('Unable to load open permits: ' + error.message)

  const open = (permits || []) as any[]

  if (!open.length) return { due: 0, sent: 0, queued: 0 }

  const [settings, timeZone] = await Promise.all([loadPermitSettings(organizationId), companyTimeZone(organizationId)])
  const spaceIds = open.filter(permit => permit.permit_type === 'confined_space' && permit.status !== 'approved').map(permit => permit.id)
  const inside = new Map<string, number>()
  const latestTests = new Map<string, { id: string; tested_at: string } | null>()

  if (spaceIds.length) {
    const { data: entries } = await supabase.from('forge_permit_entries').select('permit_id').eq('organization_id', organizationId).in('permit_id', spaceIds).is('exited_at', null)

    for (const row of (entries || []) as any[]) inside.set(row.permit_id, (inside.get(row.permit_id) || 0) + 1)

    const withPeople = [...inside.keys()]

    if (withPeople.length) {
      const { data: tests } = await supabase
        .from('forge_permit_gas_tests')
        .select('id, permit_id, tested_at')
        .eq('organization_id', organizationId)
        .in('permit_id', withPeople)
        .order('tested_at', { ascending: false })
        .order('id', { ascending: false })

      for (const row of (tests || []) as any[]) if (!latestTests.has(row.permit_id)) latestTests.set(row.permit_id, { id: row.id, tested_at: row.tested_at })
    }
  }

  const due = permitNoticesDue(open, { settings, timeZone, inside, latestTests, now })

  if (!due.length) return { due: 0, sent: 0, queued: 0 }

  const rightsCache = new Map<string, Awaited<ReturnType<typeof permitRights>>>()
  const approversByLocation = new Map<string, string[]>()
  let sent = 0
  let queued = 0
  const failures: string[] = []

  for (const item of due) {
    // Claim the notice first: one already logged (an earlier or parallel run) is skipped.
    const { data: claimed, error: claimError } = await supabase
      .from('forge_permit_notice_log')
      .upsert(
        { organization_id: organizationId, permit_id: item.permit.id, kind: item.kind, window_key: item.windowKey },
        { onConflict: 'permit_id,kind,window_key', ignoreDuplicates: true }
      )
      .select('id')

    if (claimError) {
      failures.push(claimError.message)
      continue
    }

    if (!claimed?.length) continue

    try {
      if (!approversByLocation.has(item.permit.location_id)) {
        approversByLocation.set(item.permit.location_id, await permitApproversAt(organizationId, item.permit.location_id, rightsCache))
      }

      const recipients = [...new Set([requesterOf(item.permit), ...(approversByLocation.get(item.permit.location_id) || [])].filter(Boolean) as string[])]

      const created = await queueNotices(
        organizationId,
        item.permit.id,
        recipients.map(userId => ({
          userId,
          kind: `permit_${item.kind}`,
          dedupeKey: `permit-${item.kind}:${item.permit.id}:${item.windowKey}:${userId}`,
          title: item.title,
          body: item.body,
          link: link(item.permit)
        })),
        null
      )

      sent += 1
      queued += created.length
    } catch (failure) {
      await supabase.from('forge_permit_notice_log').delete().eq('id', claimed[0].id)
      console.error('[permits] scheduled notice', item.permit.id, (failure as Error).message)
      failures.push((failure as Error).message)
    }
  }

  return { due: due.length, sent, queued, ...(failures.length ? { failures: failures.length } : {}) }
}

/** The scheduled job: every organization with open permits. */
export const runPermitCron = async ({ now = new Date() }: { now?: Date } = {}) => {
  const { data, error } = await db().from('forge_permits').select('organization_id').in('status', ['approved', 'active', 'suspended'])

  if (error) throw new Error('Unable to load permit organizations: ' + error.message)

  const organizationIds = [...new Set<string>((data || []).map((row: any) => row.organization_id))]
  const results = []

  for (const organizationId of organizationIds) {
    try {
      if (!(await isTenantFeatureAvailable({ organizationId, featureKey: 'work_permits' }))) {
        results.push({ organizationId, skipped: 'Work permits are not turned on.' })
        continue
      }

      results.push({ organizationId, ...(await queuePermitNotices(organizationId, now)) })
    } catch (failure) {
      console.error('[permits] cron', organizationId, (failure as Error).message)
      results.push({ organizationId, error: (failure as Error).message })
    }
  }

  return { checked: organizationIds.length, results }
}
