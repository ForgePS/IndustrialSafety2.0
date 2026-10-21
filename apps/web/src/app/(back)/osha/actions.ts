'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { incidentWithinScope } from '@/lib/forgeIncidents'
import {
  buildOshaSeedFromIncident,
  oshaRecordWithinScope,
  oshaWriteErrorMessage,
  writeOshaActivity
} from '@/lib/forgeOsha'
import { OSHA_CASE_OUTCOME_LABELS, OSHA_RECORDABILITY_LABELS, fillBlanks, validateOshaClassification } from '@/lib/forgeOshaRules'
import type { OshaCaseOutcome, OshaRecordability } from '@/lib/forgeOshaRules'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type ActionResult = { error?: string; message?: string; id?: string }

const text = (max = 2000) =>
  z
    .string()
    .max(max)
    .transform(value => value.trim() || null)

const date = z
  .string()
  .transform(value => value.trim() || null)
  .refine(value => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter dates as YYYY-MM-DD.')

const time = z
  .string()
  .transform(value => value.trim() || null)
  .refine(value => value === null || /^\d{2}:\d{2}$/.test(value), 'Enter times as HH:MM.')

const optionalBoolean = z.union([z.boolean(), z.null()])

const caseSchema = z.object({
  employee_name: z.string().trim().min(1, 'Employee name is required.').max(300),
  job_title: text(300),
  injury_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Injury date is required.'),
  event_location: text(500),
  injury_description: text(2000),

  recordability: z.enum(['pending', 'recordable', 'not_recordable']),
  not_recordable_reason: text(2000),
  is_privacy_case: z.boolean(),
  case_outcome: z.union([z.enum(['death', 'days_away', 'job_transfer_restriction', 'other_recordable']), z.literal('')]).transform(value => value || null),
  case_type: z
    .union([z.enum(['injury', 'skin_disorder', 'respiratory_condition', 'poisoning', 'hearing_loss', 'other_illness']), z.literal('')])
    .transform(value => value || null),
  days_away: z.coerce.number(),
  restricted_days: z.coerce.number(),
  date_of_death: date,

  employee_street: text(300),
  employee_city: text(120),
  employee_state: text(60),
  employee_zip: text(20),
  employee_date_of_birth: date,
  employee_date_hired: date,
  employee_sex: z.union([z.enum(['male', 'female']), z.literal('')]).transform(value => value || null),

  physician_name: text(300),
  treatment_facility: text(300),
  treatment_street: text(300),
  treatment_city: text(120),
  treatment_state: text(60),
  treatment_zip: text(20),
  treated_in_er: optionalBoolean,
  hospitalized_overnight: optionalBoolean,

  time_began_work: time,
  time_of_event: time,
  time_cannot_be_determined: z.boolean(),
  activity_before: text(),
  what_happened: text(),
  injury_or_illness: text(),
  object_or_substance: text(),

  completed_by_name: text(300),
  completed_by_title: text(300),
  completed_by_phone: text(40),
  completed_date: date
})

export type OshaCaseValues = z.input<typeof caseSchema>

const summarySchema = z.object({
  establishment_name: text(300),
  street: text(300),
  city: text(120),
  state: text(60),
  zip: text(20),
  industry_description: text(500),
  naics_code: z
    .string()
    .transform(value => value.replace(/\D/g, '') || null)
    .refine(value => value === null || (value.length >= 2 && value.length <= 6), 'NAICS codes have 2 to 6 digits.'),
  annual_average_employees: z
    .string()
    .transform(value => (value.trim() === '' ? null : Number(value)))
    .refine(value => value === null || (Number.isInteger(value) && value >= 0), 'Annual average employees must be a whole number.'),
  total_hours_worked: z
    .string()
    .transform(value => (value.trim() === '' ? null : Number(value.replace(/,/g, ''))))
    .refine(value => value === null || (Number.isFinite(value) && value >= 0), 'Total hours worked must be a number of 0 or more.')
})

export type OshaSummaryValues = z.input<typeof summarySchema>

const refreshOsha = (caseId?: string, incidentId?: string | null) => {
  revalidatePath('/osha')
  revalidatePath('/osha/log')
  revalidatePath('/osha/summary')
  if (caseId) revalidatePath(`/osha/cases/${caseId}`)
  if (incidentId) revalidatePath(`/incidents/${incidentId}`)
}

/** Loads a case and confirms the permission reaches it. */
const loadCase = async (permissionKey: 'osha.edit' | 'osha.view', caseId: string) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase.from('forge_osha_cases').select('*').eq('organization_id', organizationId).eq('id', caseId).maybeSingle()

  if (!record) return { error: 'OSHA case not found.' as const }

  const allowed = await oshaRecordWithinScope({ organizationId, userId: context.user.id, scope: context.permission.scope, record })

  if (!allowed) return { error: 'This OSHA case is outside your access scope.' as const }

  return { context, organizationId, supabase, record }
}

