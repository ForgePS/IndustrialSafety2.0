'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import {
  companyTimeZone,
  covers,
  forkliftRights,
  forkliftRpc,
  loadCheckItems,
  loadDefect,
  loadForkliftSettings,
  loadTruck,
  operatorProblem,
  personnelForUser,
  rightsAt,
  userNameMap
} from '@/lib/forgeForkliftAccess'
import type { CheckAnswer } from '@/lib/forgeForkliftRules'
import { applicableItems, checkAnswersProblem, DESIGNATIONS, isPowerSource, isUuid, POWER_SOURCES, settingsProblems, todayIn, truckProblems } from '@/lib/forgeForkliftRules'
import { tenantPermissionOrNull } from '@/lib/forgeLotoServer'

/**
 * Port slice 19: truck, pre-shift check, defect, checklist and settings actions. Every action finds the signed-in
 * person's rights again and checks them against the truck's location, whatever the page showed. Checks, defects
 * and service status go through the database workflow functions, whose errors are plain language and shown as-is.
 */

type Result = { error?: string; message?: string; id?: string }

const db = () => createServiceRoleClient() as any

const KEYS = ['forklifts.view', 'forklifts.check', 'forklifts.manage', 'forklifts.authorize']

const NOT_FOUND = "That forklift wasn't found, or you can't change it."
const NO_RIGHT = 'You do not have permission to do that on this forklift.'
const NO_COMPANY = 'Only someone who manages forklifts for the whole company can change these settings.'

/** The signed-in person and their forklift rights, or null. */
const signedIn = async () => {
  for (const key of KEYS) {
    const context = await tenantPermissionOrNull(key)

    if (!context) continue
    const organizationId = context.activeOrganization.id as string
    const userId = context.user.id as string
    const rights = await forkliftRights(organizationId, userId, context.access)

    return { organizationId, userId, rights }
  }

  return null
}

type Who = NonNullable<Awaited<ReturnType<typeof signedIn>>>

/** The person, the truck (in this company and their scope) and what they may do at its location. */
const withTruck = async (forkliftId: string) => {
  const who = await signedIn()

  if (!who) return { error: 'You do not have permission to do that.' as const }
  const truck = await loadTruck(who.organizationId, who.rights, forkliftId)

  if (!truck) return { error: NOT_FOUND as string }

  return { ...who, truck, at: rightsAt(who.rights, truck.asset.location_id) }
}

const audit = (who: Who, action: string, entityType: string, entityId: string, afterValue: Record<string, unknown> | null, beforeValue: Record<string, unknown> | null = null, reason: string | null = null) =>
  writeForgeAudit({ actorUserId: who.userId, organizationId: who.organizationId, action, entityType, entityId, beforeValue, afterValue, reason }).catch(() => {})

const refresh = (assetId?: string) => {
  revalidatePath('/forklifts', 'layout')
  if (assetId) revalidatePath('/assets/' + assetId)
}

const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

const numberOrNull = (value: unknown) => (value === null || value === undefined || String(value).trim() === '' ? null : Number(value))

/** The signed-in person's display name (their personnel record, else their user name). */
const actorName = async (who: Who, personnel: { name: string } | null) => personnel?.name || (await userNameMap([who.userId])).get(who.userId) || null

// ---------------------------------------------------------------------------
// Trucks
// ---------------------------------------------------------------------------

export type TruckValues = {
  asset_id?: string
  name?: string
  location_id?: string
  manufacturer?: string
  model?: string
  serial_number?: string
  truck_class?: string
  truck_type?: string
  power_source?: string
  rated_capacity_lb?: string
  load_center_in?: string
  max_lift_height_in?: string
  attachments?: string
  designation?: string
  nameplate_verified_on?: string
  notes?: string
}

