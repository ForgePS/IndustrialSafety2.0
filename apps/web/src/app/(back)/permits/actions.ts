'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'
import { SETTINGS_FIELDS } from '@/components/permits/settingsFields'
import { companyTimeZone, covers, loadPermit, loadPermitSettings, loadSpace, permitRights, rightsAt } from '@/lib/forgePermitAccess'
import type { PermitType } from '@/lib/forgePermitRules'
import {
  detailsProblem,
  isPermitType,
  isUuid,
  localDateTimeToIso,
  normalizeDetails,
  PERMIT_ROLES,
  SPACE_HAZARDS,
  windowProblem
} from '@/lib/forgePermitRules'

/**
 * Port slice 18: permit, confined space, settings and link actions. Status changes are in workflowActions.ts and
 * go through the database workflow functions; everything here edits draft content or company setup. Every check
 * is made here, whatever the page showed.
 */

type Result = { error?: string; message?: string; id?: string; warning?: string }

const db = () => createServiceRoleClient() as any

const NOT_FOUND = "That permit wasn't found, or you can't change it."
const SPACE_NOT_FOUND = "That space wasn't found, or you can't change it."

/** The person, if they hold one of the keys (tried in order). */
const withPermission = async (...keys: string[]) => {
  for (const key of keys) {
    const context = await tenantPermissionOrNull(key)

    if (!context) continue
    const organizationId = context.activeOrganization.id as string
    const userId = context.user.id as string
    const rights = await permitRights(organizationId, userId, context.access)

    return { organizationId, userId, rights }
  }

  return null
}

type Who = NonNullable<Awaited<ReturnType<typeof withPermission>>>

const audit = (who: Who, action: string, entityType: string, entityId: string, afterValue: Record<string, unknown> | null, beforeValue: Record<string, unknown> | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action, entityType, entityId, beforeValue, afterValue }).catch(() => {})

const activity = async (who: Who, target: { permitId?: string; spaceId?: string }, action: string, detail: string | null = null) => {
  await db()
    .from('forge_permit_activity')
    .insert({ organization_id: who.organizationId, permit_id: target.permitId || null, space_id: target.spaceId || null, action, detail: detail ? detail.slice(0, 2000) : null, actor_user_id: who.userId })
}

const refresh = () => revalidatePath('/permits', 'layout')

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

const friendly = (message: string) => {
  if (/forge_confined_spaces_code_idx/.test(message)) return 'Another space already uses that code.'
  if (/forge_permit_links_(loto|document)_idx/.test(message)) return 'That is already linked.'
  if (/forge_permit_training_requirements_unique/.test(message)) return 'That course is already required for that role.'
  if (/forge_permit_check_definitions_org_idx/.test(message)) return 'That checklist item already exists.'
  if (/violates check constraint/.test(message)) return 'Some values are out of range. Check the form and try again.'

  return message
}

// ---------------------------------------------------------------------------
// Permits (draft content)
// ---------------------------------------------------------------------------

export type PermitInput = {
  locationId?: string
  spaceId?: string
  assetId?: string
  contractorCompanyId?: string
  title?: string
  workDescription?: string
  workArea?: string
  validFrom?: string
  validUntil?: string
  details?: Record<string, unknown>
}

