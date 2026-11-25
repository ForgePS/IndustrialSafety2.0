import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { fetchAllRows, inChunks } from '@/lib/forgeFetchAll'
import type { CheckItem, ForkliftSettings } from '@/lib/forgeForkliftRules'
import { isUuid, normalizeSettings } from '@/lib/forgeForkliftRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 19: server-side access to forklifts. Everything goes through the service role with the checks made here.
 * A forklift is an asset with a profile, so its location is the asset's; an operator's location is the person's.
 * Location-scoped people see and act on trucks and operators at their own locations only. Checks, defects and
 * operator changes go through the database workflow functions (rpc forge_forklift_*), never a direct write.
 */

const db = () => createServiceRoleClient() as any

type Access = { effective: EffectivePermission[] }

export type Grant = { locations: string[] | null }

const KEYS = { view: 'forklifts.view', check: 'forklifts.check', manage: 'forklifts.manage', authorize: 'forklifts.authorize' } as const

const grantOf = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** What the person can do with forklifts, with the locations behind each grant (null = everywhere). */
export const forkliftRights = async (organizationId: string, userId: string, access: Access) => {
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

export type ForkliftRights = Awaited<ReturnType<typeof forkliftRights>>

/** Whether a grant reaches a location. */
export const covers = (grant: Grant | null, locationId: string | null | undefined) =>
  Boolean(grant) && (grant!.locations === null || (Boolean(locationId) && grant!.locations!.includes(locationId as string)))

/** The flags for one location (view is implied by any of the others). */
export const rightsAt = (rights: ForkliftRights, locationId: string | null | undefined) => ({
  view: covers(rights.view, locationId) || covers(rights.check, locationId) || covers(rights.manage, locationId) || covers(rights.authorize, locationId),
  check: covers(rights.check, locationId),
  manage: covers(rights.manage, locationId),
  authorize: covers(rights.authorize, locationId)
})

/** The widest of the person's grants, for listing. */
export const viewGrant = (rights: ForkliftRights): Grant | null => {
  const grants = [rights.view, rights.check, rights.manage, rights.authorize].filter(Boolean) as Grant[]

  if (!grants.length) return null
  if (grants.some(grant => grant.locations === null)) return { locations: null }

  return { locations: [...new Set(grants.flatMap(grant => grant.locations || []))] }
}

const NO_ROWS = '00000000-0000-0000-0000-000000000000'

/** Apply a grant's location list to a query on a column holding a location id. */
export const inScope = (query: any, grant: Grant, column = 'location_id') =>
  grant.locations === null ? query : query.in(column, grant.locations.length ? grant.locations : [NO_ROWS])

// ---------------------------------------------------------------------------
// Company lookups
// ---------------------------------------------------------------------------

export const companyTimeZone = async (organizationId: string) => {
  const { data } = await db().from('organizations').select('timezone').eq('id', organizationId).maybeSingle()

  return (data?.timezone as string) || 'America/Chicago'
}

export const loadForkliftSettings = async (organizationId: string): Promise<ForkliftSettings> => {
  const { data } = await db().from('forge_forklift_settings').select('*').eq('organization_id', organizationId).maybeSingle()

  return normalizeSettings(data)
}

export const companyLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string }[]
}

export const locationNames = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId)

  return new Map<string, string>(((data || []) as any[]).map(row => [row.id, row.name]))
}

/** Active personnel, for choosing operators and evaluators. */
export const companyPersonnel = async (organizationId: string) => {
  const data = await fetchAllRows(
    () =>
      db()
        .from('forge_personnel')
        .select('id, first_name, last_name, employee_number, employment_status, location_id, auth_user_id')
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .order('last_name')
        .order('id'),
    'Unable to load personnel'
  )

  return data
    .filter((row: any) => !row.employment_status || row.employment_status === 'active')
    .map((row: any) => ({
      id: row.id as string,
      name: `${row.first_name} ${row.last_name}`.trim(),
      employeeNumber: (row.employee_number as string) || null,
      locationId: row.location_id as string | null,
      userId: row.auth_user_id as string | null
    }))
}

