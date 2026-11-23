import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { fetchAllRows, inChunks } from '@/lib/forgeFetchAll'
import type { CheckAnswer, CheckDefinition, PermitPerson, PermitSettings, PermitType } from '@/lib/forgePermitRules'
import { isUuid, normalizeSettings, PERMIT_TYPES } from '@/lib/forgePermitRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 18: server-side access to high-risk work permits. Everything goes through the service role with the
 * checks made here; location-scoped people see and act on permits and spaces at their own locations only. Status
 * changes go through the database workflow functions (rpc forge_permit_*), never a direct update.
 */

const db = () => createServiceRoleClient() as any

type Access = { effective: EffectivePermission[] }

type Grant = { locations: string[] | null }

const KEYS = { view: 'permits.view', request: 'permits.request', approve: 'permits.approve', manage: 'permits.manage' } as const

const grantOf = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** What the person can do with permits, with the locations behind each grant (null = everywhere). */
export const permitRights = async (organizationId: string, userId: string, access: Access) => {
  let assigned: string[] | undefined

  const locationsFor = async (grant: EffectivePermission | null): Promise<Grant | null> => {
    if (!grant) return null
    if (grant.scope === 'organization') return { locations: null }
    if (!assigned) assigned = ((await getTenantScopeAssignments({ organizationId, userId })).locationIds || []) as string[]

    return { locations: assigned }
  }

  const entries = await Promise.all(Object.entries(KEYS).map(async ([name, key]) => [name, await locationsFor(grantOf(access, key))] as const))

  return { userId, organizationId, ...(Object.fromEntries(entries) as Record<keyof typeof KEYS, Grant | null>) }
}

export type PermitRightsAll = Awaited<ReturnType<typeof permitRights>>

/** Whether a grant reaches a location. */
export const covers = (grant: Grant | null, locationId: string | null | undefined) =>
  Boolean(grant) && (grant!.locations === null || (Boolean(locationId) && grant!.locations!.includes(locationId as string)))

/** The request / approve / manage flags for one permit's location (view is implied by any of them). */
export const rightsAt = (rights: PermitRightsAll, locationId: string) => ({
  view: covers(rights.view, locationId) || covers(rights.request, locationId) || covers(rights.approve, locationId) || covers(rights.manage, locationId),
  request: covers(rights.request, locationId),
  approve: covers(rights.approve, locationId),
  manage: covers(rights.manage, locationId)
})

/** Apply a grant's location list to a query on a table with location_id. */
export const inScope = (query: any, grant: Grant) =>
  grant.locations === null ? query : query.in('location_id', grant.locations.length ? grant.locations : ['00000000-0000-0000-0000-000000000000'])

/** The widest of the person's grants, for listing (anyone who can request or approve somewhere can see there). */
export const viewGrant = (rights: PermitRightsAll): Grant | null => {
  const grants = [rights.view, rights.request, rights.approve, rights.manage].filter(Boolean) as Grant[]

  if (!grants.length) return null
  if (grants.some(grant => grant.locations === null)) return { locations: null }

  return { locations: [...new Set(grants.flatMap(grant => grant.locations || []))] }
}

// ---------------------------------------------------------------------------
// Company lookups
// ---------------------------------------------------------------------------

export const companyTimeZone = async (organizationId: string) => {
  const { data } = await db().from('organizations').select('timezone').eq('id', organizationId).maybeSingle()

  return (data?.timezone as string) || 'America/Chicago'
}

export const loadPermitSettings = async (organizationId: string): Promise<PermitSettings> => {
  const { data } = await db().from('forge_permit_settings').select('*').eq('organization_id', organizationId).maybeSingle()

  return normalizeSettings(data)
}

export const companyLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string }[]
}

