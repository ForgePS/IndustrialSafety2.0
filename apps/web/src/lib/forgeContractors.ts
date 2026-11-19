import { createServiceRoleClient } from '@repo/supabase/server'

import type { ContractorSettings, DocumentType, Standing } from '@/lib/forgeContractorRules'
import { companyStanding, DEFAULT_SETTINGS, workerStanding } from '@/lib/forgeContractorRules'
import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'
import { getTenantScopeAssignments } from '@/lib/forgeScope'

/**
 * Port slice 15: Contractor Safety data. Everything goes through the service role with the checks made here.
 *
 * Scope: a company with no location list may work anywhere and is visible to everyone who can view
 * contractors; one with a list is visible to location-scoped people at any of those locations. Location-scoped
 * managers can change only companies whose locations are all theirs (an "anywhere" company needs organization
 * scope).
 */

const db = () => createServiceRoleClient() as any

type Access = { effective: EffectivePermission[] }

export const CONTRACTOR_BUCKET = 'forge-contractors' as const
export const CONTRACTOR_FILE_MAX_BYTES = 12 * 1024 * 1024

export const grantOf = (access: Access, key: string) => access.effective.find(item => item.permissionKey === key && item.allowed) || null

/** null = organization-wide; otherwise the person's assigned locations. */
export const scopeLocations = async (organizationId: string, userId: string, permission: EffectivePermission | null): Promise<string[] | null> => {
  if (!permission) return []
  if (permission.scope === 'organization') return null

  const { locationIds } = await getTenantScopeAssignments({ organizationId, userId })

  return locationIds as string[]
}

export const companyVisible = (company: { location_ids: string[] }, locations: string[] | null) =>
  locations === null || !company.location_ids.length || company.location_ids.some(id => locations.includes(id))

export const companyManageable = (company: { location_ids: string[] }, locations: string[] | null) =>
  locations === null || (company.location_ids.length > 0 && company.location_ids.every(id => locations.includes(id)))

