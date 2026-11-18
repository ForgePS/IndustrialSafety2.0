import { daysUntil, reviewState } from './forgeDocumentRules.ts'

/**
 * Port slice 12: pure rules for Document Control notices (who is told, what it says, review reminder keys).
 * The sending lives in forgeDocumentNotify.ts.
 */

export type NoticeDocument = {
  id: string
  document_number: string
  name: string
  status: string
  archived_at: string | null
  review_due_on: string | null
  owner_user_id?: string | null
}

export type NoticeVersion = { id: string; version_number: number; submitted_by: string | null }

export const documentPath = (documentId: string) => '/documents/' + documentId

const label = (doc: Pick<NoticeDocument, 'document_number' | 'name'>) => `${doc.document_number} ${doc.name}`.trim()

/** mm/dd/yyyy for notice text. */
export const noticeDate = (iso: string) => {
  const [year, month, day] = iso.slice(0, 10).split('-')

  return `${month}/${day}/${year}`
}

const unique = (ids: (string | null | undefined)[]) => [...new Set(ids.filter((id): id is string => Boolean(id)))]

/** Approvers to tell about a submitted version: never the person who submitted it. */
export const submittedRecipients = (approverIds: string[], submitterId: string | null) => unique(approverIds).filter(id => id !== submitterId)

/**
 * Who hears about an approval. The submitter is told it was approved (unless they approved it themselves); when
 * the document needs acknowledging, the rest of the audience gets "New document to read" (not the approver,
 * who just read it, and not the submitter, whose approval notice asks them to read it).
 */
export const approvalRecipients = ({
  submitterId,
  approverId,
  audienceIds,
  requiresAcknowledgment
}: {
  submitterId: string | null
  approverId: string
  audienceIds: string[]
  requiresAcknowledgment: boolean
}) => {
  const submitter = submitterId && submitterId !== approverId ? submitterId : null
  const audience = unique(audienceIds)
  const toRead = requiresAcknowledgment ? audience.filter(id => id !== approverId && id !== submitter) : []

  return { submitter, submitterReads: Boolean(submitter && requiresAcknowledgment && audience.includes(submitter)), toRead }
}

export type NoticeText = { title: string; body: string; link: string }

export const submittedNotice = (doc: NoticeDocument, version: NoticeVersion, submitterName: string | null): NoticeText => ({
  title: `Document to approve: ${doc.name}`,
  body: `Version ${version.version_number} of ${label(doc)} was submitted for review${submitterName ? ' by ' + submitterName : ''}. Open it to approve it or send it back.`,
  link: documentPath(doc.id)
})

export const sentBackNotice = (doc: NoticeDocument, version: NoticeVersion, reason: string): NoticeText => ({
  title: `Document sent back: ${doc.name}`,
  body: `Version ${version.version_number} of ${label(doc)} was sent back. Reason: ${reason.trim()}`,
  link: documentPath(doc.id)
})

export const approvedNotice = (doc: NoticeDocument, version: NoticeVersion, effectiveOn: string, askToRead: boolean): NoticeText => ({
  title: `Document approved: ${doc.name}`,
  body:
    `Version ${version.version_number} of ${label(doc)} was approved and published, effective ${noticeDate(effectiveOn)}.` +
    (askToRead ? ' Please read it and acknowledge it.' : ''),
  link: documentPath(doc.id)
})

export const toReadNotice = (doc: NoticeDocument, version: NoticeVersion): NoticeText => ({
  title: `New document to read: ${doc.name}`,
  body: `Version ${version.version_number} of ${label(doc)} was published. Please read it and acknowledge it.`,
  link: '/documents/acknowledgments'
})

// ---------------------------------------------------------------------------
// Review reminders
// ---------------------------------------------------------------------------

export type ReviewNoticeKind = 'review_due_soon' | 'review_overdue'

export type ReviewNotice = NoticeText & { kind: ReviewNoticeKind; noticeKey: string; dueOn: string; days: number }

/**
 * The review reminder a published document needs today, or null. Keyed by kind and review date, so each
 * document is reminded once when it comes due soon and once when it becomes overdue, and again after the
 * review date moves.
 */
export const reviewNoticeFor = (doc: NoticeDocument, warningDays: number, now = new Date()): ReviewNotice | null => {
  if (doc.status !== 'published' || doc.archived_at || !doc.review_due_on) return null

  const state = reviewState(doc.review_due_on, warningDays, now)

  if (state !== 'due_soon' && state !== 'overdue') return null

  const dueOn = doc.review_due_on.slice(0, 10)
  const days = daysUntil(dueOn, now) as number
  const kind: ReviewNoticeKind = state === 'overdue' ? 'review_overdue' : 'review_due_soon'
  const when = days < 0 ? `was due ${noticeDate(dueOn)} (${-days} day${days === -1 ? '' : 's'} overdue)` : days === 0 ? 'is due today' : `is due ${noticeDate(dueOn)} (in ${days} day${days === 1 ? '' : 's'})`

  return {
    kind,
    noticeKey: `${kind}:${dueOn}`,
    dueOn,
    days,
    title: kind === 'review_overdue' ? `Document review overdue: ${doc.name}` : `Document review due soon: ${doc.name}`,
    body: `The periodic review of ${label(doc)} ${when}. Confirm the review or upload a new version.`,
    link: documentPath(doc.id)
  }
}

/** Review reminders go to the document owner and the managers whose scope covers it (active members only). */
export const reviewRecipients = (ownerId: string | null | undefined, managerIds: string[], activeMemberIds: Set<string>) =>
  unique([ownerId, ...managerIds]).filter(id => activeMemberIds.has(id))
