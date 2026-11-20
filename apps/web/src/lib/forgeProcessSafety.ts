import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { fetchAllRows, inChunks } from '@/lib/forgeFetchAll'
import { isUuid, mocBlockers } from '@/lib/forgeProcessSafetyRules'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 16: Process Safety data (management of change and process hazard analyses). Everything goes through
 * the service role with the checks made here. Location-scoped people see and change records at their own
 * locations only.
 */

const db = () => createServiceRoleClient() as any

type Access = { effective: EffectivePermission[] }

const grantOf = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** null = organization-wide; otherwise the person's assigned locations. */
const scopeLocations = async (organizationId: string, userId: string, grant: EffectivePermission | null): Promise<string[] | null> => {
  if (!grant) return []
  if (grant.scope === 'organization') return null

  const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })

  return locationIds as string[]
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

const KEYS = { view: 'process_safety.view', manage: 'process_safety.manage', approve: 'process_safety.approve', pssr: 'process_safety.pssr' } as const

/** What the person can do in Process Safety, with the location list behind each grant (null = everywhere). */
export const psmRights = async (organizationId: string, userId: string, access: Access) => {
  const entries = await Promise.all(
    Object.entries(KEYS).map(async ([name, key]) => {
      const grant = grantOf(access, key)

      return [name, grant ? { locations: await scopeLocations(organizationId, userId, grant) } : null] as const
    })
  )

  return { userId, ...(Object.fromEntries(entries) as Record<keyof typeof KEYS, { locations: string[] | null } | null>) }
}

export type PsmRights = Awaited<ReturnType<typeof psmRights>>

/** Whether a grant reaches a location. */
export const covers = (grant: { locations: string[] | null } | null, locationId: string | null) =>
  Boolean(grant) && (grant!.locations === null || (Boolean(locationId) && grant!.locations!.includes(locationId as string)))

const inScope = (query: any, grant: { locations: string[] | null }) => (grant.locations === null ? query : query.in('location_id', grant.locations.length ? grant.locations : ['00000000-0000-0000-0000-000000000000']))

export const companyLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string }[]
}

export const companyAssets = async (organizationId: string) => {
  const data = await fetchAllRows(
    () => db().from('forge_assets').select('id, asset_number, name, location_id').eq('organization_id', organizationId).is('retired_at', null).order('asset_number').order('id'),
    'Unable to load equipment'
  )

  return data.map((row: any) => ({ id: row.id as string, name: `${row.asset_number} ${row.name}`.trim(), locationId: row.location_id as string | null }))
}