/** The profile columns to save, or the first problem. */
const cleanProfile = (values: TruckValues, today: string, newAsset: boolean) => {
  const problems = truckProblems(
    {
      name: values.name,
      location_id: values.location_id,
      truck_class: values.truck_class,
      truck_type: values.truck_type,
      power_source: values.power_source,
      rated_capacity_lb: values.rated_capacity_lb,
      load_center_in: values.load_center_in,
      max_lift_height_in: values.max_lift_height_in,
      attachments: values.attachments,
      designation: values.designation,
      nameplate_verified_on: values.nameplate_verified_on || null
    },
    { newAsset, today }
  )

  if (problems.length) return { error: problems[0] }
  const designation = text(values.designation, 20)

  if (designation && !(designation in DESIGNATIONS)) return { error: 'Choose a type designation from the list.' }
  if (values.notes && values.notes.length > 4000) return { error: 'Notes must be 4,000 characters or fewer.' }
  const capacity = numberOrNull(values.rated_capacity_lb)

  if (capacity !== null && !Number.isInteger(capacity)) return { error: 'Rated capacity must be a whole number of pounds.' }

  return {
    row: {
      truck_class: values.truck_class as string,
      truck_type: values.truck_type as string,
      power_source: values.power_source as string,
      rated_capacity_lb: capacity,
      load_center_in: numberOrNull(values.load_center_in),
      max_lift_height_in: numberOrNull(values.max_lift_height_in),
      attachments: text(values.attachments, 500),
      designation,
      nameplate_verified_on: values.nameplate_verified_on || null,
      notes: text(values.notes, 4000)
    }
  }
}

/** Add a forklift: new equipment, or a profile on existing equipment (`values.asset_id`). */
export const createTruck = async (values: TruckValues): Promise<Result> => {
  const who = await signedIn()

  if (!who || !who.rights.manage) return { error: "You can't add forklifts." }
  const existing = Boolean(values.asset_id)
  const today = todayIn(await companyTimeZone(who.organizationId))
  const clean = cleanProfile(values, today, !existing)

  if ('error' in clean) return { error: clean.error }

  let data: Record<string, unknown> = { ...clean.row }

  if (existing) {
    if (!isUuid(values.asset_id)) return { error: 'Choose the equipment.' }
    const { data: asset } = await db().from('forge_assets').select('id, location_id').eq('organization_id', who.organizationId).eq('id', values.asset_id).maybeSingle()

    if (!asset) return { error: 'That equipment record was not found.' }
    if (!covers(who.rights.manage, asset.location_id)) return { error: "You can't manage forklifts at that equipment's location." }
    data = { ...data, asset_id: asset.id }
  } else {
    if (!covers(who.rights.manage, values.location_id)) return { error: "You can't add forklifts at that location." }
    data = {
      ...data,
      name: text(values.name, 200),
      location_id: values.location_id,
      manufacturer: text(values.manufacturer, 200),
      model: text(values.model, 200),
      serial_number: text(values.serial_number, 200)
    }
  }

  const result = await forkliftRpc<string>('forge_forklift_create', { p_organization_id: who.organizationId, p_actor_user_id: who.userId, p_data: data })

  if (result.error || !result.data) return { error: result.error || 'Unable to save the forklift.' }

  await audit(who, 'forklift.created', 'forge_forklift', result.data, data)
  refresh(existing ? (values.asset_id as string) : undefined)

  return { id: result.data, message: existing ? 'Equipment set up as a forklift.' : 'Forklift added.' }
}

