import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { assetWithinScope, getScopedAssets } from '@/lib/forgeAssets'
import { fetchAllRows } from '@/lib/forgeFetchAll'
import { lockHolderFromKey, lockHolderKey, searchTermForIlike, type LockoutSearch } from '@/lib/forgeLotoList'
import { getScopedPersonnel } from '@/lib/forgePersonnel'
import { storage } from '@/lib/platform/storage'

export const lotoProcedureWithinScope = async ({
  organizationId,
  userId,
  scope,
  procedure
}: {
  organizationId: string
  userId: string
  scope: string | null
  procedure: {
    organization_id: string
    asset_id: string
  }
}) => {
  if (procedure.organization_id !== organizationId) return false

  const supabase = createServiceRoleClient() as any

  const { data: asset } = await supabase
    .from('forge_assets')
    .select('organization_id, custodian_user_id, location_id, division_id')
    .eq('organization_id', organizationId)
    .eq('id', procedure.asset_id)
    .maybeSingle()

  if (!asset) return false

  return assetWithinScope({
    organizationId,
    userId,
    scope,
    asset
  })
}

export const getScopedLotoProcedures = async ({
  organizationId,
  userId,
  permission,
  includeRetired = false
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  includeRetired?: boolean
}) => {
  const supabase = createServiceRoleClient() as any

  const assets = await getScopedAssets({
    organizationId,
    userId,
    permission,
    includeRetired: true
  })

  const assetIds = assets.map((asset: any) => asset.id)

  if (!assetIds.length) return []

  let query = supabase
    .from('forge_loto_procedures')
    .select('*, forge_assets(id, asset_number, name, status, condition, location_id, division_id, locations(name, code), divisions(name, code))')
    .eq('organization_id', organizationId)
    .in('asset_id', assetIds)
    .order('updated_at', { ascending: false })

  if (!includeRetired) query = query.neq('status', 'retired')

  const { data, error } = await query

  if (error) throw new Error('Unable to load LOTO procedures: ' + error.message)

  return data || []
}

export const getLotoProcedureDetail = async ({
  organizationId,
  procedureId
}: {
  organizationId: string
  procedureId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [
    { data: energySources, error: energyError },
    { data: steps, error: stepsError },
    { data: reviews, error: reviewsError },
    { data: applications, error: applicationsError },
    { data: versions, error: versionsError }
  ] = await Promise.all([
    supabase
      .from('forge_loto_energy_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('sort_order'),
    supabase
      .from('forge_loto_steps')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('sort_order'),
    supabase
      .from('forge_loto_reviews')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('reviewed_at', { ascending: false }),
    supabase
      .from('forge_loto_applications')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('started_at', { ascending: false }),
    supabase
      .from('forge_loto_procedure_versions')
      .select('id, revision_number, created_at, created_by')
      .eq('organization_id', organizationId)
      .eq('procedure_id', procedureId)
      .order('revision_number', { ascending: false })
  ])

  if (energyError) throw new Error('Unable to load LOTO energy sources: ' + energyError.message)
  if (stepsError) throw new Error('Unable to load LOTO steps: ' + stepsError.message)
  if (reviewsError) throw new Error('Unable to load LOTO reviews: ' + reviewsError.message)
  if (applicationsError) throw new Error('Unable to load LOTO applications: ' + applicationsError.message)
  if (versionsError) throw new Error('Unable to load LOTO versions: ' + versionsError.message)

  return {
    energySources: energySources || [],
    steps: steps || [],
    reviews: reviews || [],
    applications: applications || [],
    versions: versions || []
  }
}

export const getScopedLotoAssets = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  return getScopedAssets({
    organizationId,
    userId,
    permission,
    includeRetired: false
  })
}

// ---------------------------------------------------------------------------
// Port slice 4: photos, returns, settings, lockouts and the public QR view
// ---------------------------------------------------------------------------

export type LotoPhoto = {
  id: string
  procedure_id: string
  energy_source_id: string | null
  file_name: string
  content_type: string
  caption: string | null
  annotations: unknown
  sort_order: number
  url: string | null
}

/** Photos for procedures with short-lived signed links. Callers check access first. */
export const getLotoPhotos = async ({
  organizationId,
  procedureIds
}: {
  organizationId: string
  procedureIds: string[]
}): Promise<LotoPhoto[]> => {
  if (!procedureIds.length) return []

  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_loto_photos')
    .select('id, procedure_id, energy_source_id, storage_path, file_name, content_type, caption, annotations, sort_order, created_at')
    .eq('organization_id', organizationId)
    .in('procedure_id', procedureIds)
    .order('sort_order')
    .order('created_at')

  if (error) throw new Error('Unable to load LOTO photos: ' + error.message)

  return Promise.all(
    (data || []).map(async (photo: any) => {
      const { url } = await storage().createSignedUrl('forge-loto', photo.storage_path, 60 * 30)

      return {
        id: photo.id,
        procedure_id: photo.procedure_id,
        energy_source_id: photo.energy_source_id,
        file_name: photo.file_name,
        content_type: photo.content_type,
        caption: photo.caption,
        annotations: photo.annotations,
        sort_order: photo.sort_order,
        url
      }
    })
  )
}

export const getLotoReviewReturns = async ({ organizationId, procedureId }: { organizationId: string; procedureId: string }) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_loto_review_returns')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('procedure_id', procedureId)
    .order('returned_at', { ascending: false })

  return (data || []) as Array<{ id: string; revision_number: number; notes: string; returned_by: string | null; returned_at: string }>
}

