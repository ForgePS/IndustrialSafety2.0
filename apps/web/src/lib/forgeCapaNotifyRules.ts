/**
 * Port slice 8: Corrective Action (CAPA) notification rules. Pure functions with no imports so they can be
 * unit tested directly with `node --experimental-strip-types`.
 *
 * Neither 1.0 nor 2.0 notified on CAPAs. The timing follows the 2.0 training reminders
 * (forgeTrainingReportRules.assignmentReminder): a due-soon notice inside a 3-day window and an overdue notice
 * once the due date has passed, each sent once. Here "once" is per due date, so moving the due date earns a
 * fresh reminder. Dedupe keys are stored on the notification event payload (forgeCapaNotify.ts).
 */

export const CAPA_NOTIFY_SOURCE = 'corrective_actions'
export const CAPA_DUE_SOON_DAYS = 3
export const CAPA_TIME_ZONE = 'America/Chicago'
export const CAPA_REMINDER_STATUSES = ['open', 'in_progress']

export type CapaNoticeKind = 'assigned' | 'due_soon' | 'overdue' | 'needs_verification'

export type CapaReminderRow = {
  id: string
  organization_id: string
  action_number: string | null
  title: string | null
  status: string
  due_at: string | null
  assigned_user_id: string | null
  archived_at?: string | null
}

export type CapaNotice = {
  kind: CapaNoticeKind
  organizationId: string
  correctiveActionId: string
  userId: string
  dedupeKey: string
  title: string
  body: string
  linkPath: string
}

const DAY_MS = 86_400_000

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export const localDateIso = (iso: string | Date, timeZone = CAPA_TIME_ZONE) => {
  const date = typeof iso === 'string' ? new Date(iso) : iso
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Whole days from `fromIso` to `toIso` (dates only). */
export const daysBetweenIso = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso.slice(0, 10) + 'T00:00:00Z') - Date.parse(fromIso.slice(0, 10) + 'T00:00:00Z')) / DAY_MS)

const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`

export const capaLinkPath = (correctiveActionId: string) => '/corrective-actions/' + correctiveActionId

const label = (row: { action_number?: string | null; title?: string | null }) =>
  [row.action_number, row.title ? `"${row.title}"` : null].filter(Boolean).join(' ') || 'A Corrective Action'

export const capaDedupeKey = (kind: CapaNoticeKind, correctiveActionId: string, userId: string, marker: string) =>
  ['capa', kind, correctiveActionId, marker, userId].join(':')

export const CAPA_NOTICE_TEXT = {
  assigned: (row: CapaReminderRow) => ({
    title: 'Corrective Action assigned to you',
    body: `${label(row)} was assigned to you${row.due_at ? `, due ${usDate(localDateIso(row.due_at))}` : ''}. Open it to plan and complete the work.`
  }),
  due_soon: (row: CapaReminderRow, due: string) => ({
    title: 'Corrective Action due soon',
    body: `${label(row)} is due ${usDate(due)}. Complete the work and submit it for verification.`
  }),
  overdue: (row: CapaReminderRow, due: string) => ({
    title: 'Corrective Action overdue',
    body: `${label(row)} was due ${usDate(due)}. Complete the work and submit it for verification.`
  }),
  needs_verification: (row: CapaReminderRow) => ({
    title: 'Corrective Action needs verification',
    body: `${label(row)} was submitted for verification. Review the work and record whether it was effective.`
  })
}

/** Which reminder an open CAPA's assignee gets today, if any: overdue beats due soon. */
export const capaReminderKind = (row: Pick<CapaReminderRow, 'status' | 'due_at' | 'archived_at'>, todayIso: string, dueSoonDays = CAPA_DUE_SOON_DAYS, timeZone = CAPA_TIME_ZONE): 'due_soon' | 'overdue' | null => {
  if (!CAPA_REMINDER_STATUSES.includes(row.status) || !row.due_at || row.archived_at) return null

  const days = daysBetweenIso(todayIso, localDateIso(row.due_at, timeZone))

  if (days < 0) return 'overdue'
  if (dueSoonDays > 0 && days <= dueSoonDays) return 'due_soon'

  return null
}

/**
 * The due-soon and overdue notices due today for these CAPAs. Each is keyed by kind, CAPA, local due date and
 * recipient, so a reminder sends once per due date however often the sweep runs.
 */
export const capaRemindersDue = (rows: CapaReminderRow[], todayIso: string, { dueSoonDays = CAPA_DUE_SOON_DAYS, timeZone = CAPA_TIME_ZONE } = {}): CapaNotice[] => {
  const notices: CapaNotice[] = []

  for (const row of rows) {
    if (!row.assigned_user_id) continue

    const kind = capaReminderKind(row, todayIso, dueSoonDays, timeZone)

    if (!kind || !row.due_at) continue

    const due = localDateIso(row.due_at, timeZone)

    notices.push({
      kind,
      organizationId: row.organization_id,
      correctiveActionId: row.id,
      userId: row.assigned_user_id,
      dedupeKey: capaDedupeKey(kind, row.id, row.assigned_user_id, due),
      linkPath: capaLinkPath(row.id),
      ...CAPA_NOTICE_TEXT[kind](row, due)
    })
  }

  return notices
}

/**
 * "Assigned to you" for the CAPA's current assignee. Keyed by row version so a repeated call for the same save
 * sends once, while a later reassignment back to the same person sends again. Null when there is no assignee
 * with a login or the actor assigned it to themselves.
 */
export const capaAssignedNotice = (row: CapaReminderRow & { row_version?: number | null }, actorUserId: string | null): CapaNotice | null => {
  const userId = row.assigned_user_id

  if (!userId || userId === actorUserId || row.archived_at) return null
  if (!CAPA_REMINDER_STATUSES.includes(row.status)) return null

  return {
    kind: 'assigned',
    organizationId: row.organization_id,
    correctiveActionId: row.id,
    userId,
    dedupeKey: capaDedupeKey('assigned', row.id, userId, 'v' + String(row.row_version ?? 1)),
    linkPath: capaLinkPath(row.id),
    ...CAPA_NOTICE_TEXT.assigned(row)
  }
}

/**
 * "Needs verification" for each verifier. Keyed by the submission time (completed_at), so each submission
 * notifies once and a resubmission after a failed verification notifies again. The submitter is excluded.
 */
export const capaNeedsVerificationNotices = (
  row: CapaReminderRow & { completed_at?: string | null },
  verifierIds: string[],
  actorUserId: string | null
): CapaNotice[] => {
  if (row.status !== 'pending_verification' || row.archived_at) return []

  const marker = row.completed_at || 'submitted'

  return [...new Set(verifierIds)]
    .filter(userId => userId && userId !== actorUserId)
    .map(userId => ({
      kind: 'needs_verification' as const,
      organizationId: row.organization_id,
      correctiveActionId: row.id,
      userId,
      dedupeKey: capaDedupeKey('needs_verification', row.id, userId, marker),
      linkPath: capaLinkPath(row.id),
      ...CAPA_NOTICE_TEXT.needs_verification(row)
    }))
}