export const companyPersonnel = async (organizationId: string) => {
  const data = await fetchAllRows(
    () =>
      db()
        .from('forge_personnel')
        .select('id, first_name, last_name, employment_status, location_id')
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .order('last_name')
        .order('id'),
    'Unable to load personnel'
  )

  return data
    .filter((row: any) => !row.employment_status || row.employment_status === 'active')
    .map((row: any) => ({ id: row.id as string, name: `${row.first_name} ${row.last_name}`.trim(), locationId: row.location_id as string | null }))
}

/** Active contractor workers, with their company, for adding to a permit. */
export const companyContractorWorkers = async (organizationId: string) => {
  const data = await fetchAllRows(
    () =>
      db()
        .from('forge_contractor_workers')
        .select('id, first_name, last_name, company_id, forge_contractor_companies(name)')
        .eq('organization_id', organizationId)
        .eq('active', true)
        .is('archived_at', null)
        .order('last_name')
        .order('id'),
    'Unable to load contractor workers'
  )

  return data.map((row: any) => ({
    id: row.id as string,
    name: `${row.first_name} ${row.last_name}`.trim(),
    companyId: row.company_id as string,
    companyName: (row.forge_contractor_companies?.name as string) || ''
  }))
}

export const companyContractors = async (organizationId: string) => {
  const { data } = await db().from('forge_contractor_companies').select('id, name, status').eq('organization_id', organizationId).is('archived_at', null).order('name')

  return (data || []) as { id: string; name: string; status: string }[]
}

export const companyAssets = async (organizationId: string) => {
  const data = await fetchAllRows(
    () => db().from('forge_assets').select('id, asset_number, name, location_id').eq('organization_id', organizationId).is('retired_at', null).order('asset_number').order('id'),
    'Unable to load equipment'
  )

  return data.map((row: any) => ({ id: row.id as string, name: `${row.asset_number} ${row.name}`.trim(), locationId: row.location_id as string | null }))
}

export const userNameMap = async (ids: (string | null | undefined)[]) => {
  const unique = [...new Set(ids.filter(Boolean) as string[])]
  const names = new Map<string, string>()

  for (const chunk of inChunks(unique)) {
    const { data } = await db().from('users').select('user_id, name, email').in('user_id', chunk)

    for (const row of (data || []) as any[]) names.set(row.user_id, row.name || row.email || 'Unknown user')
  }

  return names
}

// ---------------------------------------------------------------------------
// Confined spaces
// ---------------------------------------------------------------------------

export const SPACE_COLUMNS =
  'id, organization_id, location_id, space_code, name, description, permit_required, hazards, entry_points, isolation_notes, rescue_plan, last_evaluated_on, archived_at, created_by, created_at, updated_at'

export const listSpaces = async ({ organizationId, grant, includeArchived = false }: { organizationId: string; grant: Grant; includeArchived?: boolean }) =>
  fetchAllRows(() => {
    const query = inScope(db().from('forge_confined_spaces').select(SPACE_COLUMNS).eq('organization_id', organizationId), grant).order('name').order('id')

    return includeArchived ? query : query.is('archived_at', null)
  }, 'Unable to load confined spaces')

export const loadSpace = async (organizationId: string, spaceId: string) => {
  if (!isUuid(spaceId)) return null
  const { data } = await db().from('forge_confined_spaces').select(SPACE_COLUMNS).eq('organization_id', organizationId).eq('id', spaceId).maybeSingle()

  return data || null
}

// ---------------------------------------------------------------------------
// Permits
// ---------------------------------------------------------------------------

export const PERMIT_COLUMNS =
  'id, organization_id, permit_number, permit_type, location_id, space_id, asset_id, contractor_company_id, title, work_description, work_area, valid_from, valid_until, details, status, requested_by, requested_at, approved_by, approved_at, approval_note, rejected_by, rejected_at, reject_reason, issued_by, issued_at, suspended_by, suspended_at, suspend_reason, work_completed_by, work_completed_at, closed_by, closed_at, close_note, canceled_by, canceled_at, cancel_reason, created_by, created_at, updated_at'