/** Edit a forklift's profile and its equipment record (name, location, make, model, serial). */
export const updateTruck = async (forkliftId: string, values: TruckValues): Promise<Result> => {
  const loaded = await withTruck(forkliftId)

  if ('error' in loaded) return { error: loaded.error }
  if (!loaded.at.manage) return { error: NO_RIGHT }
  if (loaded.truck.asset.retired_at) return { error: 'This forklift is retired.' }
  if (!covers(loaded.rights.manage, values.location_id)) return { error: "You can't move forklifts to that location." }

  const today = todayIn(await companyTimeZone(loaded.organizationId))
  const clean = cleanProfile(values, today, true)

  if ('error' in clean) return { error: clean.error }

  const { data: location } = await db().from('locations').select('id').eq('organization_id', loaded.organizationId).eq('id', values.location_id).maybeSingle()

  if (!location) return { error: "Choose the forklift's location." }

  const asset = {
    name: text(values.name, 200),
    location_id: values.location_id,
    manufacturer: text(values.manufacturer, 200),
    model: text(values.model, 200),
    serial_number: text(values.serial_number, 200)
  }

  const supabase = db()

  const { error: assetError } = await supabase
    .from('forge_assets')
    .update({ ...asset, updated_by: loaded.userId, updated_at: new Date().toISOString() })
    .eq('organization_id', loaded.organizationId)
    .eq('id', loaded.truck.asset_id)

  if (assetError) return { error: assetError.message }

  const { error } = await supabase.from('forge_forklifts').update({ ...clean.row, updated_by: loaded.userId }).eq('organization_id', loaded.organizationId).eq('id', loaded.truck.id)

  if (error) return { error: /violates check constraint/.test(error.message) ? 'Some values are out of range. Check the form and try again.' : error.message }

  await supabase.rpc('forge_forklift_log', {
    p_organization_id: loaded.organizationId,
    p_forklift_id: loaded.truck.id,
    p_operator_id: null,
    p_action: 'edited',
    p_message: 'Forklift details edited',
    p_actor_user_id: loaded.userId
  })

  const { asset: beforeAsset, ...beforeProfile } = loaded.truck

  await audit(loaded, 'forklift.updated', 'forge_forklift', loaded.truck.id, { ...clean.row, ...asset }, { ...beforeProfile, ...beforeAsset } as unknown as Record<string, unknown>)
  refresh(loaded.truck.asset_id)

  return { id: loaded.truck.id, message: 'Forklift saved.' }
}

export const takeOutOfService = async (forkliftId: string, reason: string): Promise<Result> => {
  const loaded = await withTruck(forkliftId)

  if ('error' in loaded) return { error: loaded.error }
  if (!loaded.at.manage) return { error: NO_RIGHT }
  if (loaded.truck.asset.status === 'out_of_service') return { error: 'This forklift is already out of service.' }
  const clean = text(reason, 500)

  if (!clean) return { error: 'Say why the forklift is out of service.' }

  const result = await forkliftRpc('forge_forklift_take_out_of_service', { p_organization_id: loaded.organizationId, p_forklift_id: loaded.truck.id, p_actor_user_id: loaded.userId, p_reason: clean })

  if (result.error) return { error: result.error }
  await audit(loaded, 'forklift.out_of_service', 'forge_forklift', loaded.truck.id, { status: 'out_of_service' }, { status: loaded.truck.asset.status }, clean)
  refresh(loaded.truck.asset_id)

  return { message: 'Forklift taken out of service.' }
}

export const returnToService = async (forkliftId: string, notes: string): Promise<Result> => {
  const loaded = await withTruck(forkliftId)

  if ('error' in loaded) return { error: loaded.error }
  if (!loaded.at.manage) return { error: NO_RIGHT }
  if (loaded.truck.asset.status !== 'out_of_service') return { error: 'This forklift is not out of service.' }

  const result = await forkliftRpc('forge_forklift_return_to_service', {
    p_organization_id: loaded.organizationId,
    p_forklift_id: loaded.truck.id,
    p_actor_user_id: loaded.userId,
    p_notes: text(notes, 2000)
  })

  if (result.error) return { error: result.error }
  await audit(loaded, 'forklift.returned_to_service', 'forge_forklift', loaded.truck.id, { status: 'active' }, { status: 'out_of_service' }, text(notes, 2000))
  refresh(loaded.truck.asset_id)

  return { message: 'Forklift returned to service.' }
}

// ---------------------------------------------------------------------------
// Defects
// ---------------------------------------------------------------------------

