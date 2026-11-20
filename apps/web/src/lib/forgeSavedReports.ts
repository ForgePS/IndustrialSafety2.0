import { createServiceRoleClient } from '@repo/supabase/server'

import { isTenantFeatureAvailable } from '@/lib/forgeFeatureAvailability'
import { fetchAllRows, inChunks } from '@/lib/forgeFetchAll'
import { getReportDefinition } from '@/lib/forgeReportCatalog'
import { can, reportAccessFor, runReport, todayIso, type ReportAccess } from '@/lib/forgeReportRun'
import { describeSchedule, nextScheduleRun, type ScheduleTiming } from '@/lib/forgeReportRules'

/**
 * Port slice 13: saved reports and their schedules.
 *
 * - A saved report belongs to its owner. Private ones are theirs alone; shared ones (reporting.share) are listed
 *   for everyone in the company, but each viewer still runs them with their own permissions, and only sees them
 *   at all when they can run the underlying report.
 * - A schedule belongs to its saved report's owner (reporting.schedule). Recipients are company members. Each
 *   run is made for each recipient with that recipient's permissions; someone who can't run the report is
 *   skipped, never sent the owner's view. Sending to anyone but the owner needs the report shared.
 * - Delivery is an in-app notice and an email with a link to the saved report, through the shared notification
 *   outbox (like Document Control). No files are attached or stored.
 */

const db = () => createServiceRoleClient() as any

export const MAX_RECIPIENTS = 25

export type SavedReport = {
  id: string
  organization_id: string
  owner_user_id: string
  report_key: string
  name: string
  description: string | null
  params: Record<string, unknown>
  visibility: 'private' | 'organization'
  created_at: string
  updated_at: string
  ownerName?: string | null
}

export type ReportSchedule = ScheduleTiming & {
  id: string
  saved_report_id: string
  created_by: string
  enabled: boolean
  next_run_at: string
  last_run_at: string | null
  last_status: 'sent' | 'skipped' | 'failed' | null
  last_error: string | null
  recipients: string[]
}

const SAVED_COLUMNS = 'id, organization_id, owner_user_id, report_key, name, description, params, visibility, created_at, updated_at'

const userNames = async (userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))]

  if (!ids.length) return new Map<string, string>()

  // In chunks: one big .in() list would be a very long URL and is capped at 1,000 rows.
  const pages = await Promise.all(inChunks(ids).map(chunk => db().from('users').select('user_id, name, email').in('user_id', chunk)))

  return new Map<string, string>(pages.flatMap(({ data }: any) => (data || []).map((row: any) => [row.user_id, row.name || row.email || 'Unknown'] as [string, string])))
}

/** Saved reports this person can open: their own, plus shared ones whose report they can run. */
export const listSavedReports = async (organizationId: string, userId: string, access: ReportAccess) => {
  const { data, error } = await db()
    .from('forge_saved_reports')
    .select(SAVED_COLUMNS)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .or(`owner_user_id.eq.${userId},visibility.eq.organization`)
    .order('name')

  if (error) throw new Error('Unable to load saved reports: ' + error.message)

  const rows = ((data || []) as SavedReport[]).filter(row => {
    const report = getReportDefinition(row.report_key)

    return report && can(access, 'reporting.view') && can(access, report.permission)
  })

  const names = await userNames(rows.map(row => row.owner_user_id))

  return rows.map(row => ({ ...row, ownerName: names.get(row.owner_user_id) || null }))
}

/** One saved report, when this person may open it (owner, or shared and they can run the report). */
export const loadSavedReport = async (organizationId: string, userId: string, id: string, access: ReportAccess) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null

  const { data } = await db().from('forge_saved_reports').select(SAVED_COLUMNS).eq('organization_id', organizationId).eq('id', id).is('archived_at', null).maybeSingle()
  const row = data as SavedReport | null

  if (!row) return null
  if (row.owner_user_id !== userId && row.visibility !== 'organization') return null

  const report = getReportDefinition(row.report_key)

  if (!report || !can(access, 'reporting.view') || !can(access, report.permission)) return null

  const names = await userNames([row.owner_user_id])

  return { ...row, ownerName: names.get(row.owner_user_id) || null }
}