export type LotoSettings = {
  organization_id: string
  authorized_course_id: string | null
  require_authorized_training: boolean
  forge_training_courses: { id: string; title: string; course_code: string | null } | null
}

export const getLotoSettings = async (organizationId: string): Promise<LotoSettings> => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_loto_settings')
    .select('*, forge_training_courses(id, title, course_code)')
    .eq('organization_id', organizationId)
    .maybeSingle()

  return data || { organization_id: organizationId, authorized_course_id: null, require_authorized_training: false, forge_training_courses: null }
}

const LOCKOUT_SELECT =
  '*, forge_loto_procedures(id, procedure_number, title, status, revision_number), forge_assets(id, asset_number, name, location_id, division_id, custodian_user_id, locations(name, code)), forge_loto_application_locks(id, personnel_id, holder_name, lock_tag_id, applied_at, applied_by, removed_at, removed_by, removal_note)'

/** Lockouts on assets the user can see. `open` = issued or verified; `history` = the last 200 completed or canceled; `all` = every lockout (reports). */
export const getScopedLockouts = async ({
  organizationId,
  userId,
  permission,
  view,
  search
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
  view: 'open' | 'history' | 'all'
  search?: LockoutSearch
}) => {
  const assets = await getScopedAssets({ organizationId, userId, permission, includeRetired: true })
  let assetIds: string[] = assets.map((asset: any) => asset.id)

  if (search?.asset) assetIds = assetIds.filter(id => id === search.asset)
  if (!assetIds.length) return []

  const supabase = createServiceRoleClient() as any

  // Filters are kept as steps so the query can be rebuilt for each page (`all` pages through everything).
  const filters: ((query: any) => any)[] = []

  if (search?.procedure) filters.push(query => query.eq('procedure_id', search.procedure))

  // Lock holder: lockouts where that person (or typed name) held a lock at any point.
  const holder = search?.holder ? lockHolderFromKey(search.holder) : null

  if (holder) {
    let locks = supabase.from('forge_loto_application_locks').select('application_id').eq('organization_id', organizationId)

    locks = 'personnelId' in holder ? locks.eq('personnel_id', holder.personnelId) : locks.is('personnel_id', null).ilike('holder_name', holder.name.replace(/\*/g, '').replace(/[\\%_]/g, match => '\\' + match))

    const { data: lockRows, error: lockError } = await locks

    if (lockError) throw new Error('Unable to search lockouts: ' + lockError.message)

    const ids = Array.from(new Set((lockRows || []).map((row: any) => row.application_id as string)))

    if (!ids.length) return []
    filters.push(query => query.in('id', ids))
  }

  // Text: lockout number, work, equipment, procedure, holder name or lock / tag ID.
  const term = search?.q ? searchTermForIlike(search.q) : ''

  if (term) {
    const like = `%${term}%`

    const [{ data: lockRows }, { data: procedureRows }] = await Promise.all([
      supabase
        .from('forge_loto_application_locks')
        .select('application_id')
        .eq('organization_id', organizationId)
        .or(`holder_name.ilike.${like},lock_tag_id.ilike.${like}`)
        .limit(1000),
      supabase
        .from('forge_loto_procedures')
        .select('id')
        .eq('organization_id', organizationId)
        .in('asset_id', assetIds)
        .or(`procedure_number.ilike.${like},title.ilike.${like}`)
        .limit(1000)
    ])

    const lower = term.toLowerCase()

    const matchingAssets = assets
      .filter((asset: any) => assetIds.includes(asset.id))
      .filter((asset: any) => [asset.name, asset.asset_number].some(value => String(value || '').toLowerCase().includes(lower)))
      .map((asset: any) => asset.id as string)

    const clauses = [`lockout_number.ilike.${like}`, `work_description.ilike.${like}`]
    const lockIds = Array.from(new Set((lockRows || []).map((row: any) => row.application_id as string)))

    if (lockIds.length) clauses.push(`id.in.(${lockIds.join(',')})`)
    if (procedureRows?.length) clauses.push(`procedure_id.in.(${procedureRows.map((row: any) => row.id).join(',')})`)
    if (matchingAssets.length) clauses.push(`asset_id.in.(${matchingAssets.join(',')})`)

    filters.push(query => query.or(clauses.join(',')))
  }

  const build = () =>
    filters.reduce(
      (query, apply) => apply(query),
      supabase
        .from('forge_loto_applications')
        .select(LOCKOUT_SELECT)
        .eq('organization_id', organizationId)
        .in('asset_id', assetIds)
        .order('started_at', { ascending: false })
        .order('id')
    )

  // `all` (reports): every status, paged past the API's 1,000-row cap.
  if (view === 'all') return fetchAllRows(build, 'Unable to load lockouts')

  const query = view === 'open' ? build().in('status', ['in_progress', 'verified']) : build().in('status', ['completed', 'canceled']).limit(200)
  const { data, error } = await query

  if (error) throw new Error('Unable to load lockouts: ' + error.message)

  return data || []
}

