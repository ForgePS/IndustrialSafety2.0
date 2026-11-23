'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { companyAllowedAt, cleanCompanyInput, cleanQualificationInput, cleanSettings, cleanSignIn, cleanWorkerInput, isUuid, signInDecision } from '@/lib/forgeContractorRules'
import { companyManageable, contractorRights, loadCompany, loadWorker, todayIso } from '@/lib/forgeContractors'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 15: Contractor Safety actions. Every check is made here, whatever the page showed.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const NOT_FOUND = "That record wasn't found, or you can't change it."

/** The signed-in person with their Contractor Safety rights, if they hold `key`. */
const withPermission = async (key: string) => {
  const context = await tenantPermissionOrNull(key)

  if (!context) return null

  const organizationId = context.activeOrganization.id as string
  const userId = context.user.id as string
  const rights = await contractorRights(organizationId, userId, context.access)

  return { organizationId, userId, rights }
}

type Who = NonNullable<Awaited<ReturnType<typeof withPermission>>>

const audit = (who: Who, action: string, entityType: string, entityId: string, afterValue: Record<string, unknown> | null, beforeValue: Record<string, unknown> | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action, entityType, entityId, beforeValue, afterValue }).catch(() => {})

const friendly = (message: string) => {
  if (/forge_contractor_companies_name/.test(message)) return 'A company with that name already exists.'
  if (/forge_contractor_workers_badge/.test(message)) return 'Another worker already has that badge number.'
  if (/forge_contractor_visits_open/.test(message)) return 'This worker is already signed in. Sign them out first.'
  if (/sponsor/.test(message)) return 'The sponsor must be an active member of the company.'

  return 'Unable to save: ' + message
}

/** A company the person may change: manage permission and every one of its locations in their scope. */
const manageableCompany = async (who: Who, id: string) => {
  const found = await loadCompany({ organizationId: who.organizationId, rights: who.rights, id })

  return found && found.canManage ? found : null
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export const saveCompany = async (input: Record<string, unknown> & { id?: string }): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who || !who.rights.manage) return { error: "You don't have permission to manage contractors." }

  const clean = cleanCompanyInput(input)

  if ('error' in clean) return { error: clean.error }

  const existing = input.id ? await manageableCompany(who, String(input.id)) : null

  if (input.id && !existing) return { error: NOT_FOUND }
  if (existing?.company.archived_at) return { error: 'Restore it before changing it.' }

  if (!companyManageable({ location_ids: clean.locationIds }, who.rights.manage.locations)) {
    return { error: clean.locationIds.length ? 'You can only pick your own locations.' : 'Companies that may work anywhere need company-wide permission. Pick one or more of your locations.' }
  }

  const supabase = db()

  if (clean.locationIds.length) {
    const { data: locations } = await supabase.from('locations').select('id').eq('organization_id', who.organizationId).in('id', clean.locationIds)

    if ((locations || []).length !== clean.locationIds.length) return { error: 'Pick valid locations.' }
  }

  const row = {
    organization_id: who.organizationId,
    name: clean.name,
    trade: clean.trade,
    contact_name: clean.contactName,
    contact_email: clean.contactEmail,
    contact_phone: clean.contactPhone,
    sponsor_user_id: clean.sponsorUserId,
    location_ids: clean.locationIds,
    emr: clean.emr,
    trir: clean.trir,
    notes: clean.notes,
    updated_by: who.userId,
    updated_at: new Date().toISOString()
  }

  const { data, error } = existing
    ? await supabase.from('forge_contractor_companies').update(row).eq('id', existing.company.id).select('id').single()
    : await supabase.from('forge_contractor_companies').insert({ ...row, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, existing ? 'contractor_company.updated' : 'contractor_company.created', 'contractor_company', data.id, row, existing?.company || null)
  revalidatePath('/contractors', 'layout')

  return { id: data.id, message: existing ? 'Saved.' : 'Company added. It needs approval before its workers can sign in.' }
}

const STATUS_MESSAGES: Record<string, string> = { approved: 'Approved.', pending: 'Moved back to pending.', suspended: 'Suspended.', inactive: 'Marked inactive.' }