export const loadSchedule = async (organizationId: string, savedReportId: string): Promise<ReportSchedule | null> => {
  const { data } = await db()
    .from('forge_report_schedules')
    .select('*, forge_report_schedule_recipients(user_id)')
    .eq('organization_id', organizationId)
    .eq('saved_report_id', savedReportId)
    .maybeSingle()

  if (!data) return null

  return { ...data, recipients: (data.forge_report_schedule_recipients || []).map((row: any) => row.user_id) } as ReportSchedule
}

/** Active company members (all of them, past the API row cap), for the recipient picker and alert audiences. */
export const companyMembers = async (organizationId: string) => {
  const data = await fetchAllRows(
    () => db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true).order('user_id'),
    'Unable to load company members'
  )

  const ids: string[] = data.map((row: any) => row.user_id as string)
  const names = await userNames(ids)

  return ids.map(id => ({ id, name: names.get(id) || 'Unknown' })).sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
}

export const activeMemberIds = async (organizationId: string, userIds: string[]) => {
  if (!userIds.length) return new Set<string>()

  const { data } = await db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true).in('user_id', [...new Set(userIds)])

  return new Set<string>((data || []).map((row: any) => row.user_id))
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

const SOURCE = 'reporting'

/** Queues one in-app and one email delivery for a recipient, once per schedule, run time and recipient. */
const queueDelivery = async ({
  organizationId,
  scheduleId,
  savedReportId,
  userId,
  title,
  body,
  dedupeKey
}: {
  organizationId: string
  scheduleId: string
  savedReportId: string
  userId: string
  title: string
  body: string
  dedupeKey: string
}) => {
  const supabase = db()
  const { data: existing } = await supabase.from('forge_notification_events').select('id').eq('source_module', SOURCE).eq('payload->>dedupe_key', dedupeKey).limit(1)

  if (existing?.length) return false

  const { data: event, error } = await supabase
    .from('forge_notification_events')
    .insert({
      organization_id: organizationId,
      source_module: SOURCE,
      event_type: 'scheduled_report',
      visibility: 'customer',
      resource_type: 'saved_report',
      resource_id: savedReportId,
      actor_user_id: null,
      title: title.slice(0, 200),
      body: body.slice(0, 2000),
      payload: { kind: 'scheduled_report', dedupe_key: dedupeKey, recipient_user_id: userId, schedule_id: scheduleId }
    })
    .select('id')
    .single()

  if (error || !event) throw new Error('Unable to queue the report notice: ' + (error?.message || 'no event'))

  const now = new Date().toISOString()
  const link = '/reporting/saved/' + savedReportId

  const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(
    (['in_app', 'email'] as const).map(channel => ({
      event_id: event.id,
      organization_id: organizationId,
      recipient_user_id: userId,
      recipient_audience: 'customer',
      channel,
      status: channel === 'in_app' ? 'sent' : 'pending',
      title: title.slice(0, 200),
      body: body.slice(0, 2000),
      link_path: link,
      sent_at: channel === 'in_app' ? now : null
    }))
  )

  if (deliveryError) {
    await supabase.from('forge_notification_events').delete().eq('id', event.id)
    throw new Error('Unable to queue the report deliveries: ' + deliveryError.message)
  }

  return true
}

export type ScheduleRunOutcome = { scheduleId: string; status: 'sent' | 'skipped' | 'failed'; sent: number; skipped: number; error?: string }

/**
 * Sends one schedule for the run time it was due at. Recipients who can't run the report (or can't open a
 * private one) are skipped. Exported for the cron job and the tests.
 */
