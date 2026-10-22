'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import { OSHA_TIME_ZONE, oshaRecordWithinScope } from '@/lib/forgeOsha'
import { zonedDateTimeParts } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { syncWcCaseToOsha, wcRecordWithinScope, wcTodayIso, wcWriteErrorMessage, writeWcActivity } from '@/lib/forgeWorkersComp'
import { parseEmailRecipients } from '@/lib/forgeWorkersCompEmail'
import {
  WC_LIFTING_OPTIONS,
  WC_LOWER_EXTREMITY_LABELS,
  WC_SEVERITIES,
  WC_SIT_OPTIONS,
  WC_STAGES,
  WC_STAGE_LABELS,
  WC_STAND_WALK_OPTIONS,
  WC_UPPER_EXTREMITY_LABELS,
  WC_WORK_STATUSES,
  WC_WORK_STATUS_LABELS,
  canEditAuthoredNote,
  thursdayWeekOf
} from '@/lib/forgeWorkersCompRules'
import type { WcStage } from '@/lib/forgeWorkersCompRules'

type ActionResult = { error?: string; message?: string; id?: string }

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter dates as YYYY-MM-DD.')

const optionalDate = z
  .string()
  .transform(value => value.trim() || null)
  .refine(value => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter dates as YYYY-MM-DD.')

const text = (max = 2000) =>
  z
    .string()
    .max(max)
    .transform(value => value.trim() || null)

const optionalUuid = z
  .string()
  .transform(value => value.trim() || null)
  .refine(value => value === null || z.string().uuid().safeParse(value).success, 'Invalid selection.')

const emptyToNull = <T extends string>(values: readonly [T, ...T[]]) =>
  z.union([z.enum(values), z.literal('')]).transform(value => (value || null) as T | null)

const refreshWc = (caseId?: string, incidentId?: string | null) => {
  revalidatePath('/workers-comp')
  revalidatePath('/workers-comp/weekly')
  if (caseId) revalidatePath(`/workers-comp/${caseId}`)
  if (incidentId) revalidatePath(`/incidents/${incidentId}`)
  revalidatePath('/osha')
}

const hasPermission = (context: Awaited<ReturnType<typeof requireTenantPermission>>, key: string) =>
  context.access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** Loads a case and confirms the permission reaches it. Archived cases are read-only. */
const loadCase = async (permissionKey: string, caseId: string, { allowArchived = false } = {}) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase.from('forge_wc_cases').select('*').eq('organization_id', organizationId).eq('id', caseId).maybeSingle()

  if (!record) return { error: 'Workers\' comp case not found.' as const }

  const allowed = await wcRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record })

  if (!allowed) return { error: 'This case is outside your workers\' comp access scope.' as const }
  if (record.status === 'archived' && !allowArchived) return { error: 'Archived cases are read-only.' as const }

  return { context, organizationId, supabase, record }
}

/** Updating the OSHA log from workers' comp needs OSHA edit access at the case's establishment. */
const canWriteOsha = async (context: Awaited<ReturnType<typeof requireTenantPermission>>, record: any) => {
  const oshaEdit = hasPermission(context, 'osha.edit')

  if (!oshaEdit) return false

  return oshaRecordWithinScope({
    organizationId: context.activeOrganization.id,
    userId: context.user.id,
    scope: oshaEdit.scope,
    record: { organization_id: record.organization_id, location_id: record.location_id, division_id: record.division_id, created_by: context.user.id }
  })
}