/** Checks the basic columns and returns the row to save, or an error. Details may be incomplete on a draft. */
const cleanPermit = async (who: Who, type: PermitType, input: PermitInput, grant: { locations: string[] | null } | null) => {
  const locationId = String(input.locationId || '')
  const title = text(input.title, 200)
  const workDescription = text(input.workDescription, 5000)

  if (!isUuid(locationId)) return { error: 'Pick a location.' }
  if (!title) return { error: 'Enter a title.' }
  if (!workDescription) return { error: 'Describe the work.' }
  if (!covers(grant, locationId)) return { error: "You can't request permits at that location." }

  const supabase = db()
  const { data: location } = await supabase.from('locations').select('id').eq('organization_id', who.organizationId).eq('id', locationId).maybeSingle()

  if (!location) return { error: 'Pick a valid location.' }

  let spaceId: string | null = null

  if (type === 'confined_space') {
    spaceId = String(input.spaceId || '')
    const space = await loadSpace(who.organizationId, spaceId)

    if (!space) return { error: 'Pick the confined space.' }
    if (space.location_id !== locationId) return { error: 'That space is at a different location.' }
    if (space.archived_at) return { error: 'That space is archived.' }
    if (!space.permit_required) return { error: "That space doesn't need an entry permit." }
  }

  const assetId = input.assetId ? String(input.assetId) : null

  if (assetId) {
    const { data } = await supabase.from('forge_assets').select('id').eq('organization_id', who.organizationId).eq('id', isUuid(assetId) ? assetId : null).maybeSingle()

    if (!data) return { error: 'Pick valid equipment.' }
  }

  const contractorCompanyId = input.contractorCompanyId ? String(input.contractorCompanyId) : null

  if (contractorCompanyId) {
    const { data } = await supabase
      .from('forge_contractor_companies')
      .select('id')
      .eq('organization_id', who.organizationId)
      .eq('id', isUuid(contractorCompanyId) ? contractorCompanyId : null)
      .maybeSingle()

    if (!data) return { error: 'Pick a valid contractor.' }
  }

  const timeZone = await companyTimeZone(who.organizationId)
  const validFrom = localDateTimeToIso(String(input.validFrom || ''), timeZone)
  const validUntil = localDateTimeToIso(String(input.validUntil || ''), timeZone)

  if (!validFrom || !validUntil) return { error: 'Enter when the permit starts and ends.' }
  if (new Date(validUntil) <= new Date(validFrom)) return { error: 'The end time must be after the start time.' }

  const details = normalizeDetails(type, input.details && typeof input.details === 'object' ? input.details : {})
  const settings = await loadPermitSettings(who.organizationId)
  const warning = windowProblem(type, new Date(validFrom), new Date(validUntil), settings) || detailsProblem(type, details)

  return {
    row: {
      location_id: locationId,
      space_id: spaceId,
      asset_id: assetId,
      contractor_company_id: contractorCompanyId,
      title,
      work_description: workDescription,
      work_area: text(input.workArea, 300),
      valid_from: validFrom,
      valid_until: validUntil,
      details
    },
    warning
  }
}

export const createPermit = async (typeValue: string, input: PermitInput): Promise<Result> => {
  const who = await withPermission('permits.request')

  if (!who || !isPermitType(typeValue)) return { error: "You can't request permits." }
  const type = typeValue as PermitType
  const clean = await cleanPermit(who, type, input, who.rights.request)

  if ('error' in clean) return { error: clean.error }

  const supabase = db()
  const { data: number, error: numberError } = await supabase.rpc('next_forge_permit_number', { p_organization_id: who.organizationId, p_type: type })

  if (numberError || !number) return { error: 'Unable to number the permit: ' + (numberError?.message || 'no number') }

  const { data, error } = await supabase
    .from('forge_permits')
    .insert({ ...clean.row, organization_id: who.organizationId, permit_number: number, permit_type: type, status: 'draft', created_by: who.userId, updated_by: who.userId })
    .select('id, permit_number')
    .single()

  if (error || !data) return { error: friendly(error?.message || 'Unable to save the permit.') }

  await activity(who, { permitId: data.id }, 'created', `Draft ${data.permit_number} created`)
  await audit(who, 'permit.created', 'forge_permit', data.id, { ...clean.row, permit_number: data.permit_number, permit_type: type })
  refresh()

  return { id: data.id, message: `Draft ${data.permit_number} saved.`, warning: clean.warning || undefined }
}

