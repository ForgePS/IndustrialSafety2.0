import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { OSHA_TIME_ZONE, createOshaCaseForIncident, oshaRecordWithinScope } from '@/lib/forgeOsha'
import { zonedDateTimeParts } from '@/lib/forgeOshaRules'
import { calculateWorkDays, currentWorkStatus, deriveOshaOutcome } from '@/lib/forgeWorkersCompRules'
import type { WcWorkPeriod } from '@/lib/forgeWorkersCompRules'

/** Today's calendar date at the establishment time zone (YYYY-MM-DD). */
export const wcTodayIso = () => zonedDateTimeParts(new Date().toISOString(), OSHA_TIME_ZONE).date

/** Workers' comp records use the same Location / Division / own scope rules as OSHA. */
export const wcRecordWithinScope = oshaRecordWithinScope

export const getWcPeriods = async (organizationId: string, caseIds: string[]) => {
  if (!caseIds.length) return new Map<string, WcWorkPeriod[]>()

  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_wc_work_status_periods')
    .select('id, case_id, work_status, start_date, end_date, notes, created_by')
    .eq('organization_id', organizationId)
    .in('case_id', caseIds)
    .order('start_date')

  if (error) throw new Error(`Unable to load work status periods: ${error.message}`)

  const byCase = new Map<string, any[]>()

  for (const row of data || []) {
    if (!byCase.has(row.case_id)) byCase.set(row.case_id, [])
    byCase.get(row.case_id)!.push(row)
  }

  return byCase
}

/** Adds live day counts and current work status computed from the periods. */
export const withWorkDays = (record: any, periods: WcWorkPeriod[], todayIso: string) => ({
  ...record,
  ...calculateWorkDays(periods, record.injury_date, todayIso),
  current_work_status: currentWorkStatus(periods, todayIso)
})

export const getScopedWcCases = async ({
  organizationId,
  userId,
  permission,
  includeArchived = false
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  includeArchived?: boolean
}) => {
  const supabase = createServiceRoleClient() as any
  let query = supabase
    .from('forge_wc_cases')
    .select('*, locations(name), forge_wc_carriers(name), forge_incidents(incident_number)')
    .eq('organization_id', organizationId)
    .order('injury_date', { ascending: false })

  if (!includeArchived) query = query.neq('status', 'archived')

  const { data, error } = await query

  if (error) throw new Error(`Unable to load workers' comp cases: ${error.message}`)

  const visible = permission.scope === 'organization'
    ? data || []
    : (
        await Promise.all(
          (data || []).map(async (row: any) => ({
            row,
            allowed: await wcRecordWithinScope({ organizationId, userId, scope: permission.scope, record: row })
          }))
        )
      )
        .filter(item => item.allowed)
        .map(item => item.row)

  const periods = await getWcPeriods(organizationId, visible.map((row: any) => row.id))
  const today = wcTodayIso()

  return visible.map((row: any) => withWorkDays(row, periods.get(row.id) || [], today))
}

export const writeWcActivity = async ({
  organizationId,
  caseId,
  activityType,
  message,
  actorUserId,
  metadata = {}
}: {
  organizationId: string
  caseId: string
  activityType: string
  message: string
  actorUserId: string
  metadata?: Record<string, unknown>
}) => {
  const supabase = createServiceRoleClient() as any

  const { error } = await supabase.from('forge_wc_case_activity').insert({
    organization_id: organizationId,
    case_id: caseId,
    activity_type: activityType,
    message,
    actor_user_id: actorUserId,
    metadata
  })

  if (error) throw new Error(`Unable to record workers' comp activity: ${error.message}`)
}

/**
 * Pushes a workers' comp case's OSHA decision onto the OSHA log (1.0 syncOshaFromWorkersCompCase).
 *
 * - Marked recordable: open (or reuse) the OSHA case for the incident and employee, then apply the
 *   recordability, privacy flag, outcome, case type and day counts (capped at 180).
 * - Not marked recordable but already linked: mark the OSHA case not recordable.
 * - Not marked and never linked: nothing to do.
 */
