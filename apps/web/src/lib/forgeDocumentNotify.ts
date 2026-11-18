import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { isTenantFeatureAvailable } from '@/lib/forgeFeatureAvailability'
import { documentAudience, documentWithinScope, loadDocument, loadDocumentSettings, VERSION_COLUMNS, type DocumentScopeRow } from '@/lib/forgeDocumentAccess'
import {
  approvalRecipients,
  approvedNotice,
  reviewNoticeFor,
  reviewRecipients,
  sentBackNotice,
  submittedNotice,
  submittedRecipients,
  toReadNotice,
  type NoticeText
} from '@/lib/forgeDocumentNotifyRules'
import { todayIso } from '@/lib/forgeDocumentRules'

/**
 * Port slice 12: Document Control notices through the shared notification service (forge_notification_events
 * plus an in-app delivery and a pending email delivery that the outbox drain at /api/helpdesk/cron sends), same
 * shape as forgeFormNotify.ts. 1.0 told nobody anything.
 *
 * - Version submitted: the approvers whose scope covers the document (never the submitter).
 * - Version sent back: the submitter, with the reason.
 * - Version approved: the submitter, plus everyone the document is distributed to when it needs acknowledging.
 * - Review reminders (runDocumentCron): the owner and the managers in scope, once per document, review date and
 *   kind (forge_document_notice_log).
 *
 * The workflow notices never throw: a notice problem must never fail the approval.
 */

const SOURCE = 'documents'

const db = () => createServiceRoleClient() as any

type Notice = NoticeText & { userId: string; kind: string; dedupeKey: string }

const activeMemberIds = async (organizationId: string, userIds?: string[]) => {
  if (userIds && !userIds.length) return new Set<string>()

  let query = db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)

  if (userIds) query = query.in('user_id', [...new Set(userIds)])

  const { data, error } = await query

  if (error) throw new Error('Unable to load organization members: ' + error.message)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

/** Queues each notice once (deduped on payload.dedupe_key). Returns the ids of the events created. */
const queueNotices = async (organizationId: string, documentId: string, notices: Notice[], actorUserId: string | null) => {
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
        resource_type: 'document',
        resource_id: documentId,
        actor_user_id: actorUserId,
        title: notice.title.slice(0, 200),
        body: notice.body.slice(0, 2000),
        payload: { kind: notice.kind, dedupe_key: notice.dedupeKey, recipient_user_id: notice.userId }
      })
      .select('id')
      .single()

    if (eventError || !event) throw new Error('Unable to queue document notice: ' + (eventError?.message || 'no event'))

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
      throw new Error('Unable to queue document notice deliveries: ' + deliveryError.message)
    }

    created.push(event.id)
  }

  return created
}

/** Members holding a role grant or allow override for one of the keys (prefilter; access is checked after). */
const permissionCandidates = async (organizationId: string, permissionKeys: string[]) => {
  const supabase = db()
  const { data: permissions } = await supabase.from('forge_permission_registry').select('id').in('permission_key', permissionKeys)
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

  const ids = [...new Set<string>([...(roleUsers || []), ...(overrides || [])].map((row: any) => row.user_id))]

  return [...(await activeMemberIds(organizationId, ids))]
}

type Holder = { userId: string; scope: string | null }

/** Active members who hold the permission, with their scope. */
export const documentPermissionHolders = async (organizationId: string, permissionKey: string): Promise<Holder[]> => {
  const candidates = await permissionCandidates(organizationId, [permissionKey])

  const holders = await Promise.all(
    candidates.map(async userId => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })
      const grant = access.effective.find(item => item.permissionKey === permissionKey && item.allowed)

      return grant ? { userId, scope: grant.scope ?? 'organization' } : null
    })
  )

  return holders.filter(Boolean) as Holder[]
}

/** The holders whose scope covers the document. */
const holdersCovering = async (organizationId: string, holders: Holder[], doc: DocumentScopeRow) => {
  const checked = await Promise.all(
    holders.map(async holder => ((await documentWithinScope({ organizationId, userId: holder.userId, scope: holder.scope, doc })) ? holder.userId : null))
  )

  return checked.filter((userId): userId is string => Boolean(userId))
}

