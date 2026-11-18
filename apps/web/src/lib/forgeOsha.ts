import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { oshaRates, zonedDateTimeParts } from '@/lib/forgeOshaRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/** Used to turn incident timestamps into an OSHA injury date and time. */
export const OSHA_TIME_ZONE = process.env.FORGE_DEFAULT_TIME_ZONE || 'America/Chicago'

export type OshaScopedRecord = {
  organization_id: string
  location_id: string | null
  division_id: string | null
  created_by?: string | null
}

export const oshaRecordWithinScope = async ({
  organizationId,
  userId,
  scope,
  record
}: {
  organizationId: string
  userId: string
  scope: string | null
  record: OshaScopedRecord
}) => {
  if (record.organization_id !== organizationId) return false

  switch (scope) {
    case 'organization':
      return true

    case 'own':
    case 'assigned':
      return record.created_by === userId

    case 'location': {
      const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })

      return Boolean(record.location_id && locationIds.includes(record.location_id))
    }

    case 'division': {
      const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })

      return Boolean(record.division_id && divisionIds.includes(record.division_id))
    }

    default:
      return false
  }
}

/** Locations (OSHA establishments) the permission reaches. Null means every Location. */
export const oshaLocationIdsInScope = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}): Promise<string[] | null> => {
  if (permission.scope === 'organization') return null

  if (permission.scope === 'location') {
    const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })

    return locationIds
  }

  if (permission.scope === 'division') {
    const { divisionIds } = await getTenantScopeAssignments({ organizationId, userId })

    if (!divisionIds.length) return []

    const supabase = createServiceRoleClient() as any

    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('organization_id', organizationId)
      .in('division_id', divisionIds)

    return (data || []).map((row: any) => row.id)
  }

  return []
}

export const getOshaLocations = async ({ organizationId, locationIds }: { organizationId: string; locationIds: string[] | null }) => {
  const supabase = createServiceRoleClient() as any
  let query = supabase
    .from('locations')
    .select('id, name, code, address_line_1, city, state_region, postal_code, is_active')
    .eq('organization_id', organizationId)
    .order('name')

  if (locationIds) {
    if (!locationIds.length) return []
    query = query.in('id', locationIds)
  }

  const { data, error } = await query

  if (error) throw new Error(`Unable to load establishments: ${error.message}`)

  return data || []
}

export const getScopedOshaCases = async ({
  organizationId,
  userId,
  permission,
  year,
  locationId,
  includeVoided = false
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  year: number
  locationId?: string | null
  includeVoided?: boolean
}) => {
  const supabase = createServiceRoleClient() as any
  let query = supabase
    .from('forge_osha_cases')
    .select('*, locations(name, code), forge_incidents(incident_number)')
    .eq('organization_id', organizationId)
    .eq('calendar_year', year)
    .order('case_number')

  if (!includeVoided) query = query.neq('status', 'voided')
  if (locationId) query = query.eq('location_id', locationId)

  const { data, error } = await query

  if (error) throw new Error(`Unable to load OSHA cases: ${error.message}`)

  const rows = data || []

  if (permission.scope === 'organization') return rows

  const visible = await Promise.all(
    rows.map(async (row: any) => ({
      row,
      allowed: await oshaRecordWithinScope({ organizationId, userId, scope: permission.scope, record: row })
    }))
  )

  return visible.filter(item => item.allowed).map(item => item.row)
}

export type OshaTotals = {
  deaths: number
  daysAwayCases: number
  transferCases: number
  otherCases: number
  daysAway: number
  restrictedDays: number
  injuries: number
  skinDisorders: number
  respiratoryConditions: number
  poisonings: number
  hearingLoss: number
  otherIllnesses: number
  recordableCases: number
}

const emptyTotals = (): OshaTotals => ({
  deaths: 0,
  daysAwayCases: 0,
  transferCases: 0,
  otherCases: 0,
  daysAway: 0,
  restrictedDays: 0,
  injuries: 0,
  skinDisorders: 0,
  respiratoryConditions: 0,
  poisonings: 0,
  hearingLoss: 0,
  otherIllnesses: 0,
  recordableCases: 0
})