/** Approve, suspend or deactivate a company (contractor_safety.approve). Suspending or deactivating needs a reason. */
export const setCompanyStatus = async (id: string, status: string, reasonRaw: string): Promise<Result> => {
  const who = await withPermission('contractor_safety.approve')

  if (!who) return { error: "You don't have permission to approve contractors." }
  if (!STATUS_MESSAGES[status]) return { error: 'Pick a status.' }

  const reason = String(reasonRaw || '').trim().slice(0, 500) || null

  if ((status === 'suspended' || status === 'inactive') && !reason) return { error: 'Give a reason.' }

  const found = await loadCompany({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || found.company.archived_at) return { error: NOT_FOUND }
  if (found.company.status === status) return { error: 'It already has that status.' }

  const change = { status, status_reason: reason, status_changed_by: who.userId, status_changed_at: new Date().toISOString(), updated_by: who.userId, updated_at: new Date().toISOString() }
  const { error } = await db().from('forge_contractor_companies').update(change).eq('id', found.company.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, 'contractor_company.status_changed', 'contractor_company', found.company.id, { status, reason, warnings: status === 'approved' ? found.standing.problems.map(problem => problem.message) : [] }, { status: found.company.status })
  revalidatePath('/contractors', 'layout')

  return {
    message:
      status === 'approved' && found.standing.problems.some(problem => !problem.code.startsWith('status_'))
        ? 'Approved. Its workers still can’t sign in until the missing or expired documents are in.'
        : STATUS_MESSAGES[status]
  }
}

export const archiveCompany = async (id: string, archive: boolean): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who) return { error: "You don't have permission to manage contractors." }

  const found = await manageableCompany(who, id)

  if (!found) return { error: NOT_FOUND }

  if (archive) {
    const { count } = await db().from('forge_contractor_visits').select('id', { count: 'exact', head: true }).eq('company_id', found.company.id).is('signed_out_at', null)

    if (count) return { error: 'Some of its workers are signed in. Sign them out first.' }
  }

  const { error } = await db()
    .from('forge_contractor_companies')
    .update({ archived_at: archive ? new Date().toISOString() : null, updated_by: who.userId, updated_at: new Date().toISOString() })
    .eq('id', found.company.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, archive ? 'contractor_company.archived' : 'contractor_company.restored', 'contractor_company', found.company.id, null)
  revalidatePath('/contractors', 'layout')

  return { message: archive ? 'Archived.' : 'Restored.' }
}

export const archiveDocument = async (companyId: string, documentId: string): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who) return { error: "You don't have permission to manage contractors." }

  const found = await manageableCompany(who, companyId)
  const document = found?.documents.find((item: any) => item.id === documentId && !item.archived_at)

  if (!found || !document) return { error: NOT_FOUND }

  const { error } = await db().from('forge_contractor_documents').update({ archived_at: new Date().toISOString() }).eq('id', document.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, 'contractor_document.archived', 'contractor_company', found.company.id, { document_id: document.id, doc_type: document.doc_type })
  revalidatePath('/contractors', 'layout')

  return { message: 'Document removed. It stays in the history.' }
}

// ---------------------------------------------------------------------------
// Workers and qualifications
// ---------------------------------------------------------------------------