const LIST_COLUMNS = 'id, permit_number, permit_type, location_id, space_id, title, work_area, valid_from, valid_until, status, requested_by, created_by, work_completed_at, created_at'

/** Permits the person can see, newest first. `open` keeps draft through suspended. */
export const listPermits = async ({
  organizationId,
  rights,
  type,
  status,
  open,
  spaceId
}: {
  organizationId: string
  rights: PermitRightsAll
  type?: PermitType
  status?: string
  open?: boolean
  spaceId?: string
}) => {
  const grant = viewGrant(rights)

  if (!grant) return []

  return fetchAllRows(() => {
    let query = inScope(db().from('forge_permits').select(LIST_COLUMNS).eq('organization_id', organizationId), grant)

    if (type) query = query.eq('permit_type', type)
    if (status) query = query.eq('status', status)
    if (open) query = query.in('status', ['draft', 'requested', 'approved', 'active', 'suspended'])
    if (spaceId) query = query.eq('space_id', spaceId)

    return query.order('created_at', { ascending: false }).order('id')
  }, 'Unable to load permits')
}

/** One permit the person may see, or null (also null for a bad id or another company's permit). */
export const loadPermit = async (organizationId: string, rights: PermitRightsAll, permitId: string, type?: PermitType) => {
  if (!isUuid(permitId)) return null
  const { data } = await db().from('forge_permits').select(PERMIT_COLUMNS).eq('organization_id', organizationId).eq('id', permitId).maybeSingle()

  if (!data) return null
  if (type && data.permit_type !== type) return null
  if (!rightsAt(rights, data.location_id).view) return null

  return data
}

export const loadPermitPeople = async (permitId: string) => {
  const { data } = await db()
    .from('forge_permit_people')
    .select('id, role, personnel_id, contractor_worker_id, added_by, added_at, removed_by, removed_at')
    .eq('permit_id', permitId)
    .order('added_at')
    .order('id')

  return (data || []) as (PermitPerson & { id: string; added_by: string | null; added_at: string; removed_by: string | null })[]
}

/** Names for the personnel and contractor workers on a set of person rows. */
export const personNames = async (people: PermitPerson[]) => {
  const personnelIds = [...new Set(people.map(person => person.personnel_id).filter(Boolean) as string[])]
  const workerIds = [...new Set(people.map(person => person.contractor_worker_id).filter(Boolean) as string[])]
  const personnel = new Map<string, string>()
  const workers = new Map<string, string>()

  for (const chunk of inChunks(personnelIds)) {
    const { data } = await db().from('forge_personnel').select('id, first_name, last_name').in('id', chunk)

    for (const row of (data || []) as any[]) personnel.set(row.id, `${row.first_name} ${row.last_name}`.trim())
  }

  for (const chunk of inChunks(workerIds)) {
    const { data } = await db().from('forge_contractor_workers').select('id, first_name, last_name, forge_contractor_companies(name)').in('id', chunk)

    for (const row of (data || []) as any[]) {
      const company = row.forge_contractor_companies?.name

      workers.set(row.id, `${row.first_name} ${row.last_name}`.trim() + (company ? ` (${company})` : ''))
    }
  }

  return { personnel, workers }
}

export const loadCheckDefinitions = async (organizationId: string, type: PermitType) => {
  const { data } = await db()
    .from('forge_permit_check_definitions')
    .select('id, organization_id, permit_type, check_key, label, required, allow_na, sort_order')
    .eq('permit_type', type)
    .is('archived_at', null)
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .order('sort_order')

  return (data || []) as (CheckDefinition & { id: string })[]
}

export const loadCheckAnswers = async (permitId: string) => {
  const { data } = await db().from('forge_permit_checks').select('check_key, answer, note, answered_by, answered_at').eq('permit_id', permitId)

  return (data || []) as (CheckAnswer & { answered_by: string | null; answered_at: string })[]
}