export const updatePermit = async (permitId: string, input: PermitInput): Promise<Result> => {
  const who = await withPermission('permits.request', 'permits.manage')

  if (!who) return { error: NOT_FOUND }
  const permit = await loadPermit(who.organizationId, who.rights, permitId)

  if (!permit) return { error: NOT_FOUND }
  const here = rightsAt(who.rights, permit.location_id)

  if (!here.request && !here.manage) return { error: NOT_FOUND }
  if (permit.status !== 'draft') return { error: 'Only a draft permit can be edited. Withdraw it first.' }

  const clean = await cleanPermit(who, permit.permit_type, input, here.request ? who.rights.request : who.rights.manage)

  if ('error' in clean) return { error: clean.error }

  const { data, error } = await db()
    .from('forge_permits')
    .update({ ...clean.row, updated_by: who.userId, updated_at: new Date().toISOString() })
    .eq('organization_id', who.organizationId)
    .eq('id', permit.id)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()

  if (error || !data) return { error: friendly(error?.message || 'The permit changed while you were editing. Reload and try again.') }

  await activity(who, { permitId: permit.id }, 'edited', 'Permit details updated')
  await audit(who, 'permit.updated', 'forge_permit', permit.id, clean.row, {
    location_id: permit.location_id,
    space_id: permit.space_id,
    title: permit.title,
    valid_from: permit.valid_from,
    valid_until: permit.valid_until,
    details: permit.details
  })
  refresh()

  return { id: permit.id, message: 'Draft saved.', warning: clean.warning || undefined }
}

export const deletePermit = async (permitId: string): Promise<Result> => {
  const who = await withPermission('permits.request', 'permits.manage', 'permits.approve', 'permits.view')

  if (!who) return { error: NOT_FOUND }
  const permit = await loadPermit(who.organizationId, who.rights, permitId)

  if (!permit) return { error: NOT_FOUND }
  const mine = permit.requested_by === who.userId || permit.created_by === who.userId

  if (!mine && !rightsAt(who.rights, permit.location_id).manage) return { error: "You can't delete this permit." }
  if (permit.status !== 'draft') return { error: 'Only a draft permit can be deleted. Cancel it instead.' }

  const { error } = await db().from('forge_permits').delete().eq('organization_id', who.organizationId).eq('id', permit.id).eq('status', 'draft')

  if (error) return { error: friendly(error.message) }

  await audit(who, 'permit.deleted', 'forge_permit', permit.id, null, { permit_number: permit.permit_number, title: permit.title })
  refresh()

  return { message: `Draft ${permit.permit_number} deleted.` }
}

// ---------------------------------------------------------------------------
// Links (lockout procedures and controlled documents)
// ---------------------------------------------------------------------------

const linkablePermit = async (who: Who, permitId: string) => {
  const permit = await loadPermit(who.organizationId, who.rights, permitId)

  if (!permit) return null
  const here = rightsAt(who.rights, permit.location_id)

  if (!here.request && !here.approve && !here.manage) return null

  return permit
}

export const addPermitLink = async (permitId: string, kind: string, targetId: string): Promise<Result> => {
  const who = await withPermission('permits.request', 'permits.approve', 'permits.manage')

  if (!who) return { error: NOT_FOUND }
  const permit = await linkablePermit(who, permitId)

  if (!permit) return { error: NOT_FOUND }
  if (['closed', 'canceled'].includes(permit.status)) return { error: `This permit is ${permit.status} and can't be changed.` }
  if (!isUuid(targetId) || !['loto', 'document'].includes(kind)) return { error: 'Pick something to link.' }

  const supabase = db()
  const table = kind === 'loto' ? 'forge_loto_procedures' : 'forge_documents'
  const columns = kind === 'loto' ? 'id, procedure_number, title' : 'id, document_number, name'
  const { data: target } = await supabase.from(table).select(columns).eq('organization_id', who.organizationId).eq('id', targetId).maybeSingle()

  if (!target) return { error: kind === 'loto' ? 'Lockout procedure not found.' : 'Document not found.' }

  const { error } = await supabase.from('forge_permit_links').insert({
    organization_id: who.organizationId,
    permit_id: permit.id,
    loto_procedure_id: kind === 'loto' ? targetId : null,
    document_id: kind === 'document' ? targetId : null,
    linked_by: who.userId
  })

  if (error) return { error: friendly(error.message) }

  const label = kind === 'loto' ? `Lockout procedure ${target.procedure_number} ${target.title}` : `Document ${target.document_number} ${target.name}`

  await activity(who, { permitId: permit.id }, 'linked', label)
  await audit(who, 'permit.linked', 'forge_permit', permit.id, { kind, target_id: targetId })
  refresh()

  return { message: 'Linked.' }
}