export const saveWorker = async (input: Record<string, unknown> & { id?: string; companyId?: string }): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who) return { error: "You don't have permission to manage contractors." }

  const clean = cleanWorkerInput(input, todayIso())

  if ('error' in clean) return { error: clean.error }

  let existing: any = null
  let companyId = String(input.companyId || '')

  if (input.id) {
    const found = await loadWorker({ organizationId: who.organizationId, rights: who.rights, id: String(input.id) })

    if (!found || !found.canManage || found.worker.archived_at) return { error: NOT_FOUND }
    existing = found.worker
    companyId = found.company.id
  }

  const company = await manageableCompany(who, companyId)

  if (!company || company.company.archived_at) return { error: NOT_FOUND }

  const orientationChanged = (existing?.orientation_completed_on || null) !== clean.orientationCompletedOn

  const row = {
    organization_id: who.organizationId,
    company_id: company.company.id,
    first_name: clean.firstName,
    last_name: clean.lastName,
    email: clean.email,
    phone: clean.phone,
    trade: clean.trade,
    badge_number: clean.badgeNumber,
    active: clean.active,
    orientation_completed_on: clean.orientationCompletedOn,
    ...(orientationChanged ? { orientation_recorded_by: clean.orientationCompletedOn ? who.userId : null } : {}),
    updated_by: who.userId,
    updated_at: new Date().toISOString()
  }

  const supabase = db()

  const { data, error } = existing
    ? await supabase.from('forge_contractor_workers').update(row).eq('id', existing.id).select('id').single()
    : await supabase.from('forge_contractor_workers').insert({ ...row, created_by: who.userId }).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, existing ? 'contractor_worker.updated' : 'contractor_worker.created', 'contractor_worker', data.id, row, existing)
  revalidatePath('/contractors', 'layout')

  return { id: data.id, message: 'Saved.' }
}

export const archiveWorker = async (id: string): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who) return { error: "You don't have permission to manage contractors." }

  const found = await loadWorker({ organizationId: who.organizationId, rights: who.rights, id })

  if (!found || !found.canManage || found.worker.archived_at) return { error: NOT_FOUND }
  if (found.visits.some((visit: any) => !visit.signed_out_at)) return { error: 'They are signed in. Sign them out first.' }

  const { error } = await db().from('forge_contractor_workers').update({ archived_at: new Date().toISOString(), updated_by: who.userId, updated_at: new Date().toISOString() }).eq('id', found.worker.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, 'contractor_worker.archived', 'contractor_worker', found.worker.id, null)
  revalidatePath('/contractors', 'layout')

  return { message: 'Worker removed.' }
}

export const addQualification = async (workerId: string, input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who) return { error: "You don't have permission to manage contractors." }

  const clean = cleanQualificationInput(input)

  if ('error' in clean) return { error: clean.error }

  const found = await loadWorker({ organizationId: who.organizationId, rights: who.rights, id: workerId })

  if (!found || !found.canManage || found.worker.archived_at) return { error: NOT_FOUND }
  if (found.qualifications.length >= 100) return { error: 'A worker can have up to 100 qualifications.' }

  const row = { organization_id: who.organizationId, worker_id: found.worker.id, name: clean.name, issued_on: clean.issuedOn, expires_on: clean.expiresOn, required: clean.required, created_by: who.userId }
  const { data, error } = await db().from('forge_contractor_qualifications').insert(row).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, 'contractor_qualification.added', 'contractor_worker', found.worker.id, row)
  revalidatePath('/contractors', 'layout')

  return { id: data.id, message: 'Qualification added.' }
}

export const deleteQualification = async (workerId: string, qualificationId: string): Promise<Result> => {
  const who = await withPermission('contractor_safety.manage')

  if (!who) return { error: "You don't have permission to manage contractors." }

  const found = await loadWorker({ organizationId: who.organizationId, rights: who.rights, id: workerId })
  const qualification = found?.qualifications.find((item: any) => item.id === qualificationId)

  if (!found || !found.canManage || !qualification) return { error: NOT_FOUND }

  const { error } = await db().from('forge_contractor_qualifications').delete().eq('id', qualification.id).eq('worker_id', found.worker.id)

  if (error) return { error: friendly(error.message) }

  await audit(who, 'contractor_qualification.removed', 'contractor_worker', found.worker.id, null, qualification)
  revalidatePath('/contractors', 'layout')

  return { message: 'Qualification removed.' }
}

// ---------------------------------------------------------------------------
// Site sign-in
// ---------------------------------------------------------------------------

/**
 * Signs a worker in at a location (contractor_safety.sign_in at that location). A worker who isn't cleared, or a
 * company not approved for the location, is refused unless the person can manage contractors there and gives a
 * reason; the reason and the problems at the time stay on the visit.
 */