export const reportDefect = async (forkliftId: string, input: { label?: string; description?: string; critical?: boolean }): Promise<Result> => {
  const loaded = await withTruck(forkliftId)

  if ('error' in loaded) return { error: loaded.error }
  if (!loaded.at.check) return { error: NO_RIGHT }
  const label = text(input.label, 300)
  const description = text(input.description, 4000)

  if (!label) return { error: 'Say what is wrong (for example "Horn").' }
  if (!description) return { error: 'Describe the defect.' }

  const personnel = await personnelForUser(loaded.organizationId, loaded.userId)

  const result = await forkliftRpc<string>('forge_forklift_report_defect', {
    p_organization_id: loaded.organizationId,
    p_forklift_id: loaded.truck.id,
    p_actor_user_id: loaded.userId,
    p_actor_personnel_id: personnel?.id || null,
    p_actor_name: await actorName(loaded, personnel),
    p_label: label,
    p_description: description,
    p_critical: input.critical !== false
  })

  if (result.error || !result.data) return { error: result.error || 'Unable to report the defect.' }

  const settings = await loadForkliftSettings(loaded.organizationId)
  const outOfService = input.critical !== false && settings.critical_defect_out_of_service

  await audit(loaded, 'forklift_defect.reported', 'forge_forklift_defect', result.data, { forklift_id: loaded.truck.id, label, description, critical: input.critical !== false })
  refresh(loaded.truck.asset_id)

  return { id: result.data, message: outOfService && loaded.truck.asset.status !== 'out_of_service' ? 'Defect reported. The forklift is out of service.' : 'Defect reported.' }
}

export const resolveDefect = async (defectId: string, input: { status?: string; note?: string; recordRepair?: boolean }): Promise<Result> => {
  const who = await signedIn()

  if (!who) return { error: 'You do not have permission to do that.' }
  const defect = await loadDefect(who.organizationId, defectId)

  if (!defect) return { error: 'Defect not found.' }
  const truck = await loadTruck(who.organizationId, who.rights, defect.forklift_id)

  if (!truck) return { error: 'Defect not found.' }
  if (!rightsAt(who.rights, truck.asset.location_id).manage) return { error: 'You do not have permission to close defects on this forklift.' }
  if (input.status !== 'repaired' && input.status !== 'not_a_defect') return { error: 'Close the defect as repaired or not a defect.' }

  const result = await forkliftRpc('forge_forklift_resolve_defect', {
    p_organization_id: who.organizationId,
    p_defect_id: defect.id,
    p_actor_user_id: who.userId,
    p_status: input.status,
    p_note: text(input.note, 4000),
    p_record_repair: input.status === 'repaired' && Boolean(input.recordRepair)
  })

  if (result.error) return { error: result.error }
  await audit(who, 'forklift_defect.closed', 'forge_forklift_defect', defect.id, { status: input.status, note: text(input.note, 4000), record_repair: Boolean(input.recordRepair) }, { status: 'open' })
  refresh(truck.asset_id)

  return { message: input.status === 'repaired' ? 'Defect closed as repaired.' : 'Defect closed as not a defect.' }
}

// ---------------------------------------------------------------------------
// Pre-shift checks
// ---------------------------------------------------------------------------

/** The operator a check is for: the person's own record, or (with manage) anyone they pick. */
const checkOperator = async (loaded: Exclude<Awaited<ReturnType<typeof withTruck>>, { error: string }>, personnelId: string | null | undefined) => {
  const own = await personnelForUser(loaded.organizationId, loaded.userId)

  if (personnelId && personnelId !== own?.id) {
    if (!loaded.at.manage) return { error: 'You can only do a pre-shift check as yourself.' }
    if (!isUuid(personnelId)) return { error: 'Choose the operator.' }

    return { id: personnelId }
  }

  if (!own) return { error: loaded.at.manage ? 'Choose the operator doing the check.' : 'Your login is not linked to a personnel record, so you cannot do a pre-shift check.' }

  return { id: own.id }
}

