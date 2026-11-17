import { createServiceRoleClient } from '@repo/supabase/server'

import { loadFormSubmission } from '@/lib/forgeFormAccess'
import { missingDirectorSignatures } from '@/lib/forgeFormRules'
import { getSignRequest, signLinkPath } from '@/lib/forgeFormSignRequests'
import { membersHoldingFormPermission } from '@/lib/forgeFormSigning'

/**
 * Port slice 9: form signature notices through the shared notification service (forge_notification_events
 * plus an in-app delivery and a pending email delivery that the outbox drain sends), same shape as
 * forgeCapaNotify.ts.
 *
 * - notifyFormPendingSignature: 1.0 notifySafetyDirectorsOfPendingSignature. When a saved submission still
 *   misses an EHS Director signature, every active member holding forms.sign_director whose scope covers the
 *   submission is told (except the person who saved it). Deduped per recipient, submission and missing-field
 *   set, so re-saving does not repeat it.
 * - notifyFormSignRequest: tells the user a sign link was issued to (only when it went to a user). The in-app
 *   notice links to the submission; the email carries the sign link itself. That means the raw token is kept
 *   in the email delivery row (service role only) until the outbox sends it.
 *
 * Neither function throws: a notice problem must never fail the save or the signature.
 */

const SOURCE = 'forms'

type Notice = {
  organizationId: string
  submissionId: string
  userId: string
  kind: 'pending_director_signature' | 'sign_request'
  dedupeKey: string
  title: string
  body: string
  inAppLink: string
  emailLink: string
}

const db = () => createServiceRoleClient() as any

const activeMemberIds = async (organizationId: string, userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))]

  if (!ids.length) return new Set<string>()

  const { data, error } = await db()
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('user_id', ids)

  if (error) throw new Error('Unable to load organization members: ' + error.message)

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

const queueNotices = async (notices: Notice[], actorUserId: string | null) => {
  if (!notices.length) return 0

  const supabase = db()
  const members = await activeMemberIds(notices[0].organizationId, notices.map(notice => notice.userId))
  let queued = 0

  for (const notice of notices) {
    if (!members.has(notice.userId)) continue

    const { data: existing } = await supabase
      .from('forge_notification_events')
      .select('id')
      .eq('source_module', SOURCE)
      .eq('payload->>dedupe_key', notice.dedupeKey)
      .limit(1)

    if (existing?.length) continue

    const { data: event, error: eventError } = await supabase
      .from('forge_notification_events')
      .insert({
        organization_id: notice.organizationId,
        source_module: SOURCE,
        event_type: notice.kind,
        visibility: 'customer',
        resource_type: 'form_submission',
        resource_id: notice.submissionId,
        actor_user_id: actorUserId,
        title: notice.title.slice(0, 200),
        body: notice.body.slice(0, 2000),
        payload: { kind: notice.kind, dedupe_key: notice.dedupeKey, recipient_user_id: notice.userId }
      })
      .select('id')
      .single()

    if (eventError || !event) throw new Error('Unable to queue form notice: ' + (eventError?.message || 'no event'))

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
        organization_id: notice.organizationId,
        recipient_user_id: notice.userId,
        recipient_audience: 'customer',
        channel,
        status: channel === 'in_app' ? 'sent' : 'pending',
        title: notice.title.slice(0, 200),
        body: notice.body.slice(0, 2000),
        link_path: channel === 'in_app' ? notice.inAppLink : notice.emailLink,
        sent_at: channel === 'in_app' ? now : null
      }))
    )

    if (deliveryError) {
      await supabase.from('forge_notification_events').delete().eq('id', event.id)
      throw new Error('Unable to queue form notice deliveries: ' + deliveryError.message)
    }

    queued += 1
  }

  return queued
}

const submissionPath = (submissionId: string) => '/forms/submissions/' + submissionId

/**
 * Tells the Safety / EHS Directors that a submission is waiting for their signature. Call after saving a
 * submission (any status; only pending_signature with a missing EHS Director signature sends anything).
 */
export const notifyFormPendingSignature = async ({
  organizationId,
  submissionId,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  actorUserId: string | null
}): Promise<void> => {
  try {
    const loaded = await loadFormSubmission({ organizationId, submissionId })

    if (!loaded || loaded.submission.status !== 'pending_signature' || loaded.submission.archived_at) return

    const answers = loaded.submission.answers && typeof loaded.submission.answers === 'object' ? loaded.submission.answers : {}
    const missing = missingDirectorSignatures(loaded.version.schema.fields, answers)

    if (!missing.length) return

    const recipients = (await membersHoldingFormPermission({ organizationId, permissionKey: 'forms.sign_director', submission: loaded.submission })).filter(
      userId => userId !== actorUserId
    )

    if (!recipients.length) return

    const fieldKey = missing
      .map(field => field.id)
      .sort()
      .join(',')

    const labels = missing.map(field => field.label).join(', ')
    const number = loaded.submission.submission_number
    const title = loaded.submission.title || loaded.version.title

    await queueNotices(
      recipients.map(userId => ({
        organizationId,
        submissionId,
        userId,
        kind: 'pending_director_signature' as const,
        dedupeKey: `form-director:${submissionId}:${fieldKey}:${userId}`,
        title: `EHS Director signature needed: ${title}`,
        body: `${number} (${title}) is waiting for your signature: ${labels}.`,
        inAppLink: submissionPath(submissionId),
        emailLink: submissionPath(submissionId)
      })),
      actorUserId
    )
  } catch (error) {
    console.error('[forms] pending signature notice', submissionId, (error as Error).message)
  }
}

/**
 * Tells the user a sign link was issued to. Call right after issueFormSignRequest with the raw token it
 * returned. Requests to personnel without a login send nothing (the issuer copies the link instead).
 */
export const notifyFormSignRequest = async ({
  organizationId,
  submissionId,
  requestId,
  rawToken,
  actorUserId
}: {
  organizationId: string
  submissionId: string
  requestId: string
  rawToken: string
  actorUserId: string | null
}): Promise<{ notified: boolean }> => {
  try {
    const [request, loaded] = await Promise.all([getSignRequest(requestId), loadFormSubmission({ organizationId, submissionId })])

    if (!request || !loaded || request.organization_id !== organizationId || request.submission_id !== submissionId || !request.requested_for_user_id) {
      return { notified: false }
    }

    const field = loaded.version.schema.fields.find(item => item.id === request.field_id)
    const label = field?.label || 'Signature'
    const number = loaded.submission.submission_number
    const title = loaded.submission.title || loaded.version.title

    const queued = await queueNotices(
      [
        {
          organizationId,
          submissionId,
          userId: request.requested_for_user_id,
          kind: 'sign_request',
          dedupeKey: `form-sign-request:${request.id}`,
          title: `Please sign: ${title}`,
          body: `You have been asked to sign "${label}" on ${number} (${title}). The link expires ${request.expires_at.slice(0, 10)}.`,
          inAppLink: submissionPath(submissionId),
          emailLink: signLinkPath(rawToken)
        }
      ],
      actorUserId
    )

    return { notified: queued > 0 }
  } catch (error) {
    console.error('[forms] sign request notice', submissionId, (error as Error).message)

    return { notified: false }
  }
}
