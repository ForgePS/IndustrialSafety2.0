import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { eventCloseBlockers, isUuid } from '@/lib/forgeEnvironmentalRules'
import { fetchAllRows, inChunks } from '@/lib/forgeFetchAll'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 17: Environmental Safety data. Everything goes through the service role with the checks made here.
 * Location-scoped people see and change records at their own locations only; someone who reported an event can
 * always open it.
 */

const db = () => createServiceRoleClient() as any

type Access = { effective: EffectivePermission[] }

const grantOf = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

const scopeLocations = async (organizationId: string, userId: string, grant: EffectivePermission | null): Promise<string[] | null> => {
  if (!grant) return []
  if (grant.scope === 'organization') return null

  const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })

  return locationIds as string[]
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

const KEYS = { view: 'environmental.view', report: 'environmental.report', manage: 'environmental.manage' } as const

export type Grant = { locations: string[] | null } | null

export const envRights = async (organizationId: string, userId: string, access: Access) => {
  const entries = await Promise.all(
    Object.entries(KEYS).map(async ([name, key]) => {
      const grant = grantOf(access, key)

      return [name, grant ? { locations: await scopeLocations(organizationId, userId, grant) } : null] as const
    })
  )

  return { userId, ...(Object.fromEntries(entries) as Record<keyof typeof KEYS, Grant>) }
}

export type EnvRights = Awaited<ReturnType<typeof envRights>>

export const covers = (grant: Grant, locationId: string | null) => Boolean(grant) && (grant!.locations === null || (Boolean(locationId) && grant!.locations!.includes(locationId as string)))

const NONE = '00000000-0000-0000-0000-000000000000'

const inScope = (query: any, grant: { locations: string[] | null }) => (grant.locations === null ? query : query.in('location_id', grant.locations.length ? grant.locations : [NONE]))

/** Locations a grant reaches, from the company's active locations. */
export const scopedLocations = (locations: { id: string; name: string }[], grant: Grant) => (!grant ? [] : grant.locations === null ? locations : locations.filter(location => grant.locations!.includes(location.id)))

export const companyLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string }[]
}