/** Whether the chosen operator may use this truck (for the check form to show before it is filled in). */
export const operatorProblemForCheck = async (forkliftId: string, personnelId: string): Promise<{ error?: string; problem?: string | null }> => {
  const loaded = await withTruck(forkliftId)

  if ('error' in loaded) return { error: loaded.error }
  if (!loaded.at.check) return { error: NO_RIGHT }
  const operator = await checkOperator(loaded, personnelId)

  if ('error' in operator) return { problem: operator.error }
  const settings = await loadForkliftSettings(loaded.organizationId)

  if (!settings.require_authorized_operator) return { problem: null }

  return { problem: await operatorProblem(loaded.organizationId, operator.id as string, loaded.truck.truck_class) }
}

export type CheckSubmission = { operatorPersonnelId?: string | null; hourMeter?: string | number | null; answers: CheckAnswer[]; notes?: string }

export const recordCheck = async (forkliftId: string, input: CheckSubmission): Promise<Result & { result?: string; outOfService?: boolean; defects?: number }> => {
  const loaded = await withTruck(forkliftId)

  if ('error' in loaded) return { error: loaded.error }
  if (!loaded.at.check) return { error: NO_RIGHT }
  const operator = await checkOperator(loaded, input.operatorPersonnelId)

  if ('error' in operator) return { error: operator.error }

  const items = applicableItems(await loadCheckItems(loaded.organizationId), loaded.truck.power_source)

  const answers = (Array.isArray(input.answers) ? input.answers : []).map(answer => ({
    item_id: String(answer?.item_id || ''),
    answer: answer?.answer || null,
    note: text(answer?.note, 1001)
  }))

  const problem = checkAnswersProblem(items, answers)

  if (problem) return { error: problem }

  const hourMeter = numberOrNull(input.hourMeter)

  if (hourMeter !== null && (!Number.isFinite(hourMeter) || hourMeter < 0)) return { error: 'Enter the hour meter as a number.' }
  if (input.notes && input.notes.length > 4000) return { error: 'Notes must be 4,000 characters or fewer.' }

  const result = await forkliftRpc<{ check_id: string; result: string; out_of_service: boolean; defects: number }>('forge_forklift_record_check', {
    p_organization_id: loaded.organizationId,
    p_forklift_id: loaded.truck.id,
    p_operator_personnel_id: operator.id,
    p_actor_user_id: loaded.userId,
    p_hour_meter: hourMeter,
    p_answers: answers,
    p_notes: text(input.notes, 4000),
    p_source: 'app',
    p_qr_code_id: null
  })

  if (result.error || !result.data) return { error: result.error || 'Unable to record the check.' }
  const outcome = result.data

  await audit(loaded, 'forklift_check.recorded', 'forge_forklift_check', outcome.check_id, {
    forklift_id: loaded.truck.id,
    operator_personnel_id: operator.id,
    result: outcome.result,
    out_of_service: outcome.out_of_service,
    defects: outcome.defects
  })
  refresh(loaded.truck.asset_id)

  return {
    id: outcome.check_id,
    result: outcome.result,
    outOfService: outcome.out_of_service,
    defects: outcome.defects,
    message: outcome.result === 'pass' ? 'Check passed.' : outcome.out_of_service ? 'Check failed. The forklift is out of service.' : 'Check recorded with defects.'
  }
}

// ---------------------------------------------------------------------------
// Settings and the company checklist (company-wide forklifts.manage)
// ---------------------------------------------------------------------------

const companyManager = async () => {
  const who = await signedIn()

  return who && who.rights.manage && who.rights.manage.locations === null ? who : null
}

export const saveForkliftSettings = async (values: Record<string, unknown>): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }

  const row = {
    evaluation_months: Number(values.evaluation_months),
    require_authorized_operator: values.require_authorized_operator === true,
    require_training: values.require_training === true,
    training_course_id: typeof values.training_course_id === 'string' && values.training_course_id ? values.training_course_id : null,
    critical_defect_out_of_service: values.critical_defect_out_of_service === true,
    expiry_notice_days: Number(values.expiry_notice_days)
  }

  const problems = settingsProblems(row)

  if (problems.length) return { error: problems[0] }

  if (row.training_course_id) {
    const { data } = await db().from('forge_training_courses').select('id').eq('organization_id', who.organizationId).eq('id', row.training_course_id).eq('is_active', true).maybeSingle()

    if (!data) return { error: 'Choose a training course.' }
  }

  const before = await loadForkliftSettings(who.organizationId)

  const { error } = await db()
    .from('forge_forklift_settings')
    .upsert({ ...row, organization_id: who.organizationId, updated_by: who.userId, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })

  if (error) return { error: /violates check constraint/.test(error.message) ? 'Some values are out of range. Check the form and try again.' : error.message }
  await audit(who, 'forklift_settings.updated', 'forge_forklift_settings', who.organizationId, row, before as unknown as Record<string, unknown>)
  refresh()

  return { message: 'Settings saved.' }
}