export const companyPersonnel = async (organizationId: string) => {
  const data = await fetchAllRows(
    () =>
      db()
        .from('forge_personnel')
        .select('id, first_name, last_name, employment_status')
        .eq('organization_id', organizationId)
        .is('archived_at', null)
        .order('last_name')
        .order('id'),
    'Unable to load personnel'
  )

  return data
    .filter((row: any) => !row.employment_status || row.employment_status === 'active')
    .map((row: any) => ({ id: row.id as string, name: `${row.first_name} ${row.last_name}`.trim() }))
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
// Management of change
// ---------------------------------------------------------------------------

export const MOC_COLUMNS =
  'id, organization_id, moc_number, title, change_type, location_id, asset_id, description, reason, technical_basis, risk_level, impacts, is_temporary, temporary_until, requires_pssr, status, owner_user_id, pssr_answers, pssr_completed_at, pssr_completed_by, submitted_at, approved_at, implemented_at, implemented_by, closed_at, closed_by, canceled_at, canceled_by, cancel_reason, created_by, created_at, updated_at'

/** Changes the person can see, newest first. */
export const listMocs = async ({ organizationId, rights, status }: { organizationId: string; rights: PsmRights; status?: string }) => {
  if (!rights.view) return []

  const grant = rights.view

  return fetchAllRows(() => {
    const query = inScope(
      db().from('forge_moc_changes').select('id, moc_number, title, change_type, location_id, risk_level, status, is_temporary, temporary_until, owner_user_id, created_at').eq('organization_id', organizationId),
      grant
    )
      .order('created_at', { ascending: false })
      .order('id')

    return status ? query.eq('status', status) : query
  }, 'Unable to load changes')
}

/** Pending approvals waiting on this person. */
export const myPendingApprovals = async (organizationId: string, userId: string) => {
  const { data } = await db()
    .from('forge_moc_approvals')
    .select('moc_id, forge_moc_changes!inner(id, moc_number, title, status)')
    .eq('organization_id', organizationId)
    .eq('approver_user_id', userId)
    .eq('decision', 'pending')
    .eq('forge_moc_changes.status', 'in_review')

  return ((data || []) as any[]).map(row => row.forge_moc_changes)
}

/** One change with approvals, actions (and their Corrective Action status), documents, activity and blockers. */
export const loadMoc = async ({ organizationId, rights, id }: { organizationId: string; rights: PsmRights; id: string }) => {
  if (!isUuid(id)) return null

  const supabase = db()
  const { data: moc } = await supabase.from('forge_moc_changes').select(MOC_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!moc) return null

  const { data: myApproval } = await supabase.from('forge_moc_approvals').select('id').eq('moc_id', moc.id).eq('approver_user_id', rights.userId).maybeSingle()

  // Named approvers can always open the change they've been asked to review.
  if (!covers(rights.view, moc.location_id) && !myApproval) return null

  const [{ data: approvals }, { data: actions }, { data: documents }, { data: activity }, { data: phas }] = await Promise.all([
    supabase.from('forge_moc_approvals').select('id, approver_user_id, role_label, decision, comment, decided_at, created_at').eq('moc_id', moc.id).order('created_at'),
    supabase
      .from('forge_psm_actions')
      .select('id, phase, title, capa_id, removed_at, removed_reason, created_at, forge_corrective_actions(id, action_number, status, due_at, assigned_personnel_id)')
      .eq('moc_id', moc.id)
      .order('created_at'),
    supabase.from('forge_moc_documents').select('id, document_id, created_at, forge_documents(id, document_number, name, status, archived_at)').eq('moc_id', moc.id).order('created_at'),
    supabase.from('forge_psm_activity').select('id, activity_type, message, actor_user_id, created_at').eq('moc_id', moc.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('forge_pha_studies').select('id, pha_number, title, status').eq('moc_id', moc.id).is('archived_at', null).order('pha_number')
  ])

  const live = ((actions || []) as any[]).filter(action => !action.removed_at)

  const blockers = mocBlockers({
    requiresPssr: moc.requires_pssr,
    pssrCompletedAt: moc.pssr_completed_at,
    actions: live.map(action => ({ title: action.title, phase: action.phase, capaStatus: action.forge_corrective_actions?.status ?? null, capaNumber: action.forge_corrective_actions?.action_number ?? null }))
  })

  return {
    moc,
    approvals: (approvals || []) as any[],
    actions: (actions || []) as any[],
    documents: (documents || []) as any[],
    activity: (activity || []) as any[],
    phas: (phas || []) as any[],
    blockers,
    canManage: covers(rights.manage, moc.location_id),
    canApprove: Boolean(myApproval) && covers(rights.approve, moc.location_id),
    canPssr: covers(rights.pssr, moc.location_id)
  }
}

/**
 * Active members who hold process_safety.approve at a scope that reaches the location, except `excluded`.
 * Role grants and overrides narrow the list first; each candidate's effective access is then checked.
 */
export const approverCandidates = async ({ organizationId, locationId, excluded = [] }: { organizationId: string; locationId: string; excluded?: string[] }) => {
  const supabase = db()
  const { data: permission } = await supabase.from('forge_permission_registry').select('id').eq('permission_key', KEYS.approve).maybeSingle()

  if (!permission) return []

  const [{ data: grants }, { data: overrides }] = await Promise.all([
    supabase.from('forge_tenant_role_permissions').select('role_id').eq('permission_id', permission.id).eq('allowed', true),
    supabase.from('forge_user_permission_overrides').select('user_id').eq('organization_id', organizationId).eq('permission_id', permission.id).eq('override_state', 'allow')
  ])

  const roleIds = [...new Set<string>((grants || []).map((row: any) => row.role_id))]
  const roleUsers = roleIds.length ? (await supabase.from('forge_tenant_user_roles').select('user_id').eq('organization_id', organizationId).in('role_id', roleIds)).data || [] : []
  const candidates = [...new Set<string>([...roleUsers, ...(overrides || [])].map((row: any) => row.user_id))].filter(id => !excluded.includes(id))

  if (!candidates.length) return []

  const { data: members } = await supabase.from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true).in('user_id', candidates)

  const checked = await Promise.all(
    ((members || []) as any[]).map(async ({ user_id: userId }) => {
      const access = await getEffectiveTenantAccess({ organizationId, userId })
      const rights = { approve: grantOf(access, KEYS.approve) }

      if (!rights.approve) return null

      return covers({ locations: await scopeLocations(organizationId, userId, rights.approve) }, locationId) ? userId : null
    })
  )

  const ids = checked.filter((id): id is string => Boolean(id))
  const names = await userNameMap(ids)

  return ids.map(id => ({ id, name: names.get(id) || 'Unknown user' })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Active members of the company, for the change owner pick list. */
export const ownerCandidates = async (organizationId: string) => {
  const { data } = await db().from('organization_memberships').select('user_id').eq('organization_id', organizationId).eq('is_active', true)
  const ids = [...new Set<string>(((data || []) as any[]).map(row => row.user_id))]
  const names = await userNameMap(ids)

  return ids.map(id => ({ id, name: names.get(id) || 'Unknown user' })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Controlled documents that can be linked to a change. */
export const linkableDocuments = async (organizationId: string) => {
  const data = await fetchAllRows(
    () => db().from('forge_documents').select('id, document_number, name').eq('organization_id', organizationId).is('archived_at', null).order('document_number').order('id'),
    'Unable to load documents'
  )

  return data.map((row: any) => ({ id: row.id as string, name: `${row.document_number} ${row.name}`.trim() }))
}

// ---------------------------------------------------------------------------
// Process hazard analyses
// ---------------------------------------------------------------------------

export const PHA_COLUMNS =
  'id, organization_id, pha_number, title, process_unit, location_id, method, status, leader_name, team, started_on, completed_on, revalidate_by, summary, moc_id, created_by, archived_at, created_at, updated_at'

export const listPhas = async ({ organizationId, rights, includeArchived = false }: { organizationId: string; rights: PsmRights; includeArchived?: boolean }) => {
  if (!rights.view) return []

  const grant = rights.view

  return fetchAllRows(() => {
    const query = inScope(db().from('forge_pha_studies').select(PHA_COLUMNS).eq('organization_id', organizationId), grant)
      .order('revalidate_by', { ascending: true, nullsFirst: false })
      .order('id')

    return includeArchived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  }, 'Unable to load hazard analyses')
}

export const loadPha = async ({ organizationId, rights, id }: { organizationId: string; rights: PsmRights; id: string }) => {
  if (!isUuid(id) || !rights.view) return null

  const supabase = db()
  const { data: pha } = await supabase.from('forge_pha_studies').select(PHA_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!pha || !covers(rights.view, pha.location_id)) return null

  const [{ data: actions }, { data: activity }, { data: moc }] = await Promise.all([
    supabase
      .from('forge_psm_actions')
      .select('id, title, capa_id, removed_at, removed_reason, created_at, forge_corrective_actions(id, action_number, status, due_at)')
      .eq('pha_id', pha.id)
      .order('created_at'),
    supabase.from('forge_psm_activity').select('id, activity_type, message, actor_user_id, created_at').eq('pha_id', pha.id).order('created_at', { ascending: false }).limit(200),
    pha.moc_id ? supabase.from('forge_moc_changes').select('id, moc_number, title').eq('id', pha.moc_id).maybeSingle() : Promise.resolve({ data: null })
  ])

  return { pha, actions: (actions || []) as any[], activity: (activity || []) as any[], moc, canManage: covers(rights.manage, pha.location_id) }
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

/** One in-app and one email notice per recipient. Failures are reported, never thrown. */
export const queuePsmNotice = async ({
  organizationId,
  moc,
  eventType,
  notice,
  recipients,
  actorUserId
}: {
  organizationId: string
  moc: { id: string; moc_number: string }
  eventType: string
  notice: { title: string; body: string }
  recipients: string[]
  actorUserId: string
}) => {
  const to = [...new Set(recipients.filter(id => id && id !== actorUserId))]

  if (!to.length) return { ok: true as const }

  const supabase = db()

  try {
    const { data: event, error } = await supabase
      .from('forge_notification_events')
      .insert({
        organization_id: organizationId,
        source_module: 'process_safety',
        event_type: eventType,
        visibility: 'customer',
        resource_type: 'moc_change',
        resource_id: moc.id,
        actor_user_id: actorUserId,
        title: notice.title,
        body: notice.body,
        payload: { moc_number: moc.moc_number }
      })
      .select('id')
      .single()

    if (error || !event) throw new Error(error?.message || 'no event')

    const now = new Date().toISOString()

    const rows = to.flatMap(userId =>
      (['in_app', 'email'] as const).map(channel => ({
        event_id: event.id,
        organization_id: organizationId,
        recipient_user_id: userId,
        recipient_audience: 'customer',
        channel,
        status: channel === 'in_app' ? 'sent' : 'pending',
        title: notice.title,
        body: notice.body,
        link_path: '/process-safety/changes/' + moc.id,
        sent_at: channel === 'in_app' ? now : null
      }))
    )

    const { error: deliveryError } = await supabase.from('forge_notification_deliveries').insert(rows)

    if (deliveryError) throw new Error(deliveryError.message)

    return { ok: true as const }
  } catch (failure) {
    return { ok: false as const, error: 'Notices could not be queued: ' + (failure as Error).message }
  }
}
