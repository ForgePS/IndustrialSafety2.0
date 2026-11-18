import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { getTenantScopeAssignments } from '@/lib/forgeScope'
import {
  DOT_DEFAULT_HIDDEN_DOCUMENTS,
  companyDriverIssues,
  dqfIssues,
  dqfWorksheet,
  nextDueDate,
  type DotDocumentRow,
  type DotFileCounts,
  type DotIssue
} from '@/lib/forgeDotRules'

/**
 * DOT Compliance loaders (port slice 5). DQFs and roster rows inherit their driver's scope
 * (location / division / own / assigned). Unlinked roster rows and records without a driver are
 * visible only with organization scope. Callers check the dot.* permission first.
 */

export type DotSettings = {
  hidden_document_types: string[]
  dot_drivers_are_company_drivers: boolean
  insurer_name: string | null
  insurer_email: string | null
  mvr_sample_percent: number
}

export const getDotSettings = async (organizationId: string): Promise<DotSettings> => {
  const { data } = await (createServiceRoleClient() as any)
    .from('forge_dot_settings')
    .select('hidden_document_types, dot_drivers_are_company_drivers, insurer_name, insurer_email, mvr_sample_percent')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return {
    hidden_document_types: data?.hidden_document_types || DOT_DEFAULT_HIDDEN_DOCUMENTS,
    dot_drivers_are_company_drivers: Boolean(data?.dot_drivers_are_company_drivers),
    insurer_name: data?.insurer_name || null,
    insurer_email: data?.insurer_email || null,
    mvr_sample_percent: Number(data?.mvr_sample_percent || 10)
  }
}

/** Whether a person is inside the permission's scope. A null person needs organization scope. */
export const personWithinScope = async ({
  organizationId,
  userId,
  scope,
  person
}: {
  organizationId: string
  userId: string
  scope: string | null
  person: { organization_id: string; auth_user_id?: string | null; supervisor_user_id?: string | null; location_id?: string | null; division_id?: string | null } | null
}) => {
  if (scope === 'organization') return !person || person.organization_id === organizationId
  if (!person || person.organization_id !== organizationId) return false

  switch (scope) {
    case 'own':
      return person.auth_user_id === userId
    case 'assigned':
      return person.auth_user_id === userId || person.supervisor_user_id === userId
    case 'location':

    case 'division': {
      const { locationIds, divisionIds } = await getTenantScopeAssignments({ organizationId, userId })

      return scope === 'location' ? locationIds.includes(person.location_id) : divisionIds.includes(person.division_id)
    }

    default:
      return false
  }
}

const PERSON_SELECT =
  'id, organization_id, first_name, last_name, preferred_name, employee_number, employment_status, employment_type, hire_date, phone, auth_user_id, supervisor_user_id, location_id, division_id, archived_at, is_dot_driver, is_company_driver, locations(name)'

export const personName = (person: any) =>
  person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(' ') : 'Unlinked driver'

/** Upload counts per slot, keyed by parent id. */
export const getDotFileCounts = async ({
  organizationId,
  column,
  ids
}: {
  organizationId: string
  column: 'driver_file_id' | 'company_driver_id' | 'record_id'
  ids: string[]
}) => {
  const result = new Map<string, DotFileCounts>()

  if (!ids.length) return result

  const { data } = await (createServiceRoleClient() as any)
    .from('forge_dot_files')
    .select(`${column}, slot`)
    .eq('organization_id', organizationId)
    .in(column, ids)
    .is('removed_at', null)

  for (const row of data || []) {
    const counts = result.get(row[column]) || {}

    counts[row.slot] = (counts[row.slot] || 0) + 1
    result.set(row[column], counts)
  }

  return result
}

export type DriverFileSummary = {
  id: string
  file_number: string
  person: any
  name: string
  archived_at: string | null
  archived_reason: string | null
  nextDue: string | null
  issues: DotIssue[]
  worksheet: ReturnType<typeof dqfWorksheet>
  raw: any
}