export const removePermitLink = async (permitId: string, linkId: string): Promise<Result> => {
  const who = await withPermission('permits.request', 'permits.approve', 'permits.manage')

  if (!who) return { error: NOT_FOUND }
  const permit = await linkablePermit(who, permitId)

  if (!permit || !isUuid(linkId)) return { error: NOT_FOUND }
  if (['closed', 'canceled'].includes(permit.status)) return { error: `This permit is ${permit.status} and can't be changed.` }

  const supabase = db()

  const { data: link } = await supabase
    .from('forge_permit_links')
    .select('id, loto_procedure_id, document_id, forge_loto_procedures(procedure_number, title), forge_documents(document_number, name)')
    .eq('organization_id', who.organizationId)
    .eq('permit_id', permit.id)
    .eq('id', linkId)
    .maybeSingle()

  if (!link) return { error: 'That link was already removed.' }

  const { error } = await supabase.from('forge_permit_links').delete().eq('id', link.id).eq('permit_id', permit.id)

  if (error) return { error: friendly(error.message) }

  const label = link.loto_procedure_id
    ? `Lockout procedure ${link.forge_loto_procedures?.procedure_number || ''} ${link.forge_loto_procedures?.title || ''}`
    : `Document ${link.forge_documents?.document_number || ''} ${link.forge_documents?.name || ''}`

  await activity(who, { permitId: permit.id }, 'unlinked', label.replace(/\s+/g, ' ').trim())
  await audit(who, 'permit.unlinked', 'forge_permit', permit.id, null, { link_id: link.id, loto_procedure_id: link.loto_procedure_id, document_id: link.document_id })
  refresh()

  return { message: 'Link removed.' }
}

// ---------------------------------------------------------------------------
// Confined space register
// ---------------------------------------------------------------------------

export type SpaceInput = {
  locationId?: string
  spaceCode?: string
  name?: string
  description?: string
  permitRequired?: boolean
  hazards?: string[]
  entryPoints?: string
  isolationNotes?: string
  rescuePlan?: string
  lastEvaluatedOn?: string
}

export const saveSpace = async (spaceId: string | null, input: SpaceInput): Promise<Result> => {
  const who = await withPermission('permits.manage')

  if (!who) return { error: "You can't change the confined space register." }

  const existing = spaceId ? await loadSpace(who.organizationId, spaceId) : null

  if (spaceId && (!existing || !covers(who.rights.manage, existing.location_id))) return { error: SPACE_NOT_FOUND }

  const locationId = String(input.locationId || '')
  const name = text(input.name, 200)

  if (!isUuid(locationId)) return { error: 'Pick a location.' }
  if (!covers(who.rights.manage, locationId)) return { error: "You can't manage spaces at that location." }
  if (!name) return { error: 'Enter a name for the space.' }

  const hazards = [...new Set((Array.isArray(input.hazards) ? input.hazards : []).filter(item => item in SPACE_HAZARDS))]
  const evaluated = typeof input.lastEvaluatedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.lastEvaluatedOn) ? input.lastEvaluatedOn : null

  if (evaluated && evaluated > new Date().toISOString().slice(0, 10)) return { error: "The last evaluation date can't be in the future." }

  const row = {
    location_id: locationId,
    space_code: text(input.spaceCode, 40),
    name,
    description: text(input.description, 5000),
    permit_required: input.permitRequired !== false,
    hazards,
    entry_points: text(input.entryPoints, 2000),
    isolation_notes: text(input.isolationNotes, 5000),
    rescue_plan: text(input.rescuePlan, 5000),
    last_evaluated_on: evaluated,
    updated_by: who.userId,
    updated_at: new Date().toISOString()
  }

  const supabase = db()

  if (existing) {
    const { error } = await supabase.from('forge_confined_spaces').update(row).eq('organization_id', who.organizationId).eq('id', existing.id)

    if (error) return { error: friendly(error.message) }

    await activity(who, { spaceId: existing.id }, 'edited', 'Space details updated')
    await audit(who, 'confined_space.updated', 'forge_confined_space', existing.id, row, existing)
    refresh()

    return { id: existing.id, message: 'Space saved.' }
  }

  const { data, error } = await supabase
    .from('forge_confined_spaces')
    .insert({ ...row, organization_id: who.organizationId, created_by: who.userId })
    .select('id')
    .single()

  if (error || !data) return { error: friendly(error?.message || 'Unable to save the space.') }

  await activity(who, { spaceId: data.id }, 'created', `Space ${name} added`)
  await audit(who, 'confined_space.created', 'forge_confined_space', data.id, row)
  refresh()

  return { id: data.id, message: 'Space added.' }
}

