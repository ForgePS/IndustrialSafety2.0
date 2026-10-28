import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { zonedDateTimeParts } from '@/lib/forgeOshaRules'
import { getWeeklyStatusReport } from '@/lib/forgeWorkersComp'
import { buildWeeklyStatusNotice, weekdayOf, weeklyEmailDue } from '@/lib/forgeWorkersCompEmail'
import type { WcWeeklyNoticeRow } from '@/lib/forgeWorkersCompEmail'
import { WC_STAGE_LABELS, WC_WORK_STATUS_LABELS } from '@/lib/forgeWorkersCompRules'
import type { WcStage, WcWorkStatus } from '@/lib/forgeWorkersCompRules'

/**
 * Workers' comp weekly status notice through the shared notification service (forgeNotifications.ts).
 * Only Forge users with workers_comp.view receive it, each with the cases inside their own scope.
 * This module queues deliveries. The platform outbox drain (/api/helpdesk/cron) sends the emails.
 */

export type WcRecipientCandidate = { userId: string; name: string; email: string | null; scope: string | null }

/** The member's workers_comp.view grant, or null when they are not an active member or lack the permission. */
export const wcViewPermissionFor = async (organizationId: string, userId: string): Promise<EffectivePermission | null> => {
  const supabase = createServiceRoleClient() as any

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle()

  if (!membership) return null

  const access = await getEffectiveTenantAccess({ organizationId, userId })
  const permission = access.effective.find(item => item.permissionKey === 'workers_comp.view')

  return permission?.allowed ? permission : null
}

/** Active members who can view workers' comp: the people the settings page offers as recipients. */
export const getWcRecipientCandidates = async (organizationId: string): Promise<WcRecipientCandidate[]> => {
  const supabase = createServiceRoleClient() as any

  const { data: members } = await supabase
    .from('organization_memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)

  const ids = [...new Set<string>((members || []).map((row: any) => row.user_id))]

  if (!ids.length) return []

  const { data: users } = await supabase.from('users').select('user_id, name, email').in('user_id', ids)
  const byId = new Map<string, any>((users || []).map((row: any) => [row.user_id, row]))

  const checked = await Promise.all(
    ids.map(async userId => ({ userId, permission: await wcViewPermissionFor(organizationId, userId) }))
  )

  return checked
    .filter(item => item.permission)
    .map(item => {
      const user = byId.get(item.userId)

      return { userId: item.userId, name: user?.name || user?.email || 'Unnamed user', email: user?.email || null, scope: item.permission?.scope || null }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** One recipient's notice, built only from the cases their own workers' comp scope allows. */
export const buildWcWeeklyNoticeFor = async ({
  organizationId,
  organizationName,
  userId,
  permission,
  weekOf
}: {
  organizationId: string
  organizationName: string
  userId: string
  permission: EffectivePermission
  weekOf: string
}) => {
  const rows = await getWeeklyStatusReport({ organizationId, userId, permission, weekOf })

  const noticeRows: WcWeeklyNoticeRow[] = rows.map((row: any) => ({
    caseNumber: row.case_number,
    stage: WC_STAGE_LABELS[row.stage as WcStage] || row.stage,
    workStatus: row.current_work_status ? WC_WORK_STATUS_LABELS[row.current_work_status as WcWorkStatus] : 'No work status',
    daysAway: row.daysAway,
    restrictedDays: row.restrictedDays,
    hasUpdate: Boolean(row.weekly_update)
  }))

  return buildWeeklyStatusNotice({ organizationName, weekOf, rows: noticeRows })
}

type SweepResult = { organizationId: string; reason: string; queued: number; skippedRecipients: number }

/**
 * Hourly sweep: for each tenant whose weekly notice is due in its own time zone, builds one notice per
 * eligible recipient and queues them in a single database call that also marks the week sent.
 */
export const queueDueWcWeeklyNotices = async (now = new Date()) => {
  const supabase = createServiceRoleClient() as any

  const { data: settingsRows, error } = await supabase
    .from('forge_wc_settings')
    .select('*, organizations(name)')
    .eq('weekly_email_enabled', true)

  if (error) throw new Error(`Unable to load workers' comp notice settings: ${error.message}`)

  const results: SweepResult[] = []

  for (const settings of settingsRows || []) {
    const organizationId = settings.organization_id
    const local = zonedDateTimeParts(now.toISOString(), settings.time_zone || 'America/Chicago')

    const { due, weekOf } = weeklyEmailDue(
      { enabled: settings.weekly_email_enabled, weekday: settings.weekly_email_weekday, hour: settings.weekly_email_hour, lastSentWeek: settings.last_weekly_email_week },
      { date: local.date, weekday: weekdayOf(local.date), hour: Number(local.time.slice(0, 2)) }
    )

    if (!due) continue

    const organizationName = settings.organizations?.name || 'Your organization'
    const deliveries: Array<{ user_id: string; title: string; body: string }> = []
    let skippedRecipients = 0

    // Access is checked again at send time: people who lost workers' comp access since the save are skipped.
    for (const userId of settings.weekly_email_recipient_ids || []) {
      const permission = await wcViewPermissionFor(organizationId, userId)

      if (!permission) {
        skippedRecipients += 1
        continue
      }

      const notice = await buildWcWeeklyNoticeFor({ organizationId, organizationName, userId, permission, weekOf })

      deliveries.push({ user_id: userId, title: notice.title, body: notice.body })
    }

    if (!deliveries.length) {
      results.push({ organizationId, reason: 'no_eligible_recipients', queued: 0, skippedRecipients })
      continue
    }

    const { data, error: queueError } = await supabase.rpc('forge_wc_queue_weekly_status', {
      p_organization_id: organizationId,
      p_week_of: weekOf,
      p_title: `Workers' comp weekly status (week of ${weekOf})`,
      p_body: `${organizationName}: workers' comp weekly status notice.`,
      p_deliveries: deliveries
    })

    if (queueError) {
      results.push({ organizationId, reason: 'error', queued: 0, skippedRecipients })
      console.error('[workers-comp] weekly notice', organizationId, queueError.message)
      continue
    }

    results.push({ organizationId, reason: data?.reason || 'queued', queued: data?.queued || 0, skippedRecipients })
  }

  return { checked: (settingsRows || []).length, results }
}