/** Choices for the lockout search: lock holders, equipment and procedures that have had lockouts in scope. */
export const getLockoutSearchOptions = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const empty = { holders: [], assets: [], procedures: [] } as {
    holders: Array<{ id: string; name: string }>
    assets: Array<{ id: string; name: string }>
    procedures: Array<{ id: string; name: string }>
  }

  const assets = await getScopedAssets({ organizationId, userId, permission, includeRetired: true })
  const assetIds = assets.map((asset: any) => asset.id)

  if (!assetIds.length) return empty

  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_loto_applications')
    .select('id, asset_id, forge_assets(asset_number, name), forge_loto_procedures(id, procedure_number, title), forge_loto_application_locks(personnel_id, holder_name)')
    .eq('organization_id', organizationId)
    .in('asset_id', assetIds)
    .limit(5000)

  if (error) throw new Error('Unable to load lockout search options: ' + error.message)

  const holders = new Map<string, string>()
  const assetMap = new Map<string, string>()
  const procedureMap = new Map<string, string>()

  for (const row of data || []) {
    if (row.forge_assets) assetMap.set(row.asset_id, [row.forge_assets.asset_number, row.forge_assets.name].filter(Boolean).join(' · '))
    if (row.forge_loto_procedures) procedureMap.set(row.forge_loto_procedures.id, `${row.forge_loto_procedures.procedure_number} · ${row.forge_loto_procedures.title}`)

    for (const lock of row.forge_loto_application_locks || []) {
      const key = lockHolderKey(lock)

      if (!holders.has(key)) holders.set(key, lock.holder_name || 'Unnamed')
    }
  }

  const sorted = (map: Map<string, string>) =>
    Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  return { holders: sorted(holders), assets: sorted(assetMap), procedures: sorted(procedureMap) }
}

export const getLockoutDetail = async ({ organizationId, lockoutId }: { organizationId: string; lockoutId: string }) => {
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_loto_applications')
    .select(LOCKOUT_SELECT)
    .eq('organization_id', organizationId)
    .eq('id', lockoutId)
    .maybeSingle()

  if (error) throw new Error('Unable to load lockout: ' + error.message)

  if (data?.forge_loto_application_locks) {
    data.forge_loto_application_locks.sort((a: any, b: any) => String(a.applied_at).localeCompare(String(b.applied_at)))
  }

  return data || null
}

/** Display names for auth users (who verified, who removed a lock), from personnel then profiles. */
export const getUserNames = async ({ organizationId, userIds }: { organizationId: string; userIds: Array<string | null | undefined> }) => {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
  const names: Record<string, string> = {}

  if (!ids.length) return names

  const supabase = createServiceRoleClient() as any

  const { data: people } = await supabase
    .from('forge_personnel')
    .select('auth_user_id, first_name, last_name')
    .eq('organization_id', organizationId)
    .in('auth_user_id', ids)

  for (const person of people || []) names[person.auth_user_id] = `${person.first_name} ${person.last_name}`.trim()

  const missing = ids.filter(id => !names[id])

  if (missing.length) {
    const { data: users } = await supabase.from('users').select('user_id, name, email').in('user_id', missing)

    for (const user of users || []) names[user.user_id] = user.name || user.email || 'User'
  }

  return names
}