/** DQFs for the people in scope, with their worksheet and issues worked out. */
export const getScopedDriverFiles = async ({
  organizationId,
  userId,
  permission,
  includeArchived = false,
  todayIso = new Date().toISOString().slice(0, 10)
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  includeArchived?: boolean
  todayIso?: string
}): Promise<DriverFileSummary[]> => {
  const people = await getScopedPersonnel({ organizationId, userId, permission, includeArchived: true })
  const peopleById = new Map(people.map((person: any) => [person.id, person]))

  if (!peopleById.size) return []

  const supabase = createServiceRoleClient() as any
  let query = supabase
    .from('forge_dot_driver_files')
    .select('*')
    .eq('organization_id', organizationId)
    .in('personnel_id', [...peopleById.keys()])

  if (!includeArchived) query = query.is('archived_at', null)

  const { data: files, error } = await query

  if (error) throw new Error('Unable to load DQFs: ' + error.message)

  const ids = (files || []).map((file: any) => file.id)

  const [settings, counts, { data: documents }] = await Promise.all([
    getDotSettings(organizationId),
    getDotFileCounts({ organizationId, column: 'driver_file_id', ids }),
    ids.length
      ? supabase.from('forge_dot_dqf_documents').select('driver_file_id, document_type, placed_on, on_file, text_values').in('driver_file_id', ids)
      : Promise.resolve({ data: [] })
  ])

  const docsByFile = new Map<string, DotDocumentRow[]>()

  for (const row of documents || []) docsByFile.set(row.driver_file_id, [...(docsByFile.get(row.driver_file_id) || []), row])

  return (files || [])
    .map((file: any) => {
      const person: any = peopleById.get(file.personnel_id)

      const input = {
        file,
        person,
        documents: docsByFile.get(file.id) || [],
        fileCounts: counts.get(file.id) || {},
        hiddenDocuments: settings.hidden_document_types,
        todayIso
      }

      return {
        id: file.id,
        file_number: file.file_number,
        person,
        name: personName(person),
        archived_at: file.archived_at,
        archived_reason: file.archived_reason,
        nextDue: nextDueDate(file, person),
        issues: dqfIssues(input),
        worksheet: dqfWorksheet(input),
        raw: file
      }
    })
    .sort((a: DriverFileSummary, b: DriverFileSummary) => (a.person?.last_name || '').localeCompare(b.person?.last_name || '') || a.name.localeCompare(b.name))
}

export const getDriverFileDetail = async ({ organizationId, fileId }: { organizationId: string; fileId: string }) => {
  const supabase = createServiceRoleClient() as any
  const { data: file } = await supabase.from('forge_dot_driver_files').select('*').eq('organization_id', organizationId).eq('id', fileId).maybeSingle()

  if (!file) return null

  const [{ data: person }, { data: documents }, { data: uploads }, { data: roster }] = await Promise.all([
    supabase.from('forge_personnel').select(PERSON_SELECT).eq('id', file.personnel_id).maybeSingle(),
    supabase.from('forge_dot_dqf_documents').select('*').eq('driver_file_id', file.id),
    supabase
      .from('forge_dot_files')
      .select('id, slot, file_name, content_type, byte_size, created_at, uploaded_by')
      .eq('driver_file_id', file.id)
      .is('removed_at', null)
      .order('created_at'),
    supabase.from('forge_dot_company_drivers').select('*').eq('organization_id', organizationId).eq('personnel_id', file.personnel_id).maybeSingle()
  ])

  return { file, person, documents: documents || [], uploads: uploads || [], roster: roster || null }
}

/** Active people in scope who do not have an open DQF yet. */
export const getDqfCandidates = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const people = await getScopedPersonnel({ organizationId, userId, permission })

  const { data: open } = await (createServiceRoleClient() as any)
    .from('forge_dot_driver_files')
    .select('personnel_id')
    .eq('organization_id', organizationId)
    .is('archived_at', null)

  const taken = new Set((open || []).map((row: any) => row.personnel_id))

  return people
    .filter((person: any) => !taken.has(person.id) && !['terminated', 'inactive'].includes(person.employment_status))
    .map((person: any) => ({ id: person.id, name: personName(person), employeeNumber: person.employee_number, isDotDriver: person.is_dot_driver }))
}

// ---------------------------------------------------------------------------
// Company drivers
// ---------------------------------------------------------------------------

export type CompanyDriverSummary = {
  id: string
  driver: any
  person: any
  name: string
  consentUploads: number
  reportUploads: number
  licenseUploads: number
  issues: DotIssue[]
}