const fromRow = (row: any): OshaTotals => ({
  deaths: row.deaths,
  daysAwayCases: row.days_away_cases,
  transferCases: row.transfer_cases,
  otherCases: row.other_cases,
  daysAway: row.days_away,
  restrictedDays: row.restricted_days,
  injuries: row.injuries,
  skinDisorders: row.skin_disorders,
  respiratoryConditions: row.respiratory_conditions,
  poisonings: row.poisonings,
  hearingLoss: row.hearing_loss,
  otherIllnesses: row.other_illnesses,
  recordableCases: row.recordable_cases
})

export const certifiedTotals = (summary: any): OshaTotals | null =>
  summary?.status === 'certified'
    ? {
        deaths: summary.certified_deaths,
        daysAwayCases: summary.certified_days_away_cases,
        transferCases: summary.certified_transfer_cases,
        otherCases: summary.certified_other_cases,
        daysAway: summary.certified_days_away,
        restrictedDays: summary.certified_restricted_days,
        injuries: summary.certified_injuries,
        skinDisorders: summary.certified_skin_disorders,
        respiratoryConditions: summary.certified_respiratory_conditions,
        poisonings: summary.certified_poisonings,
        hearingLoss: summary.certified_hearing_loss,
        otherIllnesses: summary.certified_other_illnesses,
        recordableCases:
          summary.certified_deaths +
          summary.certified_days_away_cases +
          summary.certified_transfer_cases +
          summary.certified_other_cases
      }
    : null

export type OshaEstablishmentYear = {
  location: any
  summary: any
  totals: OshaTotals
  hoursWorked: number | null
  trir: number | null
  dart: number | null
}

export const totalsDiffer = (a: OshaTotals, b: OshaTotals) =>
  (Object.keys(a) as Array<keyof OshaTotals>).some(key => a[key] !== b[key])

/**
 * Form 300A totals and rates per establishment for a year, plus a combined row.
 * Rates use the hours entered on each establishment's 300A summary.
 */
export const getOshaYearSummary = async ({
  organizationId,
  year,
  locationIds
}: {
  organizationId: string
  year: number
  locationIds: string[] | null
}) => {
  const supabase = createServiceRoleClient() as any
  const locations = await getOshaLocations({ organizationId, locationIds })
  const ids = locations.map((location: any) => location.id)

  if (!ids.length) {
    return { establishments: [], combined: { totals: emptyTotals(), hoursWorked: null, trir: null, dart: null } }
  }

  const [{ data: totalRows, error: totalsError }, { data: summaries, error: summaryError }] = await Promise.all([
    supabase.rpc('forge_osha_300a_totals', { p_organization_id: organizationId, p_year: year, p_location_ids: ids }),
    supabase.from('forge_osha_establishment_years').select('*').eq('organization_id', organizationId).eq('year', year).in('location_id', ids)
  ])

  if (totalsError) throw new Error(`Unable to compute OSHA totals: ${totalsError.message}`)
  if (summaryError) throw new Error(`Unable to load establishment summaries: ${summaryError.message}`)

  const totalsByLocation = new Map<string, OshaTotals>((totalRows || []).map((row: any) => [row.location_id, fromRow(row)]))
  const summaryByLocation = new Map<string, any>((summaries || []).map((row: any) => [row.location_id, row]))

  const establishments: OshaEstablishmentYear[] = locations.map((location: any) => {
    const totals = totalsByLocation.get(location.id) || emptyTotals()
    const summary = summaryByLocation.get(location.id) || null
    const hoursWorked = summary?.total_hours_worked != null ? Number(summary.total_hours_worked) : null

    return {
      location,
      summary,
      totals,
      hoursWorked,
      ...oshaRates({
        recordableCases: totals.recordableCases,
        daysAwayCases: totals.daysAwayCases,
        transferCases: totals.transferCases,
        hoursWorked
      })
    }
  })

  const combinedTotals = emptyTotals()

  for (const item of establishments) {
    for (const key of Object.keys(combinedTotals) as Array<keyof OshaTotals>) combinedTotals[key] += item.totals[key]
  }

  // Combined rates are only meaningful when every establishment with cases has reported hours.
  const missingHours = establishments.some(item => item.hoursWorked === null && item.totals.recordableCases > 0)

  const hoursWorked = missingHours
    ? null
    : establishments.reduce((sum, item) => sum + (item.hoursWorked || 0), 0) || null

  return {
    establishments,
    combined: {
      totals: combinedTotals,
      hoursWorked,
      ...oshaRates({
        recordableCases: combinedTotals.recordableCases,
        daysAwayCases: combinedTotals.daysAwayCases,
        transferCases: combinedTotals.transferCases,
        hoursWorked
      })
    }
  }
}