const loadVersion = async (organizationId: string, versionId: string) => {
  const { data } = await db().from('forge_document_versions').select(VERSION_COLUMNS).eq('organization_id', organizationId).eq('id', versionId).maybeSingle()

  return data as any | null
}

const userName = async (userId: string | null) => {
  if (!userId) return null

  const { data } = await db().from('users').select('name, email').eq('user_id', userId).maybeSingle()

  return (data?.name || data?.email || null) as string | null
}

type WorkflowNoticeInput = { organizationId: string; documentId: string; versionId: string; actorUserId: string }

/** Version submitted for review: tells the approvers in scope (not the submitter). */
export const notifyVersionSubmitted = async ({ organizationId, documentId, versionId, actorUserId }: WorkflowNoticeInput) => {
  try {
    const [doc, version] = await Promise.all([loadDocument(organizationId, documentId), loadVersion(organizationId, versionId)])

    if (!doc || !version || version.document_id !== doc.id || version.status !== 'in_review') return 0

    const approvers = await holdersCovering(organizationId, await documentPermissionHolders(organizationId, 'documents.approve'), doc)
    const recipients = submittedRecipients(approvers, version.submitted_by)
    const text = submittedNotice(doc, version, await userName(version.submitted_by))

    const created = await queueNotices(
      organizationId,
      doc.id,
      recipients.map(userId => ({ ...text, userId, kind: 'version_submitted', dedupeKey: `doc-submitted:${version.id}:${version.submitted_at}:${userId}` })),
      actorUserId
    )

    return created.length
  } catch (error) {
    console.error('[documents] submitted notice', versionId, (error as Error).message)

    return 0
  }
}

/** Version sent back: tells the submitter, with the reason. */
export const notifyVersionSentBack = async ({ organizationId, documentId, versionId, actorUserId }: WorkflowNoticeInput) => {
  try {
    const [doc, version] = await Promise.all([loadDocument(organizationId, documentId), loadVersion(organizationId, versionId)])

    if (!doc || !version || version.document_id !== doc.id || !version.rejected_at || !version.submitted_by || version.submitted_by === actorUserId) return 0

    const text = sentBackNotice(doc, version, version.rejection_reason || '')

    const created = await queueNotices(
      organizationId,
      doc.id,
      [{ ...text, userId: version.submitted_by, kind: 'version_sent_back', dedupeKey: `doc-sent-back:${version.id}:${version.rejected_at}` }],
      actorUserId
    )

    return created.length
  } catch (error) {
    console.error('[documents] sent back notice', versionId, (error as Error).message)

    return 0
  }
}

/** Version approved: tells the submitter, and the audience when the document needs acknowledging. */
export const notifyVersionApproved = async ({ organizationId, documentId, versionId, actorUserId }: WorkflowNoticeInput) => {
  try {
    const [doc, version] = await Promise.all([loadDocument(organizationId, documentId), loadVersion(organizationId, versionId)])

    if (!doc || !version || version.document_id !== doc.id || version.status !== 'approved') return 0

    const audience = doc.requires_acknowledgment ? (await documentAudience(organizationId, doc.id)).map(person => person.userId) : []

    const plan = approvalRecipients({
      submitterId: version.submitted_by,
      approverId: actorUserId,
      audienceIds: audience,
      requiresAcknowledgment: Boolean(doc.requires_acknowledgment)
    })

    const notices: Notice[] = []

    if (plan.submitter) {
      notices.push({
        ...approvedNotice(doc, version, version.effective_on || todayIso(), plan.submitterReads),
        userId: plan.submitter,
        kind: 'version_approved',
        dedupeKey: `doc-approved:${version.id}`
      })
    }

    const toRead = toReadNotice(doc, version)

    for (const userId of plan.toRead) notices.push({ ...toRead, userId, kind: 'document_to_read', dedupeKey: `doc-to-read:${version.id}:${userId}` })

    return (await queueNotices(organizationId, doc.id, notices, actorUserId)).length
  } catch (error) {
    console.error('[documents] approved notice', versionId, (error as Error).message)

    return 0
  }
}