/**
 * People who can be picked as lock holders (within the executor's personnel scope), with whether they
 * hold current authorized-employee training when the tenant requires it (null when not required).
 */
export const getLockHolderOptions = async ({
  organizationId,
  userId,
  permission
}: {
  organizationId: string
  userId: string
  permission: EffectivePermission
}) => {
  const [people, settings] = await Promise.all([
    getScopedPersonnel({ organizationId, userId, permission }),
    getLotoSettings(organizationId)
  ])

  const active = (people || []).filter((person: any) => (person.employment_status || 'active') === 'active')
  const required = settings.require_authorized_training && settings.authorized_course_id
  let authorized = new Set<string>()

  if (required && active.length) {
    const supabase = createServiceRoleClient() as any
    const today = new Date().toISOString().slice(0, 10)

    const { data } = await supabase
      .from('forge_training_completions')
      .select('personnel_id, expires_at')
      .eq('organization_id', organizationId)
      .eq('course_id', settings.authorized_course_id)
      .eq('approval_status', 'approved')
      .is('archived_at', null)
      .in('result', ['passed', 'completed'])
      .in('personnel_id', active.map((person: any) => person.id))

    authorized = new Set((data || []).filter((row: any) => !row.expires_at || row.expires_at >= today).map((row: any) => row.personnel_id))
  }

  return {
    trainingRequired: required ? settings.forge_training_courses?.title || 'authorized employee' : null,
    options: active.map((person: any) => ({
      id: person.id as string,
      name: `${person.first_name} ${person.last_name}`.trim(),
      employeeNumber: (person.employee_number as string | null) || null,
      authorized: required ? authorized.has(person.id) : null
    }))
  }
}

/** Procedures on one asset, newest first. Used on the asset page. */
export const getLotoProceduresForAsset = async ({ organizationId, assetId }: { organizationId: string; assetId: string }) => {
  const supabase = createServiceRoleClient() as any

  const { data } = await supabase
    .from('forge_loto_procedures')
    .select('id, procedure_number, title, status, revision_number, next_review_date, forge_loto_applications(id, status)')
    .eq('organization_id', organizationId)
    .eq('asset_id', assetId)
    .order('updated_at', { ascending: false })

  return data || []
}

/**
 * What the public QR page shows for one asset: approved procedures only, with energy sources,
 * steps and photos. People, lockout history and review notes are not included.
 */
export const getPublicLotoForAsset = async ({ organizationId, assetId }: { organizationId: string; assetId: string }) => {
  const supabase = createServiceRoleClient() as any

  const [{ data: asset }, { data: organization }, { data: procedures }] = await Promise.all([
    supabase
      .from('forge_assets')
      .select('id, asset_number, name, locations(name), divisions(name)')
      .eq('organization_id', organizationId)
      .eq('id', assetId)
      .maybeSingle(),
    supabase.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
    supabase
      .from('forge_loto_procedures')
      .select(
        'id, procedure_number, title, description, revision_number, effective_date, next_review_date, required_ppe, special_precautions, precautions, restoration_notes, print_purpose, print_scope, print_enforcement, shutdown_sequence, restore_sequence, restoration_checks, forge_loto_energy_sources(*), forge_loto_steps(*), forge_loto_applications(status)'
      )
      .eq('organization_id', organizationId)
      .eq('asset_id', assetId)
      .eq('status', 'approved')
      .order('procedure_number')
  ])

  if (!asset) return null

  const list = (procedures || []).map((procedure: any) => {
    const { forge_loto_applications: applications, ...rest } = procedure

    return {
      ...rest,
      lockedOut: (applications || []).some((item: any) => item.status === 'in_progress' || item.status === 'verified'),
      forge_loto_energy_sources: [...(procedure.forge_loto_energy_sources || [])].sort((a: any, b: any) => a.sort_order - b.sort_order),
      forge_loto_steps: [...(procedure.forge_loto_steps || [])].sort((a: any, b: any) => a.sort_order - b.sort_order)
    }
  })

  const photos = await getLotoPhotos({ organizationId, procedureIds: list.map((item: any) => item.id) })

  return { asset, organizationName: organization?.name || '', procedures: list, photos }
}