/** Re-syncs a linked or recordable case after a change. Returns a note to append to the result message. */
const syncAfterChange = async (target: { context: any; organizationId: string; record: any }, caseId: string) => {
  const supabase = createServiceRoleClient() as any

  const { data: fresh } = await supabase
    .from('forge_wc_cases')
    .select('osha_recordable, osha_case_id, location_id, division_id, organization_id')
    .eq('id', caseId)
    .maybeSingle()

  if (!fresh || (!fresh.osha_recordable && !fresh.osha_case_id)) return ''
  if (!(await canWriteOsha(target.context, fresh))) return ' OSHA log not updated: you need OSHA edit access.'

  const result = await syncWcCaseToOsha({
    organizationId: target.organizationId,
    caseId,
    actorUserId: target.context.user.id,
    actorEmail: target.context.user.email || null
  })

  return 'error' in result ? ` OSHA log not updated: ${result.error}` : ` ${result.message}`
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

const createSchema = z.object({
  incident_id: optionalUuid,
  personnel_id: optionalUuid,
  employee_name: z.string().max(300),
  injury_date: optionalDate,
  reported_date: optionalDate,
  location_id: optionalUuid,
  severity: emptyToNull(WC_SEVERITIES)
})

export type WcCreateValues = z.input<typeof createSchema>

export const createWcCase = async (values: WcCreateValues): Promise<ActionResult> => {
  const context = await requireTenantPermission('workers_comp.create')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const parsed = createSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the case fields.' }

  const input = parsed.data
  let incident: any = null

  if (input.incident_id) {
    const { data } = await supabase.from('forge_incidents').select('*').eq('organization_id', organizationId).eq('id', input.incident_id).maybeSingle()

    if (!data) return { error: 'Incident not found.' }

    const incidentView = hasPermission(context, 'incidents.view')
    const visible = incidentView ? await incidentWithinScope({ organizationId, userId: context.user.id, scope: incidentView.scope, incident: data }) : false

    if (!visible) return { error: 'This incident is outside your incident access scope.' }
    incident = data
  }

  let person: any = null

  if (input.personnel_id) {
    const { data } = await supabase
      .from('forge_personnel')
      .select('id, first_name, middle_name, last_name, suffix, location_id, division_id')
      .eq('organization_id', organizationId)
      .eq('id', input.personnel_id)
      .maybeSingle()

    if (!data) return { error: 'Choose the employee from this company\'s personnel.' }
    person = data
  }

  const employeeName = person
    ? [person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ')
    : input.employee_name.trim()

  if (!employeeName) return { error: 'Choose the employee or enter their name.' }

  const injuryDate = input.injury_date || (incident ? zonedDateTimeParts(incident.occurred_at, OSHA_TIME_ZONE).date : null)

  if (!injuryDate) return { error: 'Enter the injury date.' }

  const locationId = input.location_id || incident?.location_id || person?.location_id || null
  const divisionId = incident?.division_id || person?.division_id || null

  const record = { organization_id: organizationId, location_id: locationId, division_id: divisionId, created_by: context.user.id }
  const inScope = await wcRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record })

  if (!inScope) return { error: 'That Location is outside your workers\' comp access scope.' }

  const { data: caseNumber, error: numberError } = await supabase.rpc('next_forge_wc_case_number', {
    p_organization_id: organizationId,
    p_year: Number(injuryDate.slice(0, 4))
  })

  if (numberError || !caseNumber) return { error: numberError?.message || 'Unable to assign a case number.' }

  const { data: created, error } = await supabase
    .from('forge_wc_cases')
    .insert({
      organization_id: organizationId,
      case_number: caseNumber,
      incident_id: incident?.id || null,
      personnel_id: person?.id || null,
      employee_name: employeeName,
      location_id: locationId,
      division_id: divisionId,
      injury_date: injuryDate,
      reported_date: input.reported_date || wcTodayIso(),
      severity: input.severity,
      body_parts: null,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('id, case_number')
    .single()

  if (error || !created) return { error: wcWriteErrorMessage(error) }

  if (incident) {
    await supabase
      .from('forge_incidents')
      .update({ workers_comp_review_flag: true, updated_at: new Date().toISOString(), updated_by: context.user.id })
      .eq('id', incident.id)
      .eq('organization_id', organizationId)

    await supabase.from('forge_incident_activity').insert({
      organization_id: organizationId,
      incident_id: incident.id,
      activity_type: 'workers_comp_case_opened',
      message: `Workers' comp case ${created.case_number} opened.`,
      actor_user_id: context.user.id
    })
  }

  await writeWcActivity({
    organizationId,
    caseId: created.id,
    activityType: 'opened',
    message: incident ? `Case opened from incident ${incident.incident_number}.` : 'Case opened.',
    actorUserId: context.user.id
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.case_opened',
    entityType: 'workers_comp_case',
    entityId: created.id,
    afterValue: { case_number: created.case_number, incident_id: incident?.id || null }
  })

  refreshWc(created.id, incident?.id)

  return { id: created.id, message: `Workers' comp case ${created.case_number} opened.` }
}

const caseSchema = z.object({
  injury_date: isoDate,
  reported_date: optionalDate,
  stage: z.enum(WC_STAGES),
  severity: emptyToNull(WC_SEVERITIES),
  carrier_id: optionalUuid,
  is_self_pay: z.boolean(),
  claim_number: text(120),
  adjuster_name: text(300),
  adjuster_phone: text(40),
  adjuster_email: z.union([z.string().trim().email(), z.literal('')]).transform(value => value || null),
  body_parts: text(500),
  claim_notes: text(4000),
  next_action_label: text(300),
  next_action_due: optionalDate,
  next_action_priority: emptyToNull(['high', 'medium', 'low'] as const),
  osha_recordable: z.boolean(),
  osha_privacy_case: z.boolean(),
  osha_case_type: emptyToNull(['injury', 'skin_disorder', 'respiratory_condition', 'poisoning', 'hearing_loss', 'other_illness'] as const),
  osha_case_outcome_override: emptyToNull(['death', 'days_away', 'job_transfer_restriction', 'other_recordable'] as const)
})

export type WcCaseValues = z.input<typeof caseSchema>

export const saveWcCase = async ({ caseId, rowVersion, values }: { caseId: string; rowVersion: number; values: WcCaseValues }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const parsed = caseSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the case fields.' }

  const payload = parsed.data
  const before = target.record

  if (payload.is_self_pay) payload.carrier_id = null
  if (!payload.osha_recordable) payload.osha_privacy_case = false

  if (payload.stage === 'closed' && before.status !== 'closed') return { error: 'Use Close Case to close it.' }
  if (payload.stage !== 'closed' && before.status === 'closed') return { error: 'Reopen the case before changing its stage.' }
  if (payload.injury_date > wcTodayIso()) return { error: 'Injury date cannot be in the future.' }
  if (payload.reported_date && payload.reported_date < payload.injury_date) return { error: 'The reported date cannot be before the injury date.' }

  if (payload.carrier_id) {
    const { data: carrier } = await target.supabase.from('forge_wc_carriers').select('id').eq('organization_id', target.organizationId).eq('id', payload.carrier_id).maybeSingle()

    if (!carrier) return { error: 'Choose a carrier from this company\'s carrier list.' }
  }

  const oshaChanged =
    payload.osha_recordable !== before.osha_recordable ||
    payload.osha_privacy_case !== before.osha_privacy_case ||
    payload.osha_case_type !== before.osha_case_type ||
    payload.osha_case_outcome_override !== before.osha_case_outcome_override ||
    payload.severity !== before.severity ||
    payload.injury_date !== before.injury_date

  if (oshaChanged && (payload.osha_recordable || before.osha_case_id) && !(await canWriteOsha(target.context, before))) {
    return { error: 'Changing the OSHA classification updates the OSHA log, which needs OSHA edit access for this Location.' }
  }

  if (payload.osha_recordable && !before.incident_id) return { error: 'Link an injury incident before marking this case OSHA recordable.' }

  const { data: updated, error } = await target.supabase
    .from('forge_wc_cases')
    .update({ ...payload, updated_by: target.context.user.id })
    .eq('id', caseId)
    .eq('organization_id', target.organizationId)
    .eq('row_version', rowVersion)
    .select('*')
    .maybeSingle()

  if (error) return { error: wcWriteErrorMessage(error) }
  if (!updated) return { error: 'This case changed since you opened it. Reload to see the latest version, then reapply your changes.' }

  const changedFields = Object.keys(payload).filter(key => (before as any)[key] !== (updated as any)[key])
  const notes: string[] = []

  if (before.stage !== updated.stage) notes.push(`Stage: ${WC_STAGE_LABELS[updated.stage as WcStage]}`)
  if (before.osha_recordable !== updated.osha_recordable) notes.push(updated.osha_recordable ? 'Marked OSHA recordable' : 'OSHA recordable flag cleared')

  if (changedFields.length) {
    await writeWcActivity({
      organizationId: target.organizationId,
      caseId,
      activityType: 'updated',
      message: notes.length ? notes.join('. ') + '.' : 'Case details updated.',
      actorUserId: target.context.user.id,
      metadata: { changed_fields: changedFields }
    })

    await writeForgeAudit({
      actorUserId: target.context.user.id,
      organizationId: target.organizationId,
      action: 'workers_comp.case_updated',
      entityType: 'workers_comp_case',
      entityId: caseId,
      afterValue: { changed_fields: changedFields }
    })
  }

  const syncNote = oshaChanged ? await syncAfterChange(target, caseId) : ''

  refreshWc(caseId, updated.incident_id)

  return { message: `Case saved.${syncNote}` }
}

export const setWcCaseStatus = async ({
  caseId,
  rowVersion,
  action
}: {
  caseId: string
  rowVersion: number
  action: 'close' | 'reopen' | 'archive'
}): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const record = target.record
  const userId = target.context.user.id
  let update: Record<string, unknown>

  if (action === 'close') {
    if (record.status !== 'active') return { error: 'Only active cases can be closed.' }

    // Close any open work status period so day counts stop growing.
    await target.supabase
      .from('forge_wc_work_status_periods')
      .update({ end_date: wcTodayIso(), updated_by: userId })
      .eq('case_id', caseId)
      .is('end_date', null)

    update = { status: 'closed', stage: 'closed', closed_at: new Date().toISOString(), closed_by: userId }
  } else if (action === 'reopen') {
    if (record.status !== 'closed') return { error: 'Only closed cases can be reopened.' }
    update = { status: 'active', stage: 'claim_admin', closed_at: null, closed_by: null }
  } else {
    if (record.osha_recordable) return { error: 'Clear the OSHA recordable flag before archiving, so the OSHA log stays accurate.' }
    update = { status: 'archived' }
  }

  const { data: updated, error } = await target.supabase
    .from('forge_wc_cases')
    .update({ ...update, updated_by: userId })
    .eq('id', caseId)
    .eq('organization_id', target.organizationId)
    .eq('row_version', rowVersion)
    .select('id')
    .maybeSingle()

  if (error) return { error: wcWriteErrorMessage(error) }
  if (!updated) return { error: 'This case changed since you opened it. Reload and try again.' }

  const label = action === 'close' ? 'closed' : action === 'reopen' ? 'reopened' : 'archived'

  await writeWcActivity({ organizationId: target.organizationId, caseId, activityType: label, message: `Case ${label}.`, actorUserId: userId })
  await writeForgeAudit({ actorUserId: userId, organizationId: target.organizationId, action: `workers_comp.case_${label}`, entityType: 'workers_comp_case', entityId: caseId })

  const syncNote = action === 'close' ? await syncAfterChange(target, caseId) : ''

  refreshWc(caseId, record.incident_id)

  return { message: `Case ${label}.${syncNote}` }
}

export const syncWcToOshaNow = async ({ caseId }: { caseId: string }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }
  if (!(await canWriteOsha(target.context, target.record))) return { error: 'Updating the OSHA log needs OSHA edit access for this Location.' }

  const result = await syncWcCaseToOsha({
    organizationId: target.organizationId,
    caseId,
    actorUserId: target.context.user.id,
    actorEmail: target.context.user.email || null
  })

  if ('error' in result) return { error: result.error }

  refreshWc(caseId, target.record.incident_id)

  return { message: result.message }
}