const actorName = async (supabase: any, organizationId: string, userId: string, fallback: string | null) => {
  const { data } = await supabase
    .from('forge_personnel')
    .select('first_name, last_name')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', userId)
    .is('archived_at', null)
    .maybeSingle()

  return data ? `${data.first_name} ${data.last_name}` : fallback
}

export const openOshaCaseFromIncident = async ({
  incidentId,
  personnelId
}: {
  incidentId: string
  personnelId: string
}): Promise<ActionResult> => {
  const context = await requireTenantPermission('osha.edit')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: incident } = await supabase
    .from('forge_incidents')
    .select('*, locations(name, code)')
    .eq('organization_id', organizationId)
    .eq('id', incidentId)
    .maybeSingle()

  if (!incident) return { error: 'Incident not found.' }
  if (!incident.location_id) return { error: 'Set the incident Location first. OSHA logs are kept per establishment (Location).' }

  const inScope = await oshaRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: { organization_id: organizationId, location_id: incident.location_id, division_id: incident.division_id, created_by: context.user.id }
  })

  if (!inScope) return { error: 'This incident\'s Location is outside your OSHA access scope.' }

  const incidentView = context.access.effective.find(item => item.permissionKey === 'incidents.view' && item.allowed)

  const canSeeIncident = incidentView
    ? await incidentWithinScope({ organizationId, userId: context.user.id, scope: incidentView.scope, incident })
    : false

  if (!canSeeIncident) return { error: 'This incident is outside your incident access scope.' }

  const { data: person } = await supabase
    .from('forge_personnel')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('id', personnelId)
    .maybeSingle()

  if (!person) return { error: 'Choose the injured or ill employee from this company\'s personnel.' }

  const { data: existing } = await supabase
    .from('forge_osha_cases')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('incident_id', incidentId)
    .eq('personnel_id', personnelId)
    .neq('status', 'voided')
    .maybeSingle()

  if (existing) return { id: existing.id, message: 'This employee already has an OSHA case for this incident.' }

  const seed = await buildOshaSeedFromIncident({
    organizationId,
    incident,
    personnelId,
    completedByName: await actorName(supabase, organizationId, context.user.id, context.user.email || null)
  })

  if (!seed.employee_name || !seed.injury_date) return { error: 'The incident needs an occurrence date and the employee needs a name.' }

  const year = Number(seed.injury_date.slice(0, 4))

  const { data: caseNumber, error: numberError } = await supabase.rpc('next_forge_osha_case_number', {
    p_organization_id: organizationId,
    p_location_id: incident.location_id,
    p_year: year
  })

  if (numberError || !caseNumber) return { error: numberError?.message || 'Unable to assign a case number.' }

  const { data: created, error } = await supabase
    .from('forge_osha_cases')
    .insert({
      organization_id: organizationId,
      case_number: caseNumber,
      incident_id: incidentId,
      personnel_id: personnelId,
      location_id: incident.location_id,
      division_id: incident.division_id,
      ...seed,
      completed_date: new Date().toISOString().slice(0, 10),
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('id, case_number')
    .single()

  if (error || !created) return { error: oshaWriteErrorMessage(error) }

  await supabase
    .from('forge_incidents')
    .update({ osha_review_flag: true, updated_at: new Date().toISOString(), updated_by: context.user.id })
    .eq('id', incidentId)
    .eq('organization_id', organizationId)

  await supabase.from('forge_incident_activity').insert({
    organization_id: organizationId,
    incident_id: incidentId,
    activity_type: 'osha_case_opened',
    message: `OSHA case ${created.case_number} opened.`,
    actor_user_id: context.user.id
  })

  await writeOshaActivity({
    organizationId,
    caseId: created.id,
    activityType: 'opened',
    message: `Case ${created.case_number} opened from incident ${incident.incident_number}.`,
    actorUserId: context.user.id
  })

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'osha.case_opened',
    entityType: 'osha_case',
    entityId: created.id,
    afterValue: { case_number: created.case_number, incident_id: incidentId }
  })

  refreshOsha(created.id, incidentId)

  return { id: created.id, message: `OSHA case ${created.case_number} opened.` }
}

