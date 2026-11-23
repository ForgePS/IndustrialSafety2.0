'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { can, reportFor, todayIso } from '@/lib/forgeReportRun'
import { cleanReportParams, cleanScheduleTiming, nextScheduleRun } from '@/lib/forgeReportRules'
import { activeMemberIds, loadSchedule, MAX_RECIPIENTS } from '@/lib/forgeSavedReports'

/**
 * Port slice 13: saving, sharing, deleting and scheduling reports. Only the owner changes a saved report or its
 * schedule. Every check is repeated here, whatever the page showed.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const refresh = (id?: string) => {
  revalidatePath('/reporting', 'layout')
  if (id) revalidatePath('/reporting/saved/' + id)
}

const ownedReport = async (organizationId: string, userId: string, id: string) => {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return null

  const { data } = await db().from('forge_saved_reports').select('*').eq('organization_id', organizationId).eq('id', id).is('archived_at', null).maybeSingle()

  return data && data.owner_user_id === userId ? data : null
}

export const saveReport = async (input: {
  id?: string
  reportKey: string
  name: string
  description?: string
  params: Record<string, unknown>
  shared: boolean
}): Promise<Result> => {
  const context = await tenantPermissionOrNull('reporting.view')

  if (!context) return { error: "You don't have access to Reporting." }

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const report = reportFor(context.access, String(input.reportKey || ''))

  if (!report) return { error: "You don't have access to this report." }

  const name = String(input.name || '').trim()

  if (!name) return { error: 'Give the report a name.' }
  if (name.length > 120) return { error: 'Keep the name to 120 characters.' }

  const description = String(input.description || '').trim()

  if (description.length > 1000) return { error: 'Keep the description to 1,000 characters.' }
  if (input.shared && !can(context.access, 'reporting.share')) return { error: "You don't have permission to share reports." }

  const params = cleanReportParams(input.params || {}, report, todayIso())

  const values = {
    report_key: report.key,
    name,
    description: description || null,
    params,
    visibility: input.shared ? 'organization' : 'private',
    updated_at: new Date().toISOString()
  }

  if (input.id) {
    const existing = await ownedReport(organizationId, userId, input.id)

    if (!existing) return { error: 'Only the person who saved this report can change it.' }

    // Unsharing a report that sends to other people would leave them with a link they can't open.
    if (!input.shared && existing.visibility === 'organization') {
      const schedule = await loadSchedule(organizationId, existing.id)

      if (schedule?.recipients.some(recipient => recipient !== userId)) {
        return { error: 'This report is sent to other people. Take them off the schedule before making it private.' }
      }
    }

    const { error } = await db().from('forge_saved_reports').update(values).eq('id', existing.id)

    if (error) return { error: 'The report could not be saved.' }

    await writeForgeAudit({
      actorUserId: userId,
      organizationId,
      action: 'reporting.saved_report.update',
      entityType: 'saved_report',
      entityId: existing.id,
      beforeValue: { name: existing.name, visibility: existing.visibility, params: existing.params },
      afterValue: { name, visibility: values.visibility, params }
    })

    refresh(existing.id)

    return { id: existing.id, message: 'Saved.' }
  }

  const { data, error } = await db()
    .from('forge_saved_reports')
    .insert({ ...values, organization_id: organizationId, owner_user_id: userId })
    .select('id')
    .single()

  if (error || !data) return { error: 'The report could not be saved.' }

  await writeForgeAudit({
    actorUserId: userId,
    organizationId,
    action: 'reporting.saved_report.create',
    entityType: 'saved_report',
    entityId: data.id,
    afterValue: { name, report_key: report.key, visibility: values.visibility, params }
  })

  refresh(data.id)

  return { id: data.id, message: 'Saved.' }
}

export const deleteSavedReport = async (id: string): Promise<Result> => {
  const context = await tenantPermissionOrNull('reporting.view')

  if (!context) return { error: "You don't have access to Reporting." }

  const existing = await ownedReport(context.activeOrganization.id, context.user.id, id)

  if (!existing) return { error: 'Only the person who saved this report can delete it.' }

  const supabase = db()

  // The schedule goes with it; the run history keeps its rows.
  await supabase.from('forge_report_schedules').delete().eq('saved_report_id', existing.id)

  const { error } = await supabase.from('forge_saved_reports').update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', existing.id)

  if (error) return { error: 'The report could not be deleted.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId: context.activeOrganization.id,
    action: 'reporting.saved_report.delete',
    entityType: 'saved_report',
    entityId: existing.id,
    beforeValue: { name: existing.name, report_key: existing.report_key }
  })

  refresh()

  return { message: 'Deleted.' }
}

export const saveSchedule = async (input: {
  savedReportId: string
  frequency: string
  hour: string | number
  weekday?: string | number
  monthday?: string | number
  timezone: string
  enabled: boolean
  recipients: string[]
}): Promise<Result> => {
  const context = await tenantPermissionOrNull('reporting.schedule')

  if (!context || !can(context.access, 'reporting.view')) return { error: "You don't have permission to schedule reports." }

  const organizationId = context.activeOrganization.id
  const userId = context.user.id
  const saved = await ownedReport(organizationId, userId, input.savedReportId)

  if (!saved) return { error: 'Only the person who saved this report can schedule it.' }
  if (!reportFor(context.access, saved.report_key)) return { error: "You don't have access to this report." }

  const timing = cleanScheduleTiming(input as unknown as Record<string, unknown>)

  if ('error' in timing) return { error: timing.error }

  const recipients = [...new Set((Array.isArray(input.recipients) ? input.recipients : []).map(String))]

  if (!recipients.length) return { error: 'Pick at least one person to send it to.' }
  if (recipients.length > MAX_RECIPIENTS) return { error: `Send it to ${MAX_RECIPIENTS} people at most.` }

  const members = await activeMemberIds(organizationId, recipients)

  if (recipients.some(recipient => !members.has(recipient))) return { error: 'Reports can only be sent to people in the company.' }

  if (saved.visibility !== 'organization' && recipients.some(recipient => recipient !== userId)) {
    return { error: 'Share the report with the company before sending it to other people.' }
  }

  const supabase = db()
  const existing = await loadSchedule(organizationId, saved.id)

  const values = {
    frequency: timing.frequency,
    hour: timing.hour,
    weekday: timing.weekday,
    monthday: timing.monthday,
    timezone: timing.timezone,
    enabled: Boolean(input.enabled),
    next_run_at: nextScheduleRun(timing, new Date()).toISOString(),
    updated_at: new Date().toISOString()
  }

  let scheduleId = existing?.id

  if (existing) {
    const { error } = await supabase.from('forge_report_schedules').update(values).eq('id', existing.id)

    if (error) return { error: 'The schedule could not be saved.' }
  } else {
    const { data, error } = await supabase
      .from('forge_report_schedules')
      .insert({ ...values, organization_id: organizationId, saved_report_id: saved.id, created_by: userId })
      .select('id')
      .single()

    if (error || !data) return { error: 'The schedule could not be saved.' }
    scheduleId = data.id
  }

  const { error: clearError } = await supabase.from('forge_report_schedule_recipients').delete().eq('schedule_id', scheduleId)

  if (clearError) return { error: 'The recipients could not be saved.' }

  const { error: recipientError } = await supabase
    .from('forge_report_schedule_recipients')
    .insert(recipients.map(recipient => ({ schedule_id: scheduleId, organization_id: organizationId, user_id: recipient })))

  if (recipientError) return { error: 'The recipients could not be saved.' }

  await writeForgeAudit({
    actorUserId: userId,
    organizationId,
    action: existing ? 'reporting.schedule.update' : 'reporting.schedule.create',
    entityType: 'report_schedule',
    entityId: scheduleId as string,
    beforeValue: existing ? { ...existing } : null,
    afterValue: { ...values, recipients }
  })

  refresh(saved.id)

  return { id: scheduleId, message: values.enabled ? 'Schedule saved.' : 'Schedule saved and paused.' }
}

export const deleteSchedule = async (savedReportId: string): Promise<Result> => {
  const context = await tenantPermissionOrNull('reporting.view')

  if (!context) return { error: "You don't have access to Reporting." }

  const saved = await ownedReport(context.activeOrganization.id, context.user.id, savedReportId)

  if (!saved) return { error: 'Only the person who saved this report can change its schedule.' }

  const { data, error } = await db().from('forge_report_schedules').delete().eq('saved_report_id', saved.id).select('id')

  if (error) return { error: 'The schedule could not be removed.' }

  if (data?.[0]?.id) {
    await writeForgeAudit({
      actorUserId: context.user.id,
      organizationId: context.activeOrganization.id,
      action: 'reporting.schedule.delete',
      entityType: 'report_schedule',
      entityId: data[0].id
    })
  }

  refresh(saved.id)

  return { message: 'Schedule removed.' }
}