export const loadGasTests = async (permitId: string) => {
  const { data } = await db().from('forge_permit_gas_tests').select('*').eq('permit_id', permitId).order('tested_at', { ascending: false }).order('id')

  return (data || []) as any[]
}

export const loadEntries = async (permitId: string) => {
  const { data } = await db().from('forge_permit_entries').select('*').eq('permit_id', permitId).order('entered_at', { ascending: false }).order('id')

  return (data || []) as any[]
}

export const loadLinks = async (permitId: string) => {
  const { data } = await db()
    .from('forge_permit_links')
    .select('id, loto_procedure_id, document_id, linked_by, linked_at, forge_loto_procedures(procedure_number, title), forge_documents(document_number, name)')
    .eq('permit_id', permitId)
    .order('linked_at')

  return (data || []) as any[]
}

export const loadActivity = async (permitId: string) => {
  const { data } = await db().from('forge_permit_activity').select('id, action, detail, actor_user_id, created_at').eq('permit_id', permitId).order('created_at').order('id')

  return (data || []) as any[]
}

/** People on the permit missing a required, current training completion (from the database function). */
export const trainingGaps = async (permitId: string) => {
  const { data } = await db().rpc('forge_permit_training_gaps', { p_permit_id: permitId })

  return (data || []) as { person_row_id: string; personnel_id: string; person_name: string; role: string; course_id: string; course_title: string }[]
}

export const loadTrainingRequirements = async (organizationId: string) => {
  const { data } = await db()
    .from('forge_permit_training_requirements')
    .select('id, permit_type, role, course_id, forge_training_courses(title)')
    .eq('organization_id', organizationId)
    .order('permit_type')

  return (data || []) as any[]
}

/** Everything the permit page needs, in one go. */
export const loadPermitBundle = async (organizationId: string, permit: any) => {
  const [people, definitions, answers, gasTests, entries, links, activity, gaps, settings, timeZone] = await Promise.all([
    loadPermitPeople(permit.id),
    loadCheckDefinitions(organizationId, permit.permit_type),
    loadCheckAnswers(permit.id),
    loadGasTests(permit.id),
    loadEntries(permit.id),
    loadLinks(permit.id),
    loadActivity(permit.id),
    trainingGaps(permit.id),
    loadPermitSettings(organizationId),
    companyTimeZone(organizationId)
  ])

  const names = await personNames(people)

  const users = await userNameMap([
    permit.requested_by,
    permit.approved_by,
    permit.rejected_by,
    permit.issued_by,
    permit.suspended_by,
    permit.work_completed_by,
    permit.closed_by,
    permit.canceled_by,
    permit.created_by,
    ...gasTests.map(test => test.tested_by),
    ...activity.map(row => row.actor_user_id)
  ])

  const inside = entries.filter(entry => !entry.exited_at)

  return { people, names, definitions, answers, gasTests, entries, inside, links, activity, gaps, settings, timeZone, users }
}

/** Counts for the dashboard and the permits board. */
export const permitCounts = async (organizationId: string, rights: PermitRightsAll) => {
  const grant = viewGrant(rights)

  if (!grant) return { waiting: 0, active: 0, suspended: 0, expired: 0 }
  const rows = await listPermits({ organizationId, rights, open: true })
  const now = Date.now()
  const approveGrant = rights.approve

  return {
    waiting: approveGrant ? rows.filter((row: any) => row.status === 'requested' && covers(approveGrant, row.location_id) && row.requested_by !== rights.userId).length : 0,
    active: rows.filter((row: any) => row.status === 'active' && new Date(row.valid_until).getTime() > now).length,
    suspended: rows.filter((row: any) => row.status === 'suspended').length,
    expired: rows.filter((row: any) => ['approved', 'active', 'suspended'].includes(row.status) && new Date(row.valid_until).getTime() <= now).length
  }
}

export { PERMIT_TYPES }