// ---------------------------------------------------------------------------
// Work status periods
// ---------------------------------------------------------------------------

const periodSchema = z.object({
  work_status: z.enum(WC_WORK_STATUSES),
  start_date: isoDate,
  end_date: optionalDate,
  notes: text(2000)
})

export type WcPeriodValues = z.input<typeof periodSchema>

export const addWorkStatusPeriod = async ({ caseId, values }: { caseId: string; values: WcPeriodValues }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const parsed = periodSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the work status fields.' }

  const period = parsed.data

  if (period.end_date && period.end_date < period.start_date) return { error: 'The end date cannot be before the start date.' }
  if (period.start_date < target.record.injury_date) return { error: 'Work status periods cannot start before the injury date.' }

  // A new open period ends the current open one the day before it starts (1.0 recorded status changes this way).
  const { data: open } = await target.supabase
    .from('forge_wc_work_status_periods')
    .select('id, start_date')
    .eq('case_id', caseId)
    .is('end_date', null)
    .maybeSingle()

  if (open && open.start_date < period.start_date) {
    const dayBefore = new Date(Date.parse(period.start_date + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

    await target.supabase.from('forge_wc_work_status_periods').update({ end_date: dayBefore, updated_by: target.context.user.id }).eq('id', open.id)
  }

  const { error } = await target.supabase.from('forge_wc_work_status_periods').insert({
    organization_id: target.organizationId,
    case_id: caseId,
    ...period,
    created_by: target.context.user.id,
    updated_by: target.context.user.id
  })

  if (error) return { error: wcWriteErrorMessage(error) }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'work_status',
    message: `Work status: ${WC_WORK_STATUS_LABELS[period.work_status]} from ${period.start_date}${period.end_date ? ` to ${period.end_date}` : ''}.`,
    actorUserId: target.context.user.id
  })

  const syncNote = await syncAfterChange(target, caseId)

  refreshWc(caseId)

  return { message: `Work status recorded.${syncNote}` }
}