export const saveOshaCase = async ({
  caseId,
  rowVersion,
  values
}: {
  caseId: string
  rowVersion: number
  values: OshaCaseValues
}): Promise<ActionResult> => {
  const target = await loadCase('osha.edit', caseId)

  if ('error' in target) return { error: target.error }
  if (target.record.status === 'voided') return { error: 'Voided cases cannot be edited.' }

  const parsed = caseSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the case fields.' }

  const payload = parsed.data

  if (payload.recordability !== 'recordable') {
    payload.case_outcome = null
    payload.is_privacy_case = false
    payload.date_of_death = null
  }

  const classificationError = validateOshaClassification(payload)

  if (classificationError) return { error: classificationError }

  const today = new Date().toISOString().slice(0, 10)

  if (payload.injury_date > today) return { error: 'Injury date cannot be in the future.' }

  if (payload.injury_date.slice(0, 4) !== String(target.record.calendar_year)) {
    return { error: 'The injury year sets the log this case belongs to. Void this case and open a new one to move it to another year.' }
  }

  const { data: updated, error } = await target.supabase
    .from('forge_osha_cases')
    .update({ ...payload, updated_by: target.context.user.id })
    .eq('id', caseId)
    .eq('organization_id', target.organizationId)
    .eq('row_version', rowVersion)
    .select('*')
    .maybeSingle()

  if (error) return { error: oshaWriteErrorMessage(error) }
  if (!updated) return { error: 'This case changed since you opened it. Reload to see the latest version, then reapply your changes.' }

  const before = target.record
  const changedFields = Object.keys(payload).filter(key => (before as any)[key] !== (updated as any)[key])

  const notes: string[] = []

  if (before.recordability !== updated.recordability) {
    notes.push(`Recordability: ${OSHA_RECORDABILITY_LABELS[updated.recordability as OshaRecordability]}`)
  }

  if (before.case_outcome !== updated.case_outcome && updated.case_outcome) {
    notes.push(`Outcome: ${OSHA_CASE_OUTCOME_LABELS[updated.case_outcome as OshaCaseOutcome]}`)
  }

  if (before.days_away !== updated.days_away || before.restricted_days !== updated.restricted_days) {
    notes.push(`Days away ${updated.days_away}, restricted ${updated.restricted_days}`)
  }

  if (before.is_privacy_case !== updated.is_privacy_case) notes.push(updated.is_privacy_case ? 'Marked privacy case' : 'Privacy case removed')

  if (changedFields.length) {
    await writeOshaActivity({
      organizationId: target.organizationId,
      caseId,
      activityType: 'updated',
      message: notes.length ? notes.join('. ') + '.' : 'Case details updated.',
      actorUserId: target.context.user.id,
      metadata: { changed_fields: changedFields }
    })

    // Field names only: OSHA values contain medical details.
    await writeForgeAudit({
      actorUserId: target.context.user.id,
      organizationId: target.organizationId,
      action: 'osha.case_updated',
      entityType: 'osha_case',
      entityId: caseId,
      afterValue: { changed_fields: changedFields, row_version: updated.row_version }
    })
  }

  refreshOsha(caseId, updated.incident_id)

  return { message: 'OSHA case saved.' }
}

export const fillOshaCaseFromIncident = async ({ caseId, rowVersion }: { caseId: string; rowVersion: number }): Promise<ActionResult> => {
  const target = await loadCase('osha.edit', caseId)

  if ('error' in target) return { error: target.error }
  if (target.record.status === 'voided') return { error: 'Voided cases cannot be edited.' }
  if (!target.record.incident_id) return { error: 'This case is not linked to an incident.' }

  const { data: incident } = await target.supabase
    .from('forge_incidents')
    .select('*, locations(name, code)')
    .eq('organization_id', target.organizationId)
    .eq('id', target.record.incident_id)
    .maybeSingle()

  if (!incident) return { error: 'The linked incident was not found.' }

  const seed = await buildOshaSeedFromIncident({
    organizationId: target.organizationId,
    incident,
    personnelId: target.record.personnel_id,
    completedByName: null
  })

  // Injury date and employee name are already required on the case; never replace them.
  const rest: Partial<typeof seed> = { ...seed }

  delete rest.injury_date
  delete rest.employee_name
  const changes = fillBlanks(target.record, rest)
  const fields = Object.keys(changes)

  if (!fields.length) return { message: 'Nothing to fill. Every field Forge knows is already entered.' }

  const { data: updated, error } = await target.supabase
    .from('forge_osha_cases')
    .update({ ...changes, updated_by: target.context.user.id })
    .eq('id', caseId)
    .eq('organization_id', target.organizationId)
    .eq('row_version', rowVersion)
    .select('id')
    .maybeSingle()

  if (error) return { error: oshaWriteErrorMessage(error) }
  if (!updated) return { error: 'This case changed since you opened it. Reload and try again.' }

  await writeOshaActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: 'filled_from_incident',
    message: `Filled ${fields.length} blank field${fields.length === 1 ? '' : 's'} from the incident and personnel record.`,
    actorUserId: target.context.user.id,
    metadata: { filled_fields: fields }
  })

  refreshOsha(caseId)

  return { message: `Filled ${fields.length} blank field${fields.length === 1 ? '' : 's'}.` }
}