export type CheckItemInput = { section?: string; label?: string; power_sources?: string[]; critical?: boolean; allow_na?: boolean; sort_order?: string | number }

const cleanItem = (input: CheckItemInput) => {
  const label = text(input.label, 300)

  if (!label) return { error: 'Enter the checklist item.' }
  if (input.section !== 'visual' && input.section !== 'operational') return { error: 'Choose the section.' }
  const powers = [...new Set((input.power_sources || []).filter(Boolean))]

  if (powers.some(power => !isPowerSource(power))) return { error: 'Unknown power source.' }
  const sort = input.sort_order === undefined || input.sort_order === '' ? 500 : Number(input.sort_order)

  if (!Number.isInteger(sort) || sort < 0 || sort > 10000) return { error: 'Order must be a whole number from 0 to 10,000.' }

  return {
    row: {
      section: input.section,
      label,
      power_sources: powers.length && powers.length < POWER_SOURCES.length ? powers : null,
      critical: input.critical !== false,
      allow_na: input.allow_na === true,
      sort_order: sort
    }
  }
}

/** Add (itemId null) or edit a company checklist item. Built-in items can't be changed. */
export const saveCheckItem = async (itemId: string | null, input: CheckItemInput): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }
  const clean = cleanItem(input)

  if ('error' in clean) return { error: clean.error }
  const supabase = db()

  if (!itemId) {
    const { data, error } = await supabase
      .from('forge_forklift_check_items')
      .insert({ ...clean.row, organization_id: who.organizationId, created_by: who.userId })
      .select('id')
      .single()

    if (error || !data) return { error: error?.message || 'Unable to add the item.' }
    await audit(who, 'forklift_checklist_item.added', 'forge_forklift_settings', who.organizationId, { id: data.id, ...clean.row })
    refresh()

    return { id: data.id, message: 'Checklist item added.' }
  }

  if (!isUuid(itemId)) return { error: 'Checklist item not found.' }
  const { data: before } = await supabase.from('forge_forklift_check_items').select('*').eq('organization_id', who.organizationId).eq('id', itemId).maybeSingle()

  if (!before) return { error: 'Built-in checklist items can’t be changed.' }
  const { error } = await supabase.from('forge_forklift_check_items').update(clean.row).eq('organization_id', who.organizationId).eq('id', itemId)

  if (error) return { error: error.message }
  await audit(who, 'forklift_checklist_item.updated', 'forge_forklift_settings', who.organizationId, { id: itemId, ...clean.row }, before)
  refresh()

  return { id: itemId, message: 'Checklist item saved.' }
}

export const setCheckItemArchived = async (itemId: string, archived: boolean): Promise<Result> => {
  const who = await companyManager()

  if (!who) return { error: NO_COMPANY }
  if (!isUuid(itemId)) return { error: 'Checklist item not found.' }

  const { data, error } = await db()
    .from('forge_forklift_check_items')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('organization_id', who.organizationId)
    .eq('id', itemId)
    .select('id, label')
    .maybeSingle()

  if (error) return { error: error.message }
  if (!data) return { error: 'Built-in checklist items can’t be changed.' }
  await audit(who, archived ? 'forklift_checklist_item.archived' : 'forklift_checklist_item.restored', 'forge_forklift_settings', who.organizationId, { id: itemId, label: data.label, archived })
  refresh()

  return { message: archived ? 'Checklist item archived.' : 'Checklist item restored.' }
}