/** The personnel record linked to a signed-in user, if any. */
export const personnelForUser = async (organizationId: string, userId: string) => {
  const { data } = await db()
    .from('forge_personnel')
    .select('id, first_name, last_name, location_id')
    .eq('organization_id', organizationId)
    .eq('auth_user_id', userId)
    .is('archived_at', null)
    .maybeSingle()

  return data ? { id: data.id as string, name: `${data.first_name} ${data.last_name}`.trim(), locationId: data.location_id as string | null } : null
}

export const companyCourses = async (organizationId: string) => {
  const { data } = await db().from('forge_training_courses').select('id, title').eq('organization_id', organizationId).eq('is_active', true).order('title')

  return (data || []) as { id: string; title: string }[]
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
// Trucks
// ---------------------------------------------------------------------------

const TRUCK_COLUMNS =
  'id, organization_id, asset_id, truck_class, truck_type, power_source, rated_capacity_lb, load_center_in, max_lift_height_in, attachments, designation, nameplate_verified_on, notes, created_by, created_at, updated_at, ' +
  'forge_assets!inner(id, asset_number, name, description, status, manufacturer, model, serial_number, location_id, in_service_date, retired_at)'

export type Truck = {
  id: string
  asset_id: string
  truck_class: string
  truck_type: string
  power_source: string
  rated_capacity_lb: number | null
  load_center_in: number | null
  max_lift_height_in: number | null
  attachments: string | null
  designation: string | null
  nameplate_verified_on: string | null
  notes: string | null
  created_at: string
  asset: {
    id: string
    asset_number: string
    name: string
    description: string | null
    status: string
    manufacturer: string | null
    model: string | null
    serial_number: string | null
    location_id: string | null
    in_service_date: string | null
    retired_at: string | null
  }
}

const toTruck = (row: any): Truck => {
  const { forge_assets: asset, ...rest } = row

  return { ...rest, asset }
}

/** Trucks the person can see. Retired trucks only when asked. */
export const listTrucks = async ({ organizationId, rights, includeRetired = false }: { organizationId: string; rights: ForkliftRights; includeRetired?: boolean }) => {
  const grant = viewGrant(rights)

  if (!grant) return [] as Truck[]

  const rows = await fetchAllRows(() => {
    let query = inScope(db().from('forge_forklifts').select(TRUCK_COLUMNS).eq('organization_id', organizationId), grant, 'forge_assets.location_id')

    if (!includeRetired) query = query.is('forge_assets.retired_at', null)

    return query.order('created_at').order('id')
  }, 'Unable to load forklifts')

  return (rows as any[]).map(toTruck).sort((a, b) => a.asset.asset_number.localeCompare(b.asset.asset_number) || a.asset.name.localeCompare(b.asset.name))
}

/** One truck the person may see, or null (also for a bad id or another company's truck). */
export const loadTruck = async (organizationId: string, rights: ForkliftRights, forkliftId: string) => {
  if (!isUuid(forkliftId)) return null
  const { data } = await db().from('forge_forklifts').select(TRUCK_COLUMNS).eq('organization_id', organizationId).eq('id', forkliftId).maybeSingle()

  if (!data) return null
  const truck = toTruck(data)

  return rightsAt(rights, truck.asset.location_id).view ? truck : null
}

/** The truck profile on an asset (for the asset page and scans), without a permission check. */
export const truckForAsset = async (organizationId: string, assetId: string) => {
  if (!isUuid(assetId)) return null
  const { data } = await db().from('forge_forklifts').select(TRUCK_COLUMNS).eq('organization_id', organizationId).eq('asset_id', assetId).maybeSingle()

  return data ? toTruck(data) : null
}

/** Equipment that could be set up as a forklift: not retired and not already a forklift. */
export const assetsWithoutProfile = async (organizationId: string, grant: Grant) => {
  const [assets, profiles] = await Promise.all([
    fetchAllRows(
      () => inScope(db().from('forge_assets').select('id, asset_number, name, asset_type, location_id').eq('organization_id', organizationId).is('retired_at', null), grant).order('asset_number').order('id'),
      'Unable to load equipment'
    ),
    fetchAllRows(() => db().from('forge_forklifts').select('asset_id').eq('organization_id', organizationId).order('id'), 'Unable to load forklifts')
  ])

  const taken = new Set((profiles as any[]).map(row => row.asset_id))

  return (assets as any[])
    .filter(asset => !taken.has(asset.id))
    .map(asset => ({ id: asset.id as string, name: `${asset.asset_number} ${asset.name}`.trim(), assetType: asset.asset_type as string, locationId: asset.location_id as string | null }))
}

// ---------------------------------------------------------------------------
// Checklist, checks and defects
// ---------------------------------------------------------------------------

/** Built-in items plus the company's own. Archived company items only when asked. */
export const loadCheckItems = async (organizationId: string, { includeArchived = false } = {}) => {
  let query = db()
    .from('forge_forklift_check_items')
    .select('id, organization_id, item_key, section, label, power_sources, critical, allow_na, sort_order, archived_at')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)

  if (!includeArchived) query = query.is('archived_at', null)
  const { data } = await query.order('sort_order').order('label')

  return (data || []) as (CheckItem & { item_key: string | null })[]
}