export const endWorkStatusPeriod = async ({ caseId, periodId, endDate }: { caseId: string; periodId: string; endDate: string }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { error: 'Enter the end date.' }

  const { data: period } = await target.supabase
    .from('forge_wc_work_status_periods')
    .select('*')
    .eq('organization_id', target.organizationId)
    .eq('case_id', caseId)
    .eq('id', periodId)
    .maybeSingle()

  if (!period) return { error: 'Work status period not found.' }

  if (!canEditAuthoredNote({ userId: target.context.user.id, createdBy: period.created_by, canConfigure: Boolean(hasPermission(target.context, 'workers_comp.configure')) })) {
    return { error: 'Only the person who recorded this period, or a workers\' comp administrator, can change it.' }
  }

  if (endDate < period.start_date) return { error: 'The end date cannot be before the start date.' }

  const { error } = await target.supabase.from('forge_wc_work_status_periods').update({ end_date: endDate, updated_by: target.context.user.id }).eq('id', periodId)

  if (error) return { error: wcWriteErrorMessage(error) }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'work_status',
    message: `${WC_WORK_STATUS_LABELS[period.work_status as keyof typeof WC_WORK_STATUS_LABELS]} ended ${endDate}.`,
    actorUserId: target.context.user.id
  })

  const syncNote = await syncAfterChange(target, caseId)

  refreshWc(caseId)

  return { message: `Work status period ended.${syncNote}` }
}