// ---------------------------------------------------------------------------
// Review reminders
// ---------------------------------------------------------------------------

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/** Review reminders for one organization. */
export const queueDocumentReviewReminders = async (organizationId: string, now = new Date()) => {
  const supabase = db()
  const settings = await loadDocumentSettings(organizationId)
  const warningDays = settings.review_warning_days

  const { data: docs, error } = await supabase
    .from('forge_documents')
    .select('id, organization_id, document_number, name, status, archived_at, review_due_on, owner_user_id, created_by, location_id')
    .eq('organization_id', organizationId)
    .eq('status', 'published')
    .is('archived_at', null)
    .not('review_due_on', 'is', null)
    .lte('review_due_on', addDays(todayIso(now), warningDays))

  if (error) throw new Error('Unable to load documents due for review: ' + error.message)

  const due = ((docs || []) as any[]).map(doc => ({ doc, notice: reviewNoticeFor(doc, warningDays, now) })).filter(item => item.notice)

  if (!due.length) return { due: 0, reminded: 0, queued: 0 }

  const [managers, members] = await Promise.all([documentPermissionHolders(organizationId, 'documents.manage'), activeMemberIds(organizationId)])
  let reminded = 0
  let queued = 0
  const failures: string[] = []

  for (const { doc, notice } of due) {
    if (!notice) continue

    // Claim the reminder first: one that is already logged (an earlier or parallel run) is skipped.
    const { data: claimed, error: claimError } = await supabase
      .from('forge_document_notice_log')
      .upsert({ organization_id: organizationId, document_id: doc.id, notice_key: notice.noticeKey }, { onConflict: 'document_id,notice_key', ignoreDuplicates: true })
      .select('id')

    if (claimError) {
      failures.push(claimError.message)
      continue
    }

    if (!claimed?.length) continue

    const logId = claimed[0].id

    try {
      const recipients = reviewRecipients(doc.owner_user_id, await holdersCovering(organizationId, managers, doc), members)

      const created = await queueNotices(
        organizationId,
        doc.id,
        recipients.map(userId => ({
          title: notice.title,
          body: notice.body,
          link: notice.link,
          userId,
          kind: notice.kind,
          dedupeKey: `doc-review:${doc.id}:${notice.noticeKey}:${userId}`
        })),
        null
      )

      await supabase
        .from('forge_document_notice_log')
        .update({ event_id: created[0] || null })
        .eq('id', logId)
      reminded += 1
      queued += created.length
    } catch (failure) {
      await supabase.from('forge_document_notice_log').delete().eq('id', logId)
      console.error('[documents] review reminder', doc.id, (failure as Error).message)
      failures.push((failure as Error).message)
    }
  }

  return { due: due.length, reminded, queued, ...(failures.length ? { failures: failures.length } : {}) }
}

/** The scheduled job: every organization with published documents that have a review date. */
export const runDocumentCron = async ({ now = new Date() }: { now?: Date } = {}) => {
  const { data, error } = await db().from('forge_documents').select('organization_id').eq('status', 'published').is('archived_at', null).not('review_due_on', 'is', null)

  if (error) throw new Error('Unable to load document organizations: ' + error.message)

  const organizationIds = [...new Set<string>((data || []).map((row: any) => row.organization_id))]
  const results = []

  for (const organizationId of organizationIds) {
    try {
      if (!(await isTenantFeatureAvailable({ organizationId, featureKey: 'document_control' }))) {
        results.push({ organizationId, skipped: 'Document Control is not turned on.' })
        continue
      }

      results.push({ organizationId, ...(await queueDocumentReviewReminders(organizationId, now)) })
    } catch (failure) {
      console.error('[documents] cron', organizationId, (failure as Error).message)
      results.push({ organizationId, error: (failure as Error).message })
    }
  }

  return { checked: organizationIds.length, results }
}