export const getScopedCompanyDrivers = async ({
  organizationId,
  userId,
  permission,
  todayIso = new Date().toISOString().slice(0, 10)
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  todayIso?: string
}): Promise<CompanyDriverSummary[]> => {
  const supabase = createServiceRoleClient() as any

  const { data: drivers, error } = await supabase
    .from('forge_dot_company_drivers')
    .select('*')
    .eq('organization_id', organizationId)
    .order('driver_name')

  if (error) throw new Error('Unable to load company drivers: ' + error.message)

  const people = await getScopedPersonnel({ organizationId, userId, permission, includeArchived: true })
  const peopleById = new Map(people.map((person: any) => [person.id, person]))

  const visible = (drivers || []).filter((driver: any) =>
    driver.personnel_id ? peopleById.has(driver.personnel_id) : permission.scope === 'organization'
  )

  const counts = await getDotFileCounts({ organizationId, column: 'company_driver_id', ids: visible.map((driver: any) => driver.id) })
  const year = Number(todayIso.slice(0, 4))

  return visible.map((driver: any) => {
    const fileCounts = counts.get(driver.id) || {}
    const consentUploads = Number(fileCounts.mvr_consent || 0)

    return {
      id: driver.id,
      driver,
      person: driver.personnel_id ? peopleById.get(driver.personnel_id) : null,
      name: driver.driver_name,
      consentUploads,
      reportUploads: Number(fileCounts.mvr_report || 0),
      licenseUploads: Number(fileCounts.license || 0),
      issues: companyDriverIssues(driver, { consentUploads, todayIso, year })
    }
  })
}

export const getCompanyDriverDetail = async ({ organizationId, driverId }: { organizationId: string; driverId: string }) => {
  const supabase = createServiceRoleClient() as any
  const { data: driver } = await supabase.from('forge_dot_company_drivers').select('*').eq('organization_id', organizationId).eq('id', driverId).maybeSingle()

  if (!driver) return null

  const [{ data: person }, { data: uploads }, { data: events }, { data: dqf }] = await Promise.all([
    driver.personnel_id ? supabase.from('forge_personnel').select(PERSON_SELECT).eq('id', driver.personnel_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase
      .from('forge_dot_files')
      .select('id, slot, file_name, content_type, byte_size, created_at')
      .eq('company_driver_id', driver.id)
      .is('removed_at', null)
      .order('created_at'),
    supabase.from('forge_dot_mvr_events').select('*').eq('company_driver_id', driver.id).order('created_at', { ascending: false }).limit(50),
    driver.personnel_id
      ? supabase.from('forge_dot_driver_files').select('id, file_number').eq('personnel_id', driver.personnel_id).is('archived_at', null).maybeSingle()
      : Promise.resolve({ data: null })
  ])

  return { driver, person, uploads: uploads || [], events: events || [], dqf: dqf || null }
}

// ---------------------------------------------------------------------------
// Other records
// ---------------------------------------------------------------------------

export const DOT_RECORD_CATEGORY_LABELS: Record<string, string> = {
  roadside_inspection: 'Roadside Inspection',
  accident: 'Accident',
  drug_alcohol: 'Drug & Alcohol',
  company: 'Company',
  other: 'Other'
}

export const getScopedDotRecords = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_dot_records')
    .select('*, forge_personnel(id, first_name, last_name, preferred_name), locations(name)')
    .eq('organization_id', organizationId)
    .order('record_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error('Unable to load DOT records: ' + error.message)
  if (permission.scope === 'organization') return data || []

  const people = await getScopedPersonnel({ organizationId, userId, permission, includeArchived: true })
  const ids = new Set(people.map((person: any) => person.id))

  return (data || []).filter((record: any) => record.personnel_id && ids.has(record.personnel_id))
}

/**
 * DOT records about one person, newest first. Records with a driver inherit that driver's scope,
 * so callers check the person is within dot.view scope first.
 */
export const getDotRecordsForPerson = async ({ organizationId, personnelId }: { organizationId: string; personnelId: string }) => {
  const { data, error } = await (createServiceRoleClient() as any)
    .from('forge_dot_records')
    .select('id, record_number, category, title, record_date, due_on, status')
    .eq('organization_id', organizationId)
    .eq('personnel_id', personnelId)
    .order('record_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error('Unable to load DOT records: ' + error.message)

  return data || []
}

/** Loads a person with the fields the scope check needs. */
export const loadPersonForScope = async (personnelId: string | null) => {
  if (!personnelId) return null

  const { data } = await (createServiceRoleClient() as any)
    .from('forge_personnel')
    .select('id, organization_id, auth_user_id, supervisor_user_id, location_id, division_id')
    .eq('id', personnelId)
    .maybeSingle()

  return data || null
}