export const setOshaCaseStatus = async ({
  caseId,
  rowVersion,
  action,
  reason
}: {
  caseId: string
  rowVersion: number
  action: 'close' | 'reopen' | 'void'
  reason?: string
}): Promise<ActionResult> => {
  const target = await loadCase('osha.edit', caseId)

  if ('error' in target) return { error: target.error }

  const record = target.record
  const now = new Date().toISOString()
  const userId = target.context.user.id
  let update: Record<string, unknown>
  let message: string

  if (action === 'close') {
    if (record.status !== 'open') return { error: 'Only open cases can be closed.' }
    if (record.recordability === 'pending') return { error: 'Decide whether the case is recordable before closing it.' }
    update = { status: 'closed', closed_at: now, closed_by: userId }
    message = 'Case closed.'
  } else if (action === 'reopen') {
    if (record.status !== 'closed') return { error: 'Only closed cases can be reopened.' }
    update = { status: 'open', closed_at: null, closed_by: null }
    message = 'Case reopened.'
  } else {
    if (record.status === 'voided') return { error: 'This case is already voided.' }
    if (!reason?.trim()) return { error: 'A reason is required to void a case.' }
    update = { status: 'voided', voided_at: now, voided_by: userId, void_reason: reason.trim() }
    message = 'Case voided. It no longer appears on the log.'
  }

  const { data: updated, error } = await target.supabase
    .from('forge_osha_cases')
    .update({ ...update, updated_by: userId })
    .eq('id', caseId)
    .eq('organization_id', target.organizationId)
    .eq('row_version', rowVersion)
    .select('id')
    .maybeSingle()

  if (error) return { error: oshaWriteErrorMessage(error) }
  if (!updated) return { error: 'This case changed since you opened it. Reload and try again.' }

  await writeOshaActivity({
    organizationId: target.organizationId,
    caseId,
    activityType: action === 'void' ? 'voided' : action === 'close' ? 'closed' : 'reopened',
    message: action === 'void' ? `Case voided: ${reason?.trim()}` : message,
    actorUserId: userId
  })

  await writeForgeAudit({
    actorUserId: userId,
    organizationId: target.organizationId,
    action: `osha.case_${action === 'void' ? 'voided' : action === 'close' ? 'closed' : 'reopened'}`,
    entityType: 'osha_case',
    entityId: caseId,
    reason: reason?.trim() || undefined
  })

  refreshOsha(caseId, record.incident_id)

  return { message }
}

const loadSummaryLocation = async (permissionKey: 'osha.edit' | 'osha.certify', locationId: string) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: location } = await supabase
    .from('locations')
    .select('id, division_id')
    .eq('organization_id', organizationId)
    .eq('id', locationId)
    .maybeSingle()

  if (!location) return { error: 'Establishment not found.' as const }

  const allowed = await oshaRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: { organization_id: organizationId, location_id: location.id, division_id: location.division_id, created_by: context.user.id }
  })

  if (!allowed) return { error: 'This establishment is outside your OSHA access scope.' as const }

  return { context, organizationId, supabase }
}