// ---------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------

const restrictionSchema = z.object({
  start_date: isoDate,
  end_date: optionalDate,
  stand_walk_hours: emptyToNull(WC_STAND_WALK_OPTIONS),
  sit_hours: emptyToNull(WC_SIT_OPTIONS),
  lifting_level: emptyToNull(WC_LIFTING_OPTIONS),
  upper_extremity: z.array(z.string()).refine(values => values.every(value => value in WC_UPPER_EXTREMITY_LABELS), 'Invalid upper-extremity option.'),
  lower_extremity: z.array(z.string()).refine(values => values.every(value => value in WC_LOWER_EXTREMITY_LABELS), 'Invalid lower-extremity option.'),
  push_pull_limit_lbs: z
    .string()
    .transform(value => (value.trim() === '' ? null : Number(value)))
    .refine(value => value === null || (Number.isInteger(value) && value >= 0 && value <= 500), 'Push/pull limit must be 0 to 500 lbs.'),
  transitional_hours_per_day: z.union([z.literal(''), z.enum(['2', '4', '6', '8'])]).transform(value => (value ? Number(value) : null)),
  description: text(2000)
})

export type WcRestrictionValues = z.input<typeof restrictionSchema>

export const addRestriction = async ({ caseId, values }: { caseId: string; values: WcRestrictionValues }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const parsed = restrictionSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the restriction fields.' }

  const restriction = parsed.data

  if (restriction.end_date && restriction.end_date < restriction.start_date) return { error: 'The end date cannot be before the start date.' }

  const hasContent =
    restriction.stand_walk_hours || restriction.sit_hours || restriction.lifting_level || restriction.upper_extremity.length ||
    restriction.lower_extremity.length || restriction.push_pull_limit_lbs !== null || restriction.transitional_hours_per_day || restriction.description

  if (!hasContent) return { error: 'Choose at least one restriction or describe it.' }

  const { error } = await target.supabase.from('forge_wc_restrictions').insert({
    organization_id: target.organizationId,
    case_id: caseId,
    ...restriction,
    created_by: target.context.user.id,
    updated_by: target.context.user.id
  })

  if (error) return { error: wcWriteErrorMessage(error) }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'restriction',
    message: `Restrictions recorded from ${restriction.start_date}.`,
    actorUserId: target.context.user.id
  })

  refreshWc(caseId)

  return { message: 'Restrictions recorded.' }
}