export const signIn = async (input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('contractor_safety.sign_in')

  if (!who || !who.rights.signIn) return { error: "You don't have permission to sign contractors in." }

  const clean = cleanSignIn(input)

  if ('error' in clean) return { error: clean.error }

  const deskLocations = who.rights.signIn.locations

  if (deskLocations !== null && !deskLocations.includes(clean.locationId)) return { error: 'You can only sign people in at your own locations.' }

  const supabase = db()
  const { data: location } = await supabase.from('locations').select('id').eq('organization_id', who.organizationId).eq('id', clean.locationId).maybeSingle()

  if (!location) return { error: 'Pick the location.' }

  const found = await loadWorker({ organizationId: who.organizationId, rights: { ...who.rights, view: who.rights.signIn }, id: clean.workerId })

  if (!found || found.worker.archived_at || found.company.archived_at) return { error: 'Pick the worker.' }

  const manage = who.rights.manage
  const canOverride = Boolean(manage) && (manage!.locations === null || manage!.locations.includes(clean.locationId))

  const decision = signInDecision({
    standing: found.standing,
    allowedHere: companyAllowedAt(found.company.location_ids, clean.locationId),
    alreadyOnSite: found.visits.some((visit: any) => !visit.signed_out_at),
    canOverride,
    overrideReason: clean.overrideReason
  })

  if (!decision.ok) return { error: decision.error }

  const row = {
    organization_id: who.organizationId,
    worker_id: found.worker.id,
    company_id: found.company.id,
    location_id: clean.locationId,
    host_name: clean.hostName,
    purpose: clean.purpose,
    signed_in_by: who.userId,
    override_reason: decision.overridden ? clean.overrideReason : null,
    override_problems: decision.overridden ? decision.problems : null
  }

  const { data, error } = await supabase.from('forge_contractor_visits').insert(row).select('id').single()

  if (error || !data) return { error: friendly(error?.message || 'no record') }

  await audit(who, decision.overridden ? 'contractor_visit.signed_in_override' : 'contractor_visit.signed_in', 'contractor_visit', data.id, row)
  revalidatePath('/contractors', 'layout')

  return { id: data.id, message: decision.overridden ? 'Signed in with an override. The reason is on the record.' : 'Signed in.' }
}

export const signOut = async (visitId: string): Promise<Result> => {
  const who = await withPermission('contractor_safety.sign_in')

  if (!who || !who.rights.signIn || !isUuid(visitId)) return { error: "You don't have permission to sign contractors out." }

  const { data: visit } = await db().from('forge_contractor_visits').select('id, location_id, signed_out_at').eq('organization_id', who.organizationId).eq('id', visitId).maybeSingle()
  const deskLocations = who.rights.signIn.locations

  if (!visit || (deskLocations !== null && !deskLocations.includes(visit.location_id))) return { error: NOT_FOUND }
  if (visit.signed_out_at) return { error: 'Already signed out.' }

  const { data, error } = await db()
    .from('forge_contractor_visits')
    .update({ signed_out_at: new Date().toISOString(), signed_out_by: who.userId })
    .eq('id', visit.id)
    .is('signed_out_at', null)
    .select('id')

  if (error) return { error: friendly(error.message) }
  if (!data?.length) return { error: 'Already signed out.' }

  await audit(who, 'contractor_visit.signed_out', 'contractor_visit', visit.id, null)
  revalidatePath('/contractors', 'layout')

  return { message: 'Signed out.' }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const saveSettings = async (input: Record<string, unknown>): Promise<Result> => {
  const who = await withPermission('contractor_safety.settings')

  if (!who) return { error: "You don't have permission to change contractor settings." }

  const clean = cleanSettings(input)

  if ('error' in clean) return { error: clean.error }

  const row = {
    organization_id: who.organizationId,
    required_documents: clean.requiredDocuments,
    orientation_valid_months: clean.orientationValidMonths,
    warning_days: clean.warningDays,
    updated_by: who.userId,
    updated_at: new Date().toISOString()
  }

  const { error } = await db().from('forge_contractor_settings').upsert(row, { onConflict: 'organization_id' })

  if (error) return { error: friendly(error.message) }

  await audit(who, 'contractor_settings.updated', 'contractor_settings', who.organizationId, row)
  revalidatePath('/contractors', 'layout')

  return { message: 'Settings saved.' }
}