export const archiveSpace = async (spaceId: string, archive: boolean): Promise<Result> => {
  const who = await withPermission('permits.manage')

  if (!who) return { error: SPACE_NOT_FOUND }
  const space = await loadSpace(who.organizationId, spaceId)

  if (!space || !covers(who.rights.manage, space.location_id)) return { error: SPACE_NOT_FOUND }

  const { error } = await db()
    .from('forge_confined_spaces')
    .update(archive ? { archived_at: new Date().toISOString(), archived_by: who.userId, updated_by: who.userId } : { archived_at: null, archived_by: null, updated_by: who.userId })
    .eq('organization_id', who.organizationId)
    .eq('id', space.id)

  if (error) return { error: friendly(error.message) }

  await activity(who, { spaceId: space.id }, archive ? 'archived' : 'restored', null)
  await audit(who, archive ? 'confined_space.archived' : 'confined_space.restored', 'forge_confined_space', space.id, { archived: archive })
  refresh()

  return { message: archive ? 'Space archived.' : 'Space restored.' }
}

// ---------------------------------------------------------------------------
// Company settings, training requirements, checklist items (company-wide permits.manage)
// ---------------------------------------------------------------------------

const companyManager = async () => {
  const who = await withPermission('permits.manage')

  return who && who.rights.manage && who.rights.manage.locations === null ? who : null
}

const NO_COMPANY = 'Only someone who manages permits for the whole company can change these settings.'

export const savePermitSettings = async (values: Record<string, unknown>): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }

  const row: Record<string, unknown> = {}

  for (const field of SETTINGS_FIELDS) {
    const key = field.key

    if (field.kind === 'boolean') {
      row[key] = values[key] === true || values[key] === 'true' || values[key] === 'on'
      continue
    }

    const value = Number(values[key])

    if (values[key] === '' || values[key] === null || values[key] === undefined || !Number.isFinite(value)) return { error: `Enter ${field.label.toLowerCase()}.` }
    if (value < field.min || value > field.max) return { error: `${field.label} must be between ${field.min} and ${field.max}.` }
    if (field.integer && !Number.isInteger(value)) return { error: `${field.label} must be a whole number.` }
    row[key] = value
  }

  if (Number(row.o2_min) >= Number(row.o2_max)) return { error: 'The oxygen minimum must be below the maximum.' }

  const before = await loadPermitSettings(who.organizationId)

  const { error } = await db()
    .from('forge_permit_settings')
    .upsert({ ...row, organization_id: who.organizationId, updated_by: who.userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })

  if (error) return { error: friendly(error.message) }

  await audit(who, 'permit_settings.updated', 'forge_permit_settings', who.organizationId, row, before as unknown as Record<string, unknown>)
  refresh()

  return { message: 'Settings saved.' }
}