export const liftRestriction = async ({ caseId, restrictionId }: { caseId: string; restrictionId: string }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const today = wcTodayIso()

  const { data: updated, error } = await target.supabase
    .from('forge_wc_restrictions')
    .update({ status: 'lifted', end_date: today, updated_by: target.context.user.id })
    .eq('organization_id', target.organizationId)
    .eq('case_id', caseId)
    .eq('id', restrictionId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle()

  if (error) return { error: wcWriteErrorMessage(error) }
  if (!updated) return { error: 'Active restriction not found.' }

  await writeWcActivity({ organizationId: target.organizationId, caseId, activityType: 'restriction', message: `Restrictions lifted ${today}.`, actorUserId: target.context.user.id })

  refreshWc(caseId)

  return { message: 'Restrictions lifted.' }
}

// ---------------------------------------------------------------------------
// Medical encounters (sensitive)
// ---------------------------------------------------------------------------

const encounterSchema = z.object({
  encounter_date: isoDate,
  provider_name: text(300),
  provider_specialty: text(200),
  facility: text(300),
  symptoms: text(),
  exam_findings: text(),
  diagnosis: text(),
  assessment: text(),
  treatment: text(),
  medication: text(),
  notes: text(4000),
  next_appointment_date: optionalDate
})

export type WcEncounterValues = z.input<typeof encounterSchema>

export const saveMedicalEncounter = async ({
  caseId,
  encounterId,
  values
}: {
  caseId: string
  encounterId?: string
  values: WcEncounterValues
}): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.medical.manage', caseId)

  if ('error' in target) return { error: target.error }

  const parsed = encounterSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the medical fields.' }
  if (parsed.data.encounter_date < target.record.injury_date) return { error: 'The visit cannot be before the injury date.' }

  const userId = target.context.user.id

  if (encounterId) {
    const { data: existing } = await target.supabase
      .from('forge_wc_medical_encounters')
      .select('id, created_by')
      .eq('organization_id', target.organizationId)
      .eq('case_id', caseId)
      .eq('id', encounterId)
      .maybeSingle()

    if (!existing) return { error: 'Medical visit not found.' }

    if (!canEditAuthoredNote({ userId, createdBy: existing.created_by, canConfigure: Boolean(hasPermission(target.context, 'workers_comp.configure')) })) {
      return { error: 'Only the person who recorded this visit, or a workers\' comp administrator, can edit it.' }
    }

    const { error } = await target.supabase.from('forge_wc_medical_encounters').update({ ...parsed.data, updated_by: userId }).eq('id', encounterId)

    if (error) return { error: error.message }
  } else {
    const { error } = await target.supabase.from('forge_wc_medical_encounters').insert({
      organization_id: target.organizationId,
      case_id: caseId,
      ...parsed.data,
      created_by: userId,
      updated_by: userId
    })

    if (error) return { error: error.message }
  }

  // Activity and audit never include medical content.
  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'medical',
    message: encounterId ? `Medical visit on ${parsed.data.encounter_date} updated.` : `Medical visit on ${parsed.data.encounter_date} recorded.`,
    actorUserId: userId
  })

  await writeForgeAudit({
    actorUserId: userId,
    organizationId: target.organizationId,
    action: encounterId ? 'workers_comp.medical_updated' : 'workers_comp.medical_recorded',
    entityType: 'workers_comp_case',
    entityId: caseId
  })

  refreshWc(caseId)

  return { message: encounterId ? 'Medical visit updated.' : 'Medical visit recorded.' }
}

// ---------------------------------------------------------------------------
// Weekly updates
// ---------------------------------------------------------------------------

export const saveWeeklyUpdate = async ({ caseId, weekOf, notes }: { caseId: string; weekOf: string; notes: string }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }
  if (target.record.status !== 'active') return { error: 'Weekly updates are recorded on active cases only.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return { error: 'Choose the week.' }

  const thursday = thursdayWeekOf(weekOf)
  const trimmed = notes.trim()

  if (!trimmed) return { error: 'Enter the weekly status note.' }
  if (trimmed.length > 4000) return { error: 'Keep the weekly note under 4,000 characters.' }

  const userId = target.context.user.id

  const { data: existing } = await target.supabase
    .from('forge_wc_weekly_updates')
    .select('id, created_by')
    .eq('case_id', caseId)
    .eq('week_of', thursday)
    .maybeSingle()

  if (existing) {
    if (!canEditAuthoredNote({ userId, createdBy: existing.created_by, canConfigure: Boolean(hasPermission(target.context, 'workers_comp.configure')) })) {
      return { error: 'Only the person who wrote this week\'s update, or a workers\' comp administrator, can change it.' }
    }

    const { error } = await target.supabase.from('forge_wc_weekly_updates').update({ notes: trimmed, updated_by: userId }).eq('id', existing.id)

    if (error) return { error: wcWriteErrorMessage(error) }
  } else {
    const { error } = await target.supabase.from('forge_wc_weekly_updates').insert({
      organization_id: target.organizationId,
      case_id: caseId,
      week_of: thursday,
      notes: trimmed,
      created_by: userId,
      updated_by: userId
    })

    if (error) return { error: wcWriteErrorMessage(error) }
  }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'weekly_update',
    message: `Weekly update for the week of ${thursday} ${existing ? 'edited' : 'recorded'}.`,
    actorUserId: userId
  })

  refreshWc(caseId)

  return { message: 'Weekly update saved.' }
}