export const CHECK_COLUMNS =
  'id, forklift_id, asset_id, location_id, operator_personnel_id, operator_name, performed_by_user_id, performed_at, hour_meter, result, answers, notes, took_out_of_service, source, qr_code_id'

export const listChecks = async ({ organizationId, forkliftId, operatorPersonnelId, limit = 100 }: { organizationId: string; forkliftId?: string; operatorPersonnelId?: string; limit?: number }) => {
  let query = db().from('forge_forklift_checks').select(CHECK_COLUMNS).eq('organization_id', organizationId)

  if (forkliftId) query = query.eq('forklift_id', forkliftId)
  if (operatorPersonnelId) query = query.eq('operator_personnel_id', operatorPersonnelId)
  const { data } = await query.order('performed_at', { ascending: false }).order('id').limit(limit)

  return (data || []) as any[]
}

/** Checks across the trucks the person can see, newest first. */
export const listChecksInScope = async ({ organizationId, rights, since, result }: { organizationId: string; rights: ForkliftRights; since?: string; result?: string }) => {
  const grant = viewGrant(rights)

  if (!grant) return []

  return fetchAllRows(() => {
    let query = inScope(db().from('forge_forklift_checks').select(CHECK_COLUMNS).eq('organization_id', organizationId), grant)

    if (since) query = query.gte('performed_at', since)
    if (result) query = query.eq('result', result)

    return query.order('performed_at', { ascending: false }).order('id')
  }, 'Unable to load checks')
}

export const loadCheck = async (organizationId: string, checkId: string) => {
  if (!isUuid(checkId)) return null
  const { data } = await db().from('forge_forklift_checks').select(CHECK_COLUMNS).eq('organization_id', organizationId).eq('id', checkId).maybeSingle()

  return data || null
}

/** The latest check per truck. */
export const latestChecks = async (organizationId: string, forkliftIds: string[]) => {
  const latest = new Map<string, any>()

  for (const chunk of inChunks(forkliftIds)) {
    const { data } = await db()
      .from('forge_forklift_checks')
      .select('id, forklift_id, performed_at, result, operator_name, took_out_of_service')
      .eq('organization_id', organizationId)
      .in('forklift_id', chunk)
      .gte('performed_at', new Date(Date.now() - 14 * 86400_000).toISOString())
      .order('performed_at', { ascending: false })

    for (const row of (data || []) as any[]) if (!latest.has(row.forklift_id)) latest.set(row.forklift_id, row)
  }

  return latest
}

const DEFECT_COLUMNS =
  'id, forklift_id, check_id, check_item_id, item_label, description, critical, status, reported_by_user_id, reported_by_personnel_id, reported_by_name, reported_at, resolved_by, resolved_at, resolution_note, maintenance_id'