export const saveOshaEstablishmentYear = async ({
  locationId,
  year,
  rowVersion,
  values
}: {
  locationId: string
  year: number
  rowVersion: number | null
  values: OshaSummaryValues
}): Promise<ActionResult> => {
  const target = await loadSummaryLocation('osha.edit', locationId)

  if ('error' in target) return { error: target.error }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: 'Choose a valid year.' }

  const parsed = summarySchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the summary fields.' }

  const { data: existing } = await target.supabase
    .from('forge_osha_establishment_years')
    .select('id, status, row_version')
    .eq('organization_id', target.organizationId)
    .eq('location_id', locationId)
    .eq('year', year)
    .maybeSingle()

  if (existing?.status === 'certified') return { error: 'This summary is certified. Reopen it before making changes.' }

  const userId = target.context.user.id

  const result = existing
    ? await target.supabase
        .from('forge_osha_establishment_years')
        .update({ ...parsed.data, updated_by: userId })
        .eq('id', existing.id)
        .eq('row_version', rowVersion ?? -1)
        .select('id')
        .maybeSingle()
    : await target.supabase
        .from('forge_osha_establishment_years')
        .insert({ ...parsed.data, organization_id: target.organizationId, location_id: locationId, year, created_by: userId, updated_by: userId })
        .select('id')
        .single()

  if (result.error) return { error: result.error.message }
  if (!result.data) return { error: 'This summary changed since you opened it. Reload and try again.' }

  await writeForgeAudit({
    actorUserId: userId,
    organizationId: target.organizationId,
    action: 'osha.summary_saved',
    entityType: 'osha_establishment_year',
    entityId: result.data.id,
    afterValue: { year, location_id: locationId, ...parsed.data }
  })

  refreshOsha()

  return { id: result.data.id, message: 'Summary saved.' }
}

const certifySchema = z.object({
  certifier_name: z.string().trim().min(1, 'Enter the company executive certifying the summary.').max(300),
  certifier_title: z.string().trim().min(1, 'Enter the executive\'s title.').max(300),
  certifier_phone: z.string().max(40),
  certification_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the certification date.')
})

export const certifyOshaEstablishmentYear = async ({
  summaryId,
  rowVersion,
  values
}: {
  summaryId: string
  rowVersion: number
  values: z.input<typeof certifySchema>
}): Promise<ActionResult> => {
  const context = await requireTenantPermission('osha.certify')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: summary } = await supabase
    .from('forge_osha_establishment_years')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', summaryId)
    .maybeSingle()

  if (!summary) return { error: 'Save the establishment summary before certifying it.' }

  const target = await loadSummaryLocation('osha.certify', summary.location_id)

  if ('error' in target) return { error: target.error }

  if (summary.annual_average_employees == null || summary.total_hours_worked == null) {
    return { error: 'Enter annual average employees and total hours worked before certifying.' }
  }

  const parsed = certifySchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the certification fields.' }

  const { error } = await supabase.rpc('forge_certify_osha_establishment_year', {
    p_organization_id: organizationId,
    p_summary_id: summaryId,
    p_expected_row_version: rowVersion,
    p_certifier_name: parsed.data.certifier_name,
    p_certifier_title: parsed.data.certifier_title,
    p_certifier_phone: parsed.data.certifier_phone,
    p_certification_date: parsed.data.certification_date,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: error.message }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'osha.summary_certified',
    entityType: 'osha_establishment_year',
    entityId: summaryId,
    afterValue: { year: summary.year, location_id: summary.location_id, certifier_title: parsed.data.certifier_title }
  })

  refreshOsha()

  return { message: `${summary.year} summary certified.` }
}

export const reopenOshaEstablishmentYear = async ({
  summaryId,
  rowVersion,
  reason
}: {
  summaryId: string
  rowVersion: number
  reason: string
}): Promise<ActionResult> => {
  const context = await requireTenantPermission('osha.certify')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  if (!reason.trim()) return { error: 'A reason is required to reopen a certified summary.' }

  const { data: summary } = await supabase
    .from('forge_osha_establishment_years')
    .select('id, location_id, year, status')
    .eq('organization_id', organizationId)
    .eq('id', summaryId)
    .maybeSingle()

  if (!summary) return { error: 'Summary not found.' }
  if (summary.status !== 'certified') return { error: 'Only certified summaries can be reopened.' }

  const target = await loadSummaryLocation('osha.certify', summary.location_id)

  if ('error' in target) return { error: target.error }

  const { data: updated, error } = await supabase
    .from('forge_osha_establishment_years')
    .update({ status: 'draft', updated_by: context.user.id })
    .eq('id', summaryId)
    .eq('row_version', rowVersion)
    .select('id')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!updated) return { error: 'This summary changed since you opened it. Reload and try again.' }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'osha.summary_reopened',
    entityType: 'osha_establishment_year',
    entityId: summaryId,
    reason: reason.trim(),
    afterValue: { year: summary.year, location_id: summary.location_id }
  })

  refreshOsha()

  return { message: 'Summary reopened. Certify it again after making changes.' }
}