// ---------------------------------------------------------------------------
// Carriers
// ---------------------------------------------------------------------------

const carrierSchema = z.object({
  name: z.string().trim().min(1, 'Carrier name is required.').max(300),
  policy_number: text(120),
  contact_name: text(300),
  phone: text(40),
  email: z.union([z.string().trim().email(), z.literal('')]).transform(value => value || null),
  claims_address: text(500)
})

export type WcCarrierValues = z.input<typeof carrierSchema>

export const saveCarrier = async ({ carrierId, values }: { carrierId?: string; values: WcCarrierValues }): Promise<ActionResult> => {
  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const parsed = carrierSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the carrier fields.' }

  const query = carrierId
    ? supabase.from('forge_wc_carriers').update({ ...parsed.data, updated_by: context.user.id }).eq('organization_id', organizationId).eq('id', carrierId)
    : supabase.from('forge_wc_carriers').insert({ ...parsed.data, organization_id: organizationId, created_by: context.user.id, updated_by: context.user.id })

  const { data, error } = await query.select('id').maybeSingle()

  if (error) return { error: error.code === '23505' ? 'An active carrier with this name already exists.' : error.message }
  if (!data) return { error: 'Carrier not found.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: carrierId ? 'workers_comp.carrier_updated' : 'workers_comp.carrier_created',
    entityType: 'workers_comp_carrier',
    entityId: data.id,
    afterValue: parsed.data
  })

  revalidatePath('/workers-comp/carriers')

  return { id: data.id, message: carrierId ? 'Carrier updated.' : 'Carrier added.' }
}

export const setCarrierActive = async ({ carrierId, active }: { carrierId: string; active: boolean }): Promise<ActionResult> => {
  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_wc_carriers')
    .update({ is_active: active, updated_by: context.user.id })
    .eq('organization_id', organizationId)
    .eq('id', carrierId)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.code === '23505' ? 'An active carrier with this name already exists.' : error.message }
  if (!data) return { error: 'Carrier not found.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: active ? 'workers_comp.carrier_reactivated' : 'workers_comp.carrier_deactivated',
    entityType: 'workers_comp_carrier',
    entityId: carrierId
  })

  revalidatePath('/workers-comp/carriers')

  return { message: active ? 'Carrier reactivated.' : 'Carrier deactivated. Existing cases keep it.' }
}

// ---------------------------------------------------------------------------
// Editing and removing work status periods and restrictions (1.0 PATCH / DELETE)
// ---------------------------------------------------------------------------

/** Loads a child row and applies the author-or-configure rule. */
const loadAuthoredChild = async (
  table: 'forge_wc_work_status_periods' | 'forge_wc_restrictions',
  target: { context: any; organizationId: string; supabase: any },
  caseId: string,
  rowId: string
) => {
  const { data: row } = await target.supabase
    .from(table)
    .select('*')
    .eq('organization_id', target.organizationId)
    .eq('case_id', caseId)
    .eq('id', rowId)
    .maybeSingle()

  if (!row) return { error: 'Record not found.' as const }

  const canConfigure = Boolean(hasPermission(target.context, 'workers_comp.configure'))

  if (!canEditAuthoredNote({ userId: target.context.user.id, createdBy: row.created_by, canConfigure })) {
    return { error: 'Only the person who recorded this, or a workers\' comp administrator, can change it.' as const }
  }

  return { row }
}

export const updateWorkStatusPeriod = async ({
  caseId,
  periodId,
  values
}: {
  caseId: string
  periodId: string
  values: WcPeriodValues
}): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const child = await loadAuthoredChild('forge_wc_work_status_periods', target, caseId, periodId)

  if ('error' in child) return { error: child.error }

  const parsed = periodSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the work status fields.' }

  const period = parsed.data

  if (period.end_date && period.end_date < period.start_date) return { error: 'The end date cannot be before the start date.' }
  if (period.start_date < target.record.injury_date) return { error: 'Work status periods cannot start before the injury date.' }

  const { error } = await target.supabase
    .from('forge_wc_work_status_periods')
    .update({ ...period, updated_by: target.context.user.id })
    .eq('id', periodId)

  if (error) return { error: wcWriteErrorMessage(error) }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'work_status',
    message: `Work status period corrected to ${WC_WORK_STATUS_LABELS[period.work_status]} from ${period.start_date}${period.end_date ? ` to ${period.end_date}` : ''}.`,
    actorUserId: target.context.user.id,
    metadata: { period_id: periodId, before: { work_status: child.row.work_status, start_date: child.row.start_date, end_date: child.row.end_date } }
  })

  const syncNote = await syncAfterChange(target, caseId)

  refreshWc(caseId)

  return { message: `Work status period updated.${syncNote}` }
}