export const loadSettings = async (organizationId: string): Promise<ContractorSettings> => {
  const { data } = await db().from('forge_contractor_settings').select('*').eq('organization_id', organizationId).maybeSingle()

  if (!data) return DEFAULT_SETTINGS

  return { requiredDocuments: data.required_documents as DocumentType[], orientationValidMonths: data.orientation_valid_months, warningDays: data.warning_days }
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

/** What the person can do in Contractor Safety, with the location lists for each grant. */
export const contractorRights = async (organizationId: string, userId: string, access: Access) => {
  const [view, signIn, manage] = await Promise.all(
    ['contractor_safety.view', 'contractor_safety.sign_in', 'contractor_safety.manage'].map(key => {
      const grant = grantOf(access, key)

      return grant ? scopeLocations(organizationId, userId, grant).then(locations => ({ locations })) : Promise.resolve(null)
    })
  )

  return { view, signIn, manage, approve: Boolean(grantOf(access, 'contractor_safety.approve')), settings: Boolean(grantOf(access, 'contractor_safety.settings')) }
}

export type Rights = Awaited<ReturnType<typeof contractorRights>>

const COMPANY_COLUMNS =
  'id, organization_id, name, trade, contact_name, contact_email, contact_phone, sponsor_user_id, status, status_reason, status_changed_at, location_ids, emr, trir, notes, archived_at, created_at, updated_at'

export const DOCUMENT_COLUMNS = 'id, company_id, doc_type, title, coverage_amount, effective_on, expires_on, file_name, content_type, size_bytes, storage_path, archived_at, created_at'

const WORKER_COLUMNS = 'id, company_id, first_name, last_name, email, phone, trade, badge_number, active, orientation_completed_on, archived_at, created_at'

export const workerName = (worker: { first_name: string; last_name: string }) => `${worker.first_name} ${worker.last_name}`

/** Companies the person can see, each with its standing. */
export const listCompanies = async ({ organizationId, rights, includeArchived = false }: { organizationId: string; rights: Rights; includeArchived?: boolean }) => {
  if (!rights.view) return []

  const supabase = db()
  let query = supabase.from('forge_contractor_companies').select(COMPANY_COLUMNS).eq('organization_id', organizationId).order('name')

  if (!includeArchived) query = query.is('archived_at', null)

  const [{ data: companies, error }, { data: documents }, { data: workers }, settings] = await Promise.all([
    query,
    supabase.from('forge_contractor_documents').select('id, company_id, doc_type, expires_on, archived_at').eq('organization_id', organizationId).is('archived_at', null),
    supabase.from('forge_contractor_workers').select('id, company_id').eq('organization_id', organizationId).is('archived_at', null).eq('active', true),
    loadSettings(organizationId)
  ])

  if (error) throw new Error('Unable to load contractors: ' + error.message)

  const today = todayIso()

  return (companies || [])
    .filter((company: any) => companyVisible(company, rights.view!.locations))
    .map((company: any) => ({
      ...company,
      standing: companyStanding({ status: company.status, documents: (documents || []).filter((doc: any) => doc.company_id === company.id), settings, today }),
      workerCount: (workers || []).filter((worker: any) => worker.company_id === company.id).length,
      canManage: Boolean(rights.manage) && companyManageable(company, rights.manage!.locations)
    }))
}

/** One company with documents and workers (each with standing), or null if out of scope. */
export const loadCompany = async ({ organizationId, rights, id }: { organizationId: string; rights: Rights; id: string }) => {
  if (!rights.view || !/^[0-9a-f-]{36}$/i.test(id)) return null

  const supabase = db()
  const { data: company } = await supabase.from('forge_contractor_companies').select(COMPANY_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!company || !companyVisible(company, rights.view.locations)) return null

  const [{ data: documents }, { data: workers }, settings] = await Promise.all([
    supabase.from('forge_contractor_documents').select(DOCUMENT_COLUMNS).eq('company_id', company.id).order('doc_type').order('expires_on', { ascending: false }),
    supabase.from('forge_contractor_workers').select(WORKER_COLUMNS + ', forge_contractor_qualifications(name, expires_on, required)').eq('company_id', company.id).is('archived_at', null).order('last_name'),
    loadSettings(organizationId)
  ])

  const today = todayIso()
  const standing = companyStanding({ status: company.status, documents: documents || [], settings, today })

  return {
    company,
    settings,
    standing,
    documents: documents || [],
    workers: (workers || []).map((worker: any) => ({
      ...worker,
      standing: workerStanding({
        active: worker.active,
        orientationCompletedOn: worker.orientation_completed_on,
        qualifications: worker.forge_contractor_qualifications || [],
        company: standing,
        settings,
        today
      })
    })),
    canManage: Boolean(rights.manage) && companyManageable(company, rights.manage!.locations)
  }
}

/** One worker with qualifications, standing, recent visits and their company. */
export const loadWorker = async ({ organizationId, rights, id }: { organizationId: string; rights: Rights; id: string }) => {
  if (!rights.view || !/^[0-9a-f-]{36}$/i.test(id)) return null

  const supabase = db()
  const { data: worker } = await supabase.from('forge_contractor_workers').select(WORKER_COLUMNS).eq('organization_id', organizationId).eq('id', id).maybeSingle()

  if (!worker) return null

  const found = await loadCompany({ organizationId, rights, id: worker.company_id })

  if (!found) return null

  const [{ data: qualifications }, { data: visits }] = await Promise.all([
    supabase.from('forge_contractor_qualifications').select('id, name, issued_on, expires_on, required').eq('worker_id', worker.id).order('name'),
    supabase
      .from('forge_contractor_visits')
      .select('id, signed_in_at, signed_out_at, host_name, purpose, override_reason, locations(name)')
      .eq('worker_id', worker.id)
      .order('signed_in_at', { ascending: false })
      .limit(50)
  ])

  const standing = workerStanding({
    active: worker.active,
    orientationCompletedOn: worker.orientation_completed_on,
    qualifications: qualifications || [],
    company: found.standing,
    settings: found.settings,
    today: todayIso()
  })

  return { worker, company: found.company, canManage: found.canManage, qualifications: qualifications || [], visits: visits || [], standing }
}

/** Workers someone at the sign-in desk can pick: active workers of the companies they can see. */
export const signInCandidates = async ({ organizationId, rights }: { organizationId: string; rights: Rights }) => {
  const companies = await listCompanies({ organizationId, rights: { ...rights, view: rights.signIn } })
  const ids = companies.map((company: any) => company.id)

  if (!ids.length) return []

  const { data } = await db()
    .from('forge_contractor_workers')
    .select('id, company_id, first_name, last_name, badge_number')
    .in('company_id', ids)
    .is('archived_at', null)
    .eq('active', true)
    .order('last_name')
    .limit(5000)

  const names = new Map(companies.map((company: any) => [company.id, company.name]))

  return (data || []).map((worker: any) => ({ id: worker.id, name: workerName(worker), badge: worker.badge_number, company: names.get(worker.company_id) || '' }))
}

/** Who is signed in now, at the locations the person can see (null = all). */
export const onSiteNow = async (organizationId: string, locations: string[] | null) => {
  let query = db()
    .from('forge_contractor_visits')
    .select('id, worker_id, company_id, location_id, host_name, purpose, signed_in_at, override_reason, forge_contractor_workers(first_name, last_name, badge_number), forge_contractor_companies(name), locations(name)')
    .eq('organization_id', organizationId)
    .is('signed_out_at', null)
    .order('signed_in_at', { ascending: false })

  if (locations !== null) {
    if (!locations.length) return []
    query = query.in('location_id', locations)
  }

  const { data } = await query

  return data || []
}

export const companyLocations = async (organizationId: string) => {
  const { data } = await db().from('locations').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name')

  return (data || []) as { id: string; name: string }[]
}

/** A standing summary for badges. */
export const standingLabel = (standing: Standing) => (standing.cleared ? (standing.warnings.length ? 'Cleared, expiring soon' : 'Cleared') : 'Not cleared')