/**
 * Form 300 and 301 values Forge already knows from the incident, the employee's personnel record and
 * their sensitive profile. Used when a case is opened and by "Fill blanks from incident".
 */
export const buildOshaSeedFromIncident = async ({
  organizationId,
  incident,
  personnelId,
  completedByName
}: {
  organizationId: string
  incident: any
  personnelId: string | null
  completedByName: string | null
}) => {
  const supabase = createServiceRoleClient() as any
  const occurred = incident.occurred_at ? zonedDateTimeParts(incident.occurred_at, OSHA_TIME_ZONE) : null

  let person: any = null
  let sensitive: any = null

  if (personnelId) {
    const [{ data: personRow }, { data: sensitiveRow }] = await Promise.all([
      supabase
        .from('forge_personnel')
        .select('id, first_name, middle_name, last_name, suffix, job_title, hire_date, position:forge_positions!forge_personnel_position_id_fkey(name)')
        .eq('organization_id', organizationId)
        .eq('id', personnelId)
        .maybeSingle(),
      supabase.from('forge_personnel_sensitive').select('*').eq('organization_id', organizationId).eq('personnel_id', personnelId).maybeSingle()
    ])

    person = personRow
    sensitive = sensitiveRow
  }

  // Form 300 (E) is a short "where": the establishment area. The narrative goes in (F) and Form 301.
  const eventLocation = incident.locations?.name || ''

  return {
    employee_name: person ? [person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ') : null,
    job_title: person?.position?.name || person?.job_title || null,
    injury_date: occurred?.date || null,
    time_of_event: occurred?.time || null,
    event_location: eventLocation || null,
    injury_description: incident.summary || null,
    what_happened: incident.description || null,
    employee_street: [sensitive?.address_line1, sensitive?.address_line2].filter(Boolean).join(', ') || null,
    employee_city: sensitive?.city || null,
    employee_state: sensitive?.state_region || null,
    employee_zip: sensitive?.postal_code || null,
    employee_date_of_birth: sensitive?.date_of_birth || null,
    employee_date_hired: person?.hire_date || null,

    // Form 301 only offers male / female.
    employee_sex: sensitive?.sex === 'male' || sensitive?.sex === 'female' ? sensitive.sex : null,
    completed_by_name: completedByName
  }
}

export const writeOshaActivity = async ({
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

  const { error } = await supabase.from('forge_osha_case_activity').insert({
    organization_id: organizationId,
    case_id: caseId,
    activity_type: activityType,
    message,
    actor_user_id: actorUserId,
    metadata
  })

  if (error) throw new Error(`Unable to record OSHA case activity: ${error.message}`)
}

/** Readable messages for database constraint failures on OSHA writes. */
export const oshaWriteErrorMessage = (error: { code?: string; message?: string } | null | undefined) => {
  const message = error?.message || ''

  if (!error) return 'Unable to save the OSHA case.'
  if (/forge_osha_cases_day_cap/.test(message)) return 'Days away and restricted days together are capped at 180.'
  if (/forge_osha_cases_incident_person_idx/.test(message)) return 'This employee already has an OSHA case for this incident.'
  if (/forge_osha_cases_recordable_complete/.test(message)) return 'Recordable cases need a case outcome and a case type.'
  if (/forge_osha_cases_privacy_recordable/.test(message)) return 'Only recordable cases can be privacy cases.'
  if (/forge_osha_cases_void_reason/.test(message)) return 'A reason is required to void a case.'

  return message || 'Unable to save the OSHA case.'
}

/** Display name of the personnel record linked to a login, for "completed by" fields. */
export const personnelNameForUser = async (organizationId: string, userId: string, fallback: string | null) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_personnel')
    .select('first_name, last_name')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', userId)
    .is('archived_at', null)
    .maybeSingle()

  return data ? `${data.first_name} ${data.last_name}` : fallback
}

/**
 * Opens (or finds) the OSHA case for an employee on an incident, seeding Form 300/301 fields.
 * Callers must already have checked osha.edit / workers_comp permissions and scope.
 * Shared by the OSHA module and the workers' comp OSHA sync.
 */
export const createOshaCaseForIncident = async ({
  organizationId,
  incident,
  personnelId,
  actorUserId,
  actorEmail,
  source = 'incident'
}: {
  organizationId: string
  incident: any
  personnelId: string
  actorUserId: string
  actorEmail: string | null
  source?: 'incident' | 'workers_comp'
}): Promise<{ id: string; caseNumber: string; existed: boolean } | { error: string }> => {
  const supabase = createServiceRoleClient() as any

  if (!incident.location_id) return { error: 'Set the incident Location first. OSHA logs are kept per establishment (Location).' }

  const { data: existing } = await supabase
    .from('forge_osha_cases')
    .select('id, case_number')
    .eq('organization_id', organizationId)
    .eq('incident_id', incident.id)
    .eq('personnel_id', personnelId)
    .neq('status', 'voided')
    .maybeSingle()

  if (existing) return { id: existing.id, caseNumber: existing.case_number, existed: true }

  const seed = await buildOshaSeedFromIncident({
    organizationId,
    incident,
    personnelId,
    completedByName: await personnelNameForUser(organizationId, actorUserId, actorEmail)
  })

  if (!seed.employee_name || !seed.injury_date) return { error: 'The incident needs an occurrence date and the employee needs a name.' }

  const { data: caseNumber, error: numberError } = await supabase.rpc('next_forge_osha_case_number', {
    p_organization_id: organizationId,
    p_location_id: incident.location_id,
    p_year: Number(seed.injury_date.slice(0, 4))
  })

  if (numberError || !caseNumber) return { error: numberError?.message || 'Unable to assign a case number.' }

  const { data: created, error } = await supabase
    .from('forge_osha_cases')
    .insert({
      organization_id: organizationId,
      case_number: caseNumber,
      incident_id: incident.id,
      personnel_id: personnelId,
      location_id: incident.location_id,
      division_id: incident.division_id,
      ...seed,
      completed_date: new Date().toISOString().slice(0, 10),
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select('id, case_number')
    .single()

  if (error || !created) return { error: oshaWriteErrorMessage(error) }

  await supabase
    .from('forge_incidents')
    .update({ osha_review_flag: true, updated_at: new Date().toISOString(), updated_by: actorUserId })
    .eq('id', incident.id)
    .eq('organization_id', organizationId)

  await supabase.from('forge_incident_activity').insert({
    organization_id: organizationId,
    incident_id: incident.id,
    activity_type: 'osha_case_opened',
    message: `OSHA case ${created.case_number} opened.`,
    actor_user_id: actorUserId
  })

  await writeOshaActivity({
    organizationId,
    caseId: created.id,
    activityType: 'opened',
    message:
      source === 'workers_comp'
        ? `Case ${created.case_number} opened from a workers' comp case on incident ${incident.incident_number}.`
        : `Case ${created.case_number} opened from incident ${incident.incident_number}.`,
    actorUserId
  })

  await writeForgeAudit({
    actorUserId,
    organizationId,
    action: 'osha.case_opened',
    entityType: 'osha_case',
    entityId: created.id,
    afterValue: { case_number: created.case_number, incident_id: incident.id, source }
  })

  return { id: created.id, caseNumber: created.case_number, existed: false }
}