export const deleteWorkStatusPeriod = async ({ caseId, periodId }: { caseId: string; periodId: string }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const child = await loadAuthoredChild('forge_wc_work_status_periods', target, caseId, periodId)

  if ('error' in child) return { error: child.error }

  const { error } = await target.supabase.from('forge_wc_work_status_periods').delete().eq('id', periodId)

  if (error) return { error: wcWriteErrorMessage(error) }

  const removed = child.row

  // History keeps what was removed so the day counts stay explainable.
  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'work_status',
    message: `Removed work status period: ${WC_WORK_STATUS_LABELS[removed.work_status as keyof typeof WC_WORK_STATUS_LABELS]} from ${removed.start_date}${removed.end_date ? ` to ${removed.end_date}` : ''}.`,
    actorUserId: target.context.user.id,
    metadata: { removed }
  })

  const syncNote = await syncAfterChange(target, caseId)

  refreshWc(caseId)

  return { message: `Work status period removed.${syncNote}` }
}

export const updateRestriction = async ({
  caseId,
  restrictionId,
  values
}: {
  caseId: string
  restrictionId: string
  values: WcRestrictionValues
}): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const child = await loadAuthoredChild('forge_wc_restrictions', target, caseId, restrictionId)

  if ('error' in child) return { error: child.error }

  const parsed = restrictionSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the restriction fields.' }
  if (parsed.data.end_date && parsed.data.end_date < parsed.data.start_date) return { error: 'The end date cannot be before the start date.' }

  const { error } = await target.supabase
    .from('forge_wc_restrictions')
    .update({ ...parsed.data, updated_by: target.context.user.id })
    .eq('id', restrictionId)

  if (error) return { error: wcWriteErrorMessage(error) }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'restriction',
    message: `Restrictions from ${parsed.data.start_date} corrected.`,
    actorUserId: target.context.user.id,
    metadata: { restriction_id: restrictionId }
  })

  refreshWc(caseId)

  return { message: 'Restrictions updated.' }
}

export const deleteRestriction = async ({ caseId, restrictionId }: { caseId: string; restrictionId: string }): Promise<ActionResult> => {
  const target = await loadCase('workers_comp.edit', caseId)

  if ('error' in target) return { error: target.error }

  const child = await loadAuthoredChild('forge_wc_restrictions', target, caseId, restrictionId)

  if ('error' in child) return { error: child.error }

  const { error } = await target.supabase.from('forge_wc_restrictions').delete().eq('id', restrictionId)

  if (error) return { error: wcWriteErrorMessage(error) }

  await writeWcActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'restriction',
    message: `Removed restrictions recorded from ${child.row.start_date}.`,
    actorUserId: target.context.user.id,
    metadata: { removed: child.row }
  })

  refreshWc(caseId)

  return { message: 'Restrictions removed.' }
}

// ---------------------------------------------------------------------------
// Weekly status email settings
// ---------------------------------------------------------------------------

export const saveWcSettings = async ({
  enabled,
  recipients,
  weekday,
  hour
}: {
  enabled: boolean
  recipients: string
  weekday: number
  hour: number
}): Promise<ActionResult> => {
  const context = await requireTenantPermission('workers_comp.configure')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const parsed = parseEmailRecipients(recipients)

  if (parsed.invalid.length) return { error: `Not a valid email address: ${parsed.invalid.join(', ')}` }
  if (parsed.valid.length > 50) return { error: 'Use 50 recipients or fewer. A distribution list address works well.' }
  if (enabled && !parsed.valid.length) return { error: 'Add at least one recipient before turning the weekly email on.' }
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'Choose a day of the week.' }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { error: 'Choose an hour.' }

  const values = {
    weekly_email_enabled: enabled,
    weekly_email_recipients: parsed.valid,
    weekly_email_weekday: weekday,
    weekly_email_hour: hour,
    updated_by: context.user.id
  }

  const { error } = await supabase.from('forge_wc_settings').upsert({ organization_id: organizationId, ...values }, { onConflict: 'organization_id' })

  if (error) return { error: error.message }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'workers_comp.settings_updated',
    entityType: 'workers_comp_settings',
    entityId: organizationId,
    afterValue: { weekly_email_enabled: enabled, recipient_count: parsed.valid.length, weekday, hour }
  })

  revalidatePath('/workers-comp/settings')

  return { message: 'Weekly email settings saved.' }
}