export const companyMembers = async (organizationId: string) => {
  const { data } = await db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)
  const names = await userNameMap(((data || []) as any[]).map(row => row.user_id))

  return [...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export const companyPersonnel = async (organizationId: string) => {
  const data = await fetchAllRows(
    () => db().from('forge_personnel').select('id, first_name, last_name, employment_status').eq('organization_id', organizationId).is('archived_at', null).order('last_name').order('id'),
    'Unable to load personnel'
  )

  return data.filter((row: any) => !row.employment_status || row.employment_status === 'active').map((row: any) => ({ id: row.id as string, name: `${row.first_name} ${row.last_name}`.trim() }))
}

export const linkableDocuments = async (organizationId: string) => {
  const data = await fetchAllRows(
    () => db().from('forge_documents').select('id, document_number, name').eq('organization_id', organizationId).is('archived_at', null).order('document_number').order('id'),
    'Unable to load documents'
  )

  return data.map((row: any) => ({ id: row.id as string, name: `${row.document_number} ${row.name}`.trim() }))
}

export const userNameMap = async (ids: (string | null | undefined)[]) => {
  const unique = [...new Set(ids.filter(Boolean) as string[])]
  const names = new Map<string, string>()

  for (const chunk of inChunks(unique)) {
    const { data } = await db().from('users').select('user_id, name, email').in('user_id', chunk)

    for (const row of (data || []) as any[]) names.set(row.user_id, row.name || row.email || 'Unknown user')
  }

  for (const id of unique) if (!names.has(id)) names.set(id, 'Unknown user')

  return names
}

// ---------------------------------------------------------------------------
// Permits and obligations
// ---------------------------------------------------------------------------

export const PERMIT_COLUMNS = 'id, organization_id, title, permit_number, permit_type, agency, location_id, status, issued_on, effective_on, expires_on, document_id, notes, archived_at, created_at, updated_at'

export const OBLIGATION_COLUMNS = 'id, organization_id, permit_id, location_id, title, obligation_type, frequency, next_due_on, active, owner_user_id, notes, created_at'

export const listPermits = async ({ organizationId, rights, archived = false }: { organizationId: string; rights: EnvRights; archived?: boolean }) => {
  if (!rights.view) return []

  const grant = rights.view

  return fetchAllRows(() => {
    const query = inScope(db().from('forge_env_permits').select(PERMIT_COLUMNS).eq('organization_id', organizationId), grant).order('title').order('id')

    return archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  }, 'Unable to load permits')
}

export const loadPermit = async ({ organizationId, rights, id }: { organizationId: string; rights: EnvRights; id: string }) => {
  if (!isUuid(id) || !rights.view) return null

  const supabase = db()
  const { data: permit } = await supabase.from('forge_env_permits').select(PERMIT_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!permit || !covers(rights.view, permit.location_id)) return null

  const [{ data: obligations }, { data: document }] = await Promise.all([
    supabase.from('forge_env_obligations').select(OBLIGATION_COLUMNS).eq('permit_id', permit.id).order('active', { ascending: false }).order('next_due_on'),
    permit.document_id ? supabase.from('forge_documents').select('id, document_number, name').eq('id', permit.document_id).maybeSingle() : Promise.resolve({ data: null })
  ])

  return { permit, obligations: (obligations || []) as any[], document, canManage: covers(rights.manage, permit.location_id) }
}

export const listObligations = async ({ organizationId, rights, includeInactive = false }: { organizationId: string; rights: EnvRights; includeInactive?: boolean }) => {
  if (!rights.view) return []

  const grant = rights.view

  return fetchAllRows(() => {
    const query = inScope(db().from('forge_env_obligations').select(OBLIGATION_COLUMNS + ', forge_env_permits(title, permit_number)').eq('organization_id', organizationId), grant)
      .order('next_due_on', { ascending: true, nullsFirst: false })
      .order('id')

    return includeInactive ? query : query.eq('active', true)
  }, 'Unable to load obligations')
}

export const loadObligation = async ({ organizationId, rights, id }: { organizationId: string; rights: EnvRights; id: string }) => {
  if (!isUuid(id) || !rights.view) return null

  const supabase = db()
  const { data: obligation } = await supabase.from('forge_env_obligations').select(OBLIGATION_COLUMNS + ', forge_env_permits(id, title, permit_number)').eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!obligation || !covers(rights.view, obligation.location_id)) return null

  const { data: completions } = await supabase
    .from('forge_env_obligation_completions')
    .select('id, due_on, completed_on, result, notes, completed_by, created_at')
    .eq('obligation_id', obligation.id)
    .order('due_on', { ascending: false })
    .limit(100)

  return { obligation, completions: (completions || []) as any[], canManage: covers(rights.manage, obligation.location_id) }
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const EVENT_COLUMNS =
  'id, organization_id, event_number, event_type, occurred_at, location_id, permit_id, substance, quantity, unit, media, contained, reportable, agency_name, agency_notified_at, agency_reference, description, immediate_actions, status, closed_at, closed_by, closure_notes, reported_by, created_at, updated_at'

/** Events the person can see (their scope, plus any they reported), newest first. */
export const listEvents = async ({ organizationId, rights, status }: { organizationId: string; rights: EnvRights; status?: string }) => {
  const grant = rights.view

  const scoped = grant
    ? await fetchAllRows(() => {
        const query = inScope(db().from('forge_env_events').select(EVENT_COLUMNS).eq('organization_id', organizationId), grant).order('occurred_at', { ascending: false }).order('id')

        return status ? query.eq('status', status) : query
      }, 'Unable to load environmental events')
    : []

  if (grant?.locations === null || !rights.report) return scoped

  const { data: mine } = await db().from('forge_env_events').select(EVENT_COLUMNS).eq('organization_id', organizationId).eq('reported_by', rights.userId).limit(500)
  const seen = new Set(scoped.map((row: any) => row.id))
  const extra = ((mine || []) as any[]).filter(row => !seen.has(row.id) && (!status || row.status === status))

  return [...scoped, ...extra].sort((a: any, b: any) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
}

/** The scoped loader the report catalog reads (with the person's environmental.view grant). */
export const getScopedEnvEvents = async ({ organizationId, userId, permission }: { organizationId: string; userId: string; permission: EffectivePermission }) => {
  const locations = await scopeLocations(organizationId, userId, permission)

  return fetchAllRows(
    () =>
      inScope(db().from('forge_env_events').select(EVENT_COLUMNS + ', locations(name)').eq('organization_id', organizationId), { locations })
        .order('occurred_at', { ascending: false })
        .order('id'),
    'Unable to load environmental events'
  )
}

export const loadEvent = async ({ organizationId, rights, id }: { organizationId: string; rights: EnvRights; id: string }) => {
  if (!isUuid(id)) return null

  const supabase = db()
  const { data: event } = await supabase.from('forge_env_events').select(EVENT_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!event || !(covers(rights.view, event.location_id) || event.reported_by === rights.userId)) return null

  const [{ data: actions }, { data: permit }] = await Promise.all([
    supabase
      .from('forge_env_event_actions')
      .select('id, title, capa_id, removed_at, removed_reason, created_at, forge_corrective_actions(id, action_number, status, due_at)')
      .eq('event_id', event.id)
      .order('created_at'),
    event.permit_id ? supabase.from('forge_env_permits').select('id, title, permit_number').eq('id', event.permit_id).maybeSingle() : Promise.resolve({ data: null })
  ])

  const live = ((actions || []) as any[]).filter(action => !action.removed_at)

  return {
    event,
    permit,
    actions: (actions || []) as any[],
    blockers: eventCloseBlockers({
      reportable: event.reportable,
      agencyNotifiedAt: event.agency_notified_at,
      actions: live.map(action => ({ title: action.title, capaStatus: action.forge_corrective_actions?.status ?? null, capaNumber: action.forge_corrective_actions?.action_number ?? null }))
    }),
    canManage: covers(rights.manage, event.location_id)
  }
}

// ---------------------------------------------------------------------------
// Waste shipments
// ---------------------------------------------------------------------------

export const SHIPMENT_COLUMNS =
  'id, organization_id, manifest_number, location_id, shipped_on, generator_status, waste_description, waste_codes, quantity, unit, transporter, facility, return_received_on, exception_filed_on, notes, archived_at, created_at'

export const listShipments = async ({ organizationId, rights, archived = false }: { organizationId: string; rights: EnvRights; archived?: boolean }) => {
  if (!rights.view) return []

  const grant = rights.view

  return fetchAllRows(() => {
    const query = inScope(db().from('forge_env_waste_shipments').select(SHIPMENT_COLUMNS).eq('organization_id', organizationId), grant).order('shipped_on', { ascending: false }).order('id')

    return archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  }, 'Unable to load waste shipments')
}

export const loadShipment = async ({ organizationId, rights, id }: { organizationId: string; rights: EnvRights; id: string }) => {
  if (!isUuid(id) || !rights.view) return null

  const { data } = await db().from('forge_env_waste_shipments').select(SHIPMENT_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!data || !covers(rights.view, data.location_id)) return null

  return { shipment: data, canManage: covers(rights.manage, data.location_id) }
}