export const listDefects = async ({ organizationId, forkliftIds, openOnly = false }: { organizationId: string; forkliftIds?: string[]; openOnly?: boolean }) => {
  const run = async (ids?: string[]) => {
    let query = db().from('forge_forklift_defects').select(DEFECT_COLUMNS).eq('organization_id', organizationId)

    if (ids) query = query.in('forklift_id', ids)
    if (openOnly) query = query.eq('status', 'open')
    const { data } = await query.order('reported_at', { ascending: false }).order('id')

    return (data || []) as any[]
  }

  if (!forkliftIds) return run()
  const rows: any[] = []

  for (const chunk of inChunks(forkliftIds)) rows.push(...(await run(chunk)))

  return rows
}

export const loadDefect = async (organizationId: string, defectId: string) => {
  if (!isUuid(defectId)) return null
  const { data } = await db().from('forge_forklift_defects').select(DEFECT_COLUMNS).eq('organization_id', organizationId).eq('id', defectId).maybeSingle()

  return data || null
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

const OPERATOR_COLUMNS =
  'id, organization_id, personnel_id, status, truck_classes, training_completed_on, evaluated_on, evaluator_name, evaluator_personnel_id, evaluation_notes, restrictions, expires_on, authorized_by, authorized_at, refresher_required, refresher_reason, refresher_required_at, refresher_incident_id, suspended_at, suspended_by, suspend_reason, revoked_at, revoked_by, revoke_reason, created_at, updated_at, ' +
  'forge_personnel!forge_forklift_operators_personnel_id_fkey!inner(id, first_name, last_name, employee_number, location_id)'

export type Operator = {
  id: string
  personnel_id: string
  status: string
  truck_classes: string[]
  training_completed_on: string
  evaluated_on: string
  evaluator_name: string
  evaluator_personnel_id: string | null
  evaluation_notes: string | null
  restrictions: string | null
  expires_on: string
  authorized_by: string | null
  authorized_at: string
  refresher_required: boolean
  refresher_reason: string | null
  refresher_required_at: string | null
  refresher_incident_id: string | null
  suspended_at: string | null
  suspended_by: string | null
  suspend_reason: string | null
  revoked_at: string | null
  revoked_by: string | null
  revoke_reason: string | null
  person: { id: string; name: string; employeeNumber: string | null; locationId: string | null }
}

const toOperator = (row: any): Operator => {
  const { forge_personnel: person, ...rest } = row

  return {
    ...rest,
    person: { id: person.id, name: `${person.first_name} ${person.last_name}`.trim(), employeeNumber: person.employee_number || null, locationId: person.location_id || null }
  }
}

/** Operators the person can see (by the operator's location). */
export const listOperators = async ({ organizationId, rights }: { organizationId: string; rights: ForkliftRights }) => {
  const grant = viewGrant(rights)

  if (!grant) return [] as Operator[]

  const rows = await fetchAllRows(
    () => inScope(db().from('forge_forklift_operators').select(OPERATOR_COLUMNS).eq('organization_id', organizationId), grant, 'forge_personnel.location_id').order('expires_on').order('id'),
    'Unable to load operators'
  )

  return (rows as any[]).map(toOperator).sort((a, b) => a.person.name.localeCompare(b.person.name))
}

export const loadOperator = async (organizationId: string, rights: ForkliftRights, operatorId: string) => {
  if (!isUuid(operatorId)) return null
  const { data } = await db().from('forge_forklift_operators').select(OPERATOR_COLUMNS).eq('organization_id', organizationId).eq('id', operatorId).maybeSingle()

  if (!data) return null
  const operator = toOperator(data)

  return rightsAt(rights, operator.person.locationId).view ? operator : null
}

/** A person's operator row, without a permission check (for checks, scans and the personnel page). */
export const operatorForPerson = async (organizationId: string, personnelId: string) => {
  if (!isUuid(personnelId)) return null
  const { data } = await db().from('forge_forklift_operators').select(OPERATOR_COLUMNS).eq('organization_id', organizationId).eq('personnel_id', personnelId).maybeSingle()

  return data ? toOperator(data) : null
}

/** Why a person can't operate a truck of this class today (null when they can), straight from the database. */
export const operatorProblem = async (organizationId: string, personnelId: string, truckClass: string | null) => {
  const { data, error } = await db().rpc('forge_forklift_operator_problem', { p_organization_id: organizationId, p_personnel_id: personnelId, p_truck_class: truckClass })

  if (error) throw new Error(error.message)

  return (data as string | null) || null
}

/** Personnel ids with a current completion of the required course (or null when no course is required). */
export const currentlyTrained = async (organizationId: string, settings: ForkliftSettings, personnelIds: string[]) => {
  if (!settings.require_training || !settings.training_course_id) return null
  const today = new Date().toISOString().slice(0, 10)
  const trained = new Set<string>()

  for (const chunk of inChunks(personnelIds)) {
    const { data } = await db()
      .from('forge_training_completions')
      .select('personnel_id, expires_at')
      .eq('organization_id', organizationId)
      .eq('course_id', settings.training_course_id)
      .in('result', ['passed', 'completed'])
      .eq('approval_status', 'approved')
      .is('archived_at', null)
      .in('personnel_id', chunk)

    for (const row of (data || []) as any[]) if (!row.expires_at || row.expires_at >= today) trained.add(row.personnel_id)
  }

  return trained
}

// ---------------------------------------------------------------------------
// History and incident links
// ---------------------------------------------------------------------------

export const loadActivity = async ({ forkliftId, operatorId }: { forkliftId?: string; operatorId?: string }) => {
  let query = db().from('forge_forklift_activity').select('id, forklift_id, operator_id, action, message, actor_user_id, actor_name, metadata, created_at')

  if (forkliftId) query = query.eq('forklift_id', forkliftId)
  if (operatorId) query = query.eq('operator_id', operatorId)
  const { data } = await query.order('created_at', { ascending: false }).order('id').limit(200)

  return (data || []) as any[]
}

export const loadIncidentLinks = async (organizationId: string, { forkliftId, operatorId }: { forkliftId?: string; operatorId?: string }) => {
  let query = db()
    .from('forge_forklift_incident_links')
    .select('id, incident_id, forklift_id, operator_id, note, created_by, created_at, forge_incidents(incident_number, summary, occurred_at, status)')
    .eq('organization_id', organizationId)

  if (forkliftId) query = query.eq('forklift_id', forkliftId)
  if (operatorId) query = query.eq('operator_id', operatorId)
  const { data } = await query.order('created_at', { ascending: false })

  return (data || []) as any[]
}

/** Recent incidents to link, newest first. */
export const recentIncidents = async (organizationId: string) => {
  const { data } = await db()
    .from('forge_incidents')
    .select('id, incident_number, summary, occurred_at, location_id')
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })
    .limit(200)

  return (data || []) as { id: string; incident_number: string; summary: string; occurred_at: string; location_id: string | null }[]
}

/** Run a forklift workflow function and return its result, or the database's plain-language error. */
export const forkliftRpc = async <T = unknown>(name: string, params: Record<string, unknown>): Promise<{ data?: T; error?: string }> => {
  const { data, error } = await db().rpc(name, params)

  if (error) return { error: error.message || 'Something went wrong.' }

  return { data: data as T }
}

/** The latest status change per asset (for out-of-service reasons). Port slice 19 trucks side. */
export const latestStatusChanges = async (organizationId: string, assetIds: string[]) => {
  const latest = new Map<string, { to_status: string; reason: string | null; notes: string | null; source: string; actor_name: string | null; actor_user_id: string | null; changed_at: string }>()

  for (const chunk of inChunks(assetIds)) {
    const { data } = await db()
      .from('forge_asset_status_history')
      .select('asset_id, to_status, reason, notes, source, actor_name, actor_user_id, changed_at')
      .eq('organization_id', organizationId)
      .in('asset_id', chunk)
      .order('changed_at', { ascending: false })
      .limit(5000)

    for (const row of (data || []) as any[]) if (!latest.has(row.asset_id)) latest.set(row.asset_id, row)
  }

  return latest
}