export const deliverSchedule = async (schedule: any, dueAt: Date, today = todayIso()): Promise<ScheduleRunOutcome> => {
  const organizationId = schedule.organization_id as string
  const { data: saved } = await db().from('forge_saved_reports').select(SAVED_COLUMNS).eq('id', schedule.saved_report_id).is('archived_at', null).maybeSingle()

  if (!saved) return { scheduleId: schedule.id, status: 'skipped', sent: 0, skipped: 0, error: 'The saved report was deleted.' }

  const report = getReportDefinition(saved.report_key)

  if (!report) return { scheduleId: schedule.id, status: 'failed', sent: 0, skipped: 0, error: 'The report no longer exists.' }

  const recipients: string[] = (schedule.forge_report_schedule_recipients || []).map((row: any) => row.user_id)
  const members = await activeMemberIds(organizationId, recipients)
  let sent = 0
  let skipped = 0
  const errors: string[] = []

  for (const userId of recipients) {
    if (!members.has(userId) || (saved.visibility !== 'organization' && userId !== saved.owner_user_id)) {
      skipped += 1
      continue
    }

    try {
      const access = await reportAccessFor(organizationId, userId)

      const run = await runReport({
        organizationId,
        userId,
        reportKey: saved.report_key,
        rawParams: saved.params || {},
        kind: 'scheduled',
        access,
        savedReportId: saved.id,
        scheduleId: schedule.id,
        today
      })

      if (!run.ok) {
        skipped += 1
        continue
      }

      const rows = run.result.groupBy ? `${run.result.groups.length} groups from ${run.result.total} records` : `${run.result.total} ${run.result.total === 1 ? 'record' : 'records'}`

      const queued = await queueDelivery({
        organizationId,
        scheduleId: schedule.id,
        savedReportId: saved.id,
        userId,
        title: `Report ready: ${saved.name}`,
        body: `${saved.name} (${report.name}) is ready: ${rows}, ${run.result.period.label.toLowerCase()}. Open it to view or download.`,
        dedupeKey: `report:${schedule.id}:${dueAt.toISOString()}:${userId}`
      })

      if (queued) sent += 1
    } catch (failure) {
      errors.push((failure as Error).message)
    }
  }

  if (errors.length && !sent) return { scheduleId: schedule.id, status: 'failed', sent, skipped, error: errors[0] }

  return { scheduleId: schedule.id, status: sent ? 'sent' : 'skipped', sent, skipped, error: errors[0] || (sent ? undefined : 'Nobody on the list can run this report.') }
}

/**
 * The schedule job: every enabled schedule whose next run has come. Each schedule is claimed by moving its
 * next run forward first (only if nobody else moved it), so two overlapping jobs never send twice. A failed run
 * is recorded on the schedule and waits for its next time; it is not retried in a loop.
 */
export const runReportScheduleCron = async ({ now = new Date(), limit = 200 }: { now?: Date; limit?: number } = {}) => {
  const supabase = db()

  const { data, error } = await supabase
    .from('forge_report_schedules')
    .select('*, forge_report_schedule_recipients(user_id)')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .order('next_run_at')
    .limit(limit)

  if (error) throw new Error('Unable to load due report schedules: ' + error.message)

  const outcomes: ScheduleRunOutcome[] = []
  const featureCache = new Map<string, boolean>()

  for (const schedule of data || []) {
    const timing: ScheduleTiming = { frequency: schedule.frequency, hour: schedule.hour, weekday: schedule.weekday, monthday: schedule.monthday, timezone: schedule.timezone }
    const dueAt = new Date(schedule.next_run_at)
    const next = nextScheduleRun(timing, now)

    const { data: claimed } = await supabase
      .from('forge_report_schedules')
      .update({ next_run_at: next.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', schedule.id)
      .eq('next_run_at', schedule.next_run_at)
      .select('id')

    if (!claimed?.length) continue

    if (!featureCache.has(schedule.organization_id)) {
      featureCache.set(schedule.organization_id, await isTenantFeatureAvailable({ organizationId: schedule.organization_id, featureKey: 'reporting' }))
    }

    let outcome: ScheduleRunOutcome

    if (!featureCache.get(schedule.organization_id)) {
      outcome = { scheduleId: schedule.id, status: 'skipped', sent: 0, skipped: 0, error: 'Reporting is not turned on for this company.' }
    } else {
      try {
        // "Today" for the report period is the date where the schedule runs, not in UTC.
        outcome = await deliverSchedule(schedule, dueAt, new Intl.DateTimeFormat('en-CA', { timeZone: schedule.timezone }).format(now))
      } catch (failure) {
        outcome = { scheduleId: schedule.id, status: 'failed', sent: 0, skipped: 0, error: (failure as Error).message }
      }
    }

    await supabase
      .from('forge_report_schedules')
      .update({ last_run_at: now.toISOString(), last_status: outcome.status, last_error: outcome.error ? outcome.error.slice(0, 1000) : null, updated_at: new Date().toISOString() })
      .eq('id', schedule.id)

    outcomes.push(outcome)
  }

  return { checked: (data || []).length, outcomes }
}

export const scheduleSummary = (schedule: ReportSchedule | null) => (schedule ? describeSchedule(schedule) : null)