export const addTrainingRequirement = async (typeValue: string, role: string, courseId: string): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }
  if (!isPermitType(typeValue)) return { error: 'Pick a permit type.' }
  if (!PERMIT_ROLES[typeValue].includes(role)) return { error: "That role isn't used on this kind of permit." }
  if (!isUuid(courseId)) return { error: 'Pick a course.' }

  const supabase = db()
  const { data: course } = await supabase.from('forge_training_courses').select('id, title').eq('organization_id', who.organizationId).eq('id', courseId).eq('is_active', true).maybeSingle()

  if (!course) return { error: 'Pick an active course.' }

  const { data, error } = await supabase
    .from('forge_permit_training_requirements')
    .insert({ organization_id: who.organizationId, permit_type: typeValue, role, course_id: courseId, created_by: who.userId })
    .select('id')
    .single()

  if (error || !data) return { error: friendly(error?.message || 'Unable to save.') }

  await audit(who, 'permit_training_requirement.added', 'forge_permit_settings', who.organizationId, { permit_type: typeValue, role, course_id: courseId, course: course.title })
  refresh()

  return { id: data.id, message: 'Training requirement added.' }
}

export const removeTrainingRequirement = async (requirementId: string): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }
  if (!isUuid(requirementId)) return { error: 'That requirement was already removed.' }

  const { data, error } = await db()
    .from('forge_permit_training_requirements')
    .delete()
    .eq('organization_id', who.organizationId)
    .eq('id', requirementId)
    .select('permit_type, role, course_id')
    .maybeSingle()

  if (error) return { error: friendly(error.message) }
  if (!data) return { error: 'That requirement was already removed.' }

  await audit(who, 'permit_training_requirement.removed', 'forge_permit_settings', who.organizationId, null, data)
  refresh()

  return { message: 'Training requirement removed.' }
}

const checkKeyFrom = (label: string) => {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)

  return 'co_' + (base || 'item')
}

export const addChecklistItem = async (typeValue: string, input: { label?: string; required?: boolean; allowNa?: boolean }): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }
  if (!isPermitType(typeValue)) return { error: 'Pick a permit type.' }
  const label = text(input.label, 300)

  if (!label) return { error: 'Enter the checklist item.' }

  const supabase = db()

  const { data: existing } = await supabase
    .from('forge_permit_check_definitions')
    .select('check_key, sort_order')
    .eq('permit_type', typeValue)
    .or(`organization_id.is.null,organization_id.eq.${who.organizationId}`)

  const keys = new Set(((existing || []) as any[]).map(row => row.check_key))
  const base = checkKeyFrom(label)
  let key = base

  for (let n = 2; keys.has(key); n += 1) key = `${base}_${n}`

  const sortOrder = Math.max(100, ...((existing || []) as any[]).map(row => Number(row.sort_order) || 0)) + 10

  const { data, error } = await supabase
    .from('forge_permit_check_definitions')
    .insert({ organization_id: who.organizationId, permit_type: typeValue, check_key: key, label, required: input.required !== false, allow_na: input.allowNa === true, sort_order: sortOrder })
    .select('id')
    .single()

  if (error || !data) return { error: friendly(error?.message || 'Unable to save.') }

  await audit(who, 'permit_checklist_item.added', 'forge_permit_settings', who.organizationId, { permit_type: typeValue, check_key: key, label })
  refresh()

  return { id: data.id, message: 'Checklist item added.' }
}

export const archiveChecklistItem = async (definitionId: string): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }
  if (!isUuid(definitionId)) return { error: "Built-in checklist items can't be removed." }

  const { data, error } = await db()
    .from('forge_permit_check_definitions')
    .update({ archived_at: new Date().toISOString() })
    .eq('organization_id', who.organizationId)
    .eq('id', definitionId)
    .is('archived_at', null)
    .select('permit_type, check_key, label')
    .maybeSingle()

  if (error) return { error: friendly(error.message) }
  if (!data) return { error: "Built-in checklist items can't be removed." }

  await audit(who, 'permit_checklist_item.archived', 'forge_permit_settings', who.organizationId, null, data)
  refresh()

  return { message: 'Checklist item removed. Permits that already answered it keep their answer.' }
}