export const syncWcCaseToOsha = async ({
  organizationId,
  caseId,
  actorUserId,
  actorEmail
}: {
  organizationId: string
  caseId: string
  actorUserId: string
  actorEmail: string | null
}): Promise<{ oshaCaseId: string | null; message: string } | { error: string }> => {
  const supabase = createServiceRoleClient() as any

  const { data: wc } = await supabase.from('forge_wc_cases').select('*').eq('organization_id', organizationId).eq('id', caseId).maybeSingle()

  if (!wc) return { error: 'Workers\' comp case not found.' }

  if (!wc.osha_recordable && !wc.osha_case_id) return { oshaCaseId: null, message: 'Not marked OSHA recordable; nothing to sync.' }

  let oshaCaseId: string | null = wc.osha_case_id

  if (oshaCaseId) {
    const { data: linked } = await supabase.from('forge_osha_cases').select('id, status').eq('id', oshaCaseId).maybeSingle()

    if (!linked || linked.status === 'voided') oshaCaseId = null
  }

  if (!oshaCaseId) {
    if (!wc.osha_recordable) return { oshaCaseId: null, message: 'The linked OSHA case was voided; nothing to sync.' }
    if (!wc.incident_id) return { error: 'Link an injury incident before marking this case OSHA recordable.' }
    if (!wc.personnel_id) return { error: 'Link the employee\'s personnel record before marking this case OSHA recordable.' }

    const { data: incident } = await supabase
      .from('forge_incidents')
      .select('*, locations(name, code)')
      .eq('organization_id', organizationId)
      .eq('id', wc.incident_id)
      .maybeSingle()

    if (!incident) return { error: 'The linked incident was not found.' }

    const created = await createOshaCaseForIncident({
      organizationId,
      incident,
      personnelId: wc.personnel_id,
      actorUserId,
      actorEmail,
      source: 'workers_comp'
    })

    if ('error' in created) return { error: created.error }
    oshaCaseId = created.id
  }

  const periods = (await getWcPeriods(organizationId, [caseId])).get(caseId) || []
  const days = calculateWorkDays(periods, wc.injury_date, wcTodayIso())
  const outcome = deriveOshaOutcome({ override: wc.osha_case_outcome_override, severity: wc.severity, ...days })

  const { data: osha, error } = await supabase.rpc('forge_apply_wc_to_osha_case', {
    p_organization_id: organizationId,
    p_wc_case_id: caseId,
    p_osha_case_id: oshaCaseId,
    p_recordable: wc.osha_recordable,
    p_privacy: wc.osha_privacy_case,
    p_case_outcome: wc.osha_recordable ? outcome : null,
    p_case_type: wc.osha_case_type || 'injury',
    p_days_away: days.daysAway,
    p_restricted_days: days.restrictedDays,
    p_actor_user_id: actorUserId
  })

  if (error) return { error: error.message }

  await writeWcActivity({
    organizationId,
    caseId,
    activityType: 'osha_synced',
    message: wc.osha_recordable
      ? `OSHA case ${osha.case_number} updated: recordable, ${osha.days_away} days away, ${osha.restricted_days} restricted.`
      : `OSHA case ${osha.case_number} marked not recordable.`,
    actorUserId
  })

  return { oshaCaseId, message: wc.osha_recordable ? `OSHA case ${osha.case_number} updated.` : `OSHA case ${osha.case_number} marked not recordable.` }
}

/** Readable messages for database constraint failures on workers' comp writes. */
export const wcWriteErrorMessage = (error: { code?: string; message?: string } | null | undefined) => {
  const message = error?.message || ''

  if (!error) return 'Unable to save the workers\' comp case.'
  if (/forge_wc_cases_person_injury_idx/.test(message)) return 'This employee already has a workers\' comp case for that injury date.'
  if (/forge_wc_work_status_no_overlap/.test(message)) return 'Work status periods cannot overlap. End the current period first.'
  if (/forge_wc_cases_recordable_incident/.test(message)) return 'Link an injury incident before marking the case OSHA recordable.'
  if (/forge_wc_cases_privacy_recordable/.test(message)) return 'Only OSHA-recordable cases can be privacy cases.'
  if (/forge_wc_cases_self_pay_carrier/.test(message)) return 'A self-pay case cannot also have a carrier.'
  if (/forge_wc_weekly_updates_case_id_week_of_key/.test(message)) return 'This case already has an update for that week.'

  return message || 'Unable to save the workers\' comp case.'
}
