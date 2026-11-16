'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { DOT_DOCUMENT_KEYS, DOT_DOCUMENTS } from '@/lib/forgeDotRules'
import {
  cleanDate,
  dbMessage,
  loadCompanyDriverInScope,
  loadDotRecordInScope,
  loadDriverFileInScope,
  personInScope
} from '@/lib/forgeDotServer'
import { audit, cleanText } from '@/lib/forgeLotoServer'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; id?: string }

const hasPermission = (context: Awaited<ReturnType<typeof requireTenantPermission>>, key: string) =>
  context.access.effective.some(item => item.permissionKey === key && item.allowed)

const refreshDriver = (fileId?: string) => {
  revalidatePath('/dot')
  revalidatePath('/dot/drivers')
  if (fileId) revalidatePath('/dot/drivers/' + fileId)
}

const STATE = /^[A-Z]{2}$/

// ---------------------------------------------------------------------------
// Driver qualification files
// ---------------------------------------------------------------------------

export const createDriverFile = async ({ personnelId, licenseClass }: { personnelId: string; licenseClass: string }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const organizationId = context.activeOrganization.id

  if (!personnelId || !(await personInScope(context, personnelId))) return { error: 'Pick a driver from personnel you can manage.' }
  if (!['cdl', 'non_cdl'].includes(licenseClass)) return { error: 'Pick CDL or Non-CDL.' }

  const supabase = createServiceRoleClient() as any
  const { data: number, error: numberError } = await supabase.rpc('next_forge_dot_number', { p_organization_id: organizationId, p_kind: 'dqf' })

  if (numberError || !number) return { error: 'Unable to number the driver file.' }

  const { data, error } = await supabase
    .from('forge_dot_driver_files')
    .insert({ organization_id: organizationId, personnel_id: personnelId, file_number: number, license_class: licenseClass, created_by: context.user.id, updated_by: context.user.id })
    .select('id')
    .single()

  if (error || !data) return { error: dbMessage(error, 'Unable to create the driver file.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.dqf_created', entityType: 'dot_driver_file', entityId: data.id, after: { file_number: number, personnel_id: personnelId } })
  refreshDriver()

  return { id: data.id, message: 'Driver file created.' }
}

export type DriverFileValues = {
  license_class: string
  license_number: string
  license_state: string
  license_expires_on: string
  driver_restrictions: string
  medical_certificate_expires_on: string
  national_registry_number: string
  registry_verified: boolean
  diabetic_eye_exam_expires_on: string
  mvr_completed_on: string
  mvr_expires_on: string
  notes: string
}

export const updateDriverFile = async ({ fileId, values }: { fileId: string; values: DriverFileValues }): Promise<Result> => {
  const loaded = await loadDriverFileInScope(await requireTenantPermission('dot.edit'), fileId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, row } = loaded

  if (row.archived_at) return { error: 'Restore the driver file before editing it.' }

  const dates = {
    license_expires_on: cleanDate(values.license_expires_on),
    medical_certificate_expires_on: cleanDate(values.medical_certificate_expires_on),
    diabetic_eye_exam_expires_on: cleanDate(values.diabetic_eye_exam_expires_on),
    mvr_completed_on: cleanDate(values.mvr_completed_on),
    mvr_expires_on: cleanDate(values.mvr_expires_on)
  }

  if (Object.values(dates).some(value => value === undefined)) return { error: 'Use YYYY-MM-DD dates.' }

  const state = cleanText(values.license_state)?.toUpperCase() || null

  if (state && !STATE.test(state)) return { error: 'License state is a two-letter code, like AR.' }
  if (!['cdl', 'non_cdl'].includes(values.license_class)) return { error: 'Pick CDL or Non-CDL.' }

  const patch = {
    license_class: values.license_class,
    license_number: cleanText(values.license_number),
    license_state: state,
    driver_restrictions: cleanText(values.driver_restrictions),
    national_registry_number: cleanText(values.national_registry_number),
    registry_verified: Boolean(values.registry_verified),
    notes: cleanText(values.notes),
    ...dates,
    updated_by: context.user.id
  }

  const { error } = await supabase.from('forge_dot_driver_files').update(patch).eq('id', fileId)

  if (error) return { error: dbMessage(error, 'Unable to save the driver file.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.dqf_updated', entityType: 'dot_driver_file', entityId: fileId, before: row, after: patch })
  refreshDriver(fileId)

  return { message: 'Driver file saved.' }
}

export const saveDqfDocument = async ({
  fileId,
  documentType,
  placedOn,
  onFile,
  textValues
}: {
  fileId: string
  documentType: string
  placedOn: string
  onFile: string
  textValues: Record<string, string>
}): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const loaded = await loadDriverFileInScope(context, fileId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { organizationId, supabase, row } = loaded
  const def = DOT_DOCUMENTS.find(item => item.key === documentType)

  if (!def || !DOT_DOCUMENT_KEYS.includes(documentType)) return { error: 'Unknown document.' }
  if (row.archived_at) return { error: 'Restore the driver file before editing it.' }

  // Signing off the annual review is a certification (49 CFR 391.25).
  if (documentType === 'dqf_review' && !hasPermission(context, 'dot.approve')) return { error: 'Only people who can approve DOT records can record the annual review.' }

  const date = cleanDate(placedOn)

  if (date === undefined) return { error: 'Use a YYYY-MM-DD date.' }
  if (date && date > new Date().toISOString().slice(0, 10)) return { error: 'The date placed in the file cannot be in the future.' }
  if (onFile && !['yes', 'no', 'na'].includes(onFile)) return { error: 'Pick Yes, No or N/A.' }

  const allowed = new Set((def.textFields || []).map(field => field.key))

  const text = Object.fromEntries(
    Object.entries(textValues || {})
      .filter(([key]) => allowed.has(key))
      .map(([key, value]) => [key, String(value || '').trim().slice(0, 2000)])
      .filter(([, value]) => value)
  )

  const { error } = await supabase.from('forge_dot_dqf_documents').upsert(
    {
      organization_id: organizationId,
      driver_file_id: fileId,
      document_type: documentType,
      placed_on: date,
      on_file: onFile || null,
      text_values: text,
      updated_by: context.user.id
    },
    { onConflict: 'driver_file_id,document_type' }
  )

  if (error) return { error: dbMessage(error, 'Unable to save the document.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.dqf_document_saved', entityType: 'dot_driver_file', entityId: fileId, after: { document_type: documentType, placed_on: date, on_file: onFile || null } })
  refreshDriver(fileId)

  return { message: def.label + ' saved.' }
}

export const archiveDriverFile = async ({ fileId, restore }: { fileId: string; restore: boolean }): Promise<Result> => {
  const loaded = await loadDriverFileInScope(await requireTenantPermission('dot.edit'), fileId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, row } = loaded

  if (restore === !row.archived_at) return { error: restore ? 'This driver file is already open.' : 'This driver file is already archived.' }

  const patch = restore
    ? { archived_at: null, archived_by: null, archived_reason: null, updated_by: context.user.id }
    : { archived_at: new Date().toISOString(), archived_by: context.user.id, archived_reason: 'manual', updated_by: context.user.id }

  const { error } = await supabase.from('forge_dot_driver_files').update(patch).eq('id', fileId)

  if (error) return { error: dbMessage(error, 'Unable to update the driver file.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: restore ? 'dot.dqf_restored' : 'dot.dqf_archived', entityType: 'dot_driver_file', entityId: fileId })
  refreshDriver(fileId)

  return { message: restore ? 'Driver file restored.' : 'Driver file archived.' }
}

/** Uploaded files are kept in storage; removing one hides it from the file. */
export const removeDotFile = async ({ id }: { id: string }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const supabase = createServiceRoleClient() as any
  const organizationId = context.activeOrganization.id
  const { data: file } = await supabase.from('forge_dot_files').select('*').eq('organization_id', organizationId).eq('id', id).is('removed_at', null).maybeSingle()

  if (!file) return { error: 'File not found.' }

  const loaded = file.driver_file_id
    ? await loadDriverFileInScope(context, file.driver_file_id)
    : file.company_driver_id
      ? await loadCompanyDriverInScope(context, file.company_driver_id)
      : await loadDotRecordInScope(context, file.record_id)

  if (!('ok' in loaded)) return { error: 'File not found.' }

  const { error } = await supabase.from('forge_dot_files').update({ removed_at: new Date().toISOString(), removed_by: context.user.id }).eq('id', id)

  if (error) return { error: dbMessage(error, 'Unable to remove the file.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.file_removed', entityType: 'dot_file', entityId: id, before: { slot: file.slot, file_name: file.file_name } })
  revalidatePath('/dot', 'layout')

  return { message: 'File removed.' }
}

// ---------------------------------------------------------------------------
// Company drivers
// ---------------------------------------------------------------------------

export type CompanyDriverValues = {
  driver_name: string
  employee_number: string
  license_number: string
  license_state: string
  license_expires_on: string
  date_of_birth: string
  status: string
  mvr_consent_on: string
  initial_mvr_on: string
  last_mvr_on: string
  next_mvr_due_on: string
  insurance_effective_on: string
  notes: string
}

const companyDriverPatch = (values: Partial<CompanyDriverValues>) => {
  const dates = {
    license_expires_on: cleanDate(values.license_expires_on),
    date_of_birth: cleanDate(values.date_of_birth),
    mvr_consent_on: cleanDate(values.mvr_consent_on),
    initial_mvr_on: cleanDate(values.initial_mvr_on),
    last_mvr_on: cleanDate(values.last_mvr_on),
    next_mvr_due_on: cleanDate(values.next_mvr_due_on),
    insurance_effective_on: cleanDate(values.insurance_effective_on)
  }

  if (Object.values(dates).some(value => value === undefined)) return { error: 'Use YYYY-MM-DD dates.' } as const

  const state = cleanText(values.license_state)?.toUpperCase() || null

  if (state && !STATE.test(state)) return { error: 'License state is a two-letter code, like AR.' } as const
  if (!['on_insurance', 'pending_mvr', 'suspended', 'removed'].includes(String(values.status))) return { error: 'Pick a status.' } as const

  const name = cleanText(values.driver_name)

  if (!name) return { error: 'Enter the driver name.' } as const

  return {
    patch: {
      driver_name: name,
      employee_number: cleanText(values.employee_number),
      license_number: cleanText(values.license_number),
      license_state: state,
      status: values.status,
      notes: cleanText(values.notes),
      ...dates
    }
  } as const
}

export const createCompanyDriver = async ({ personnelId, values }: { personnelId: string | null; values: CompanyDriverValues }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const organizationId = context.activeOrganization.id

  if (!(await personInScope(context, personnelId))) return { error: personnelId ? 'Pick personnel you can manage.' : 'Only organization-wide DOT editors can add drivers who are not in personnel.' }

  const built = companyDriverPatch(values)

  if ('error' in built) return { error: built.error }

  const supabase = createServiceRoleClient() as any

  // Linking a person: their company-driver flag owns the roster row (a trigger creates it).
  if (personnelId) {
    const { data: existing } = await supabase.from('forge_dot_company_drivers').select('id').eq('personnel_id', personnelId).maybeSingle()

    if (existing) return { error: 'This person is already on the company-driver roster.' }

    await supabase.from('forge_personnel').update({ is_company_driver: true, updated_by: context.user.id }).eq('id', personnelId).eq('organization_id', organizationId)
    const { data: row } = await supabase.from('forge_dot_company_drivers').select('id').eq('personnel_id', personnelId).maybeSingle()

    if (!row) return { error: 'Unable to add the driver.' }

    const { error } = await supabase.from('forge_dot_company_drivers').update({ ...built.patch, updated_by: context.user.id }).eq('id', row.id)

    if (error) return { error: dbMessage(error, 'Unable to add the driver.') }

    await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.company_driver_created', entityType: 'dot_company_driver', entityId: row.id, after: built.patch })
    revalidatePath('/dot/company-drivers')

    return { id: row.id, message: 'Driver added.' }
  }

  const { data, error } = await supabase
    .from('forge_dot_company_drivers')
    .insert({ organization_id: organizationId, ...built.patch, created_by: context.user.id, updated_by: context.user.id })
    .select('id')
    .single()

  if (error || !data) return { error: dbMessage(error, 'Unable to add the driver.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.company_driver_created', entityType: 'dot_company_driver', entityId: data.id, after: built.patch })
  revalidatePath('/dot/company-drivers')

  return { id: data.id, message: 'Driver added.' }
}

export const updateCompanyDriver = async ({ driverId, values }: { driverId: string; values: CompanyDriverValues }): Promise<Result> => {
  const loaded = await loadCompanyDriverInScope(await requireTenantPermission('dot.edit'), driverId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase, row } = loaded
  const built = companyDriverPatch(values)

  if ('error' in built) return { error: built.error }

  const { error } = await supabase.from('forge_dot_company_drivers').update({ ...built.patch, updated_by: context.user.id }).eq('id', driverId)

  if (error) return { error: dbMessage(error, 'Unable to save the driver.') }

  if (row.status !== built.patch.status) {
    await supabase.from('forge_dot_mvr_events').insert({
      organization_id: organizationId,
      company_driver_id: driverId,
      kind: 'status_changed',
      note: `${row.status} → ${built.patch.status}`,
      actor_user_id: context.user.id
    })
  }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.company_driver_updated', entityType: 'dot_company_driver', entityId: driverId, before: row, after: built.patch })
  revalidatePath('/dot/company-drivers')
  revalidatePath('/dot/company-drivers/' + driverId)

  return { message: 'Driver saved.' }
}

/** Links an unlinked roster row to a person (1.0 merge panel). */
export const linkCompanyDriver = async ({ driverId, personnelId }: { driverId: string; personnelId: string }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const loaded = await loadCompanyDriverInScope(context, driverId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { organizationId, supabase, row } = loaded

  if (row.personnel_id) return { error: 'This driver is already linked to personnel.' }
  if (!personnelId || !(await personInScope(context, personnelId))) return { error: 'Pick personnel you can manage.' }

  const { data: other } = await supabase.from('forge_dot_company_drivers').select('id').eq('personnel_id', personnelId).maybeSingle()

  if (other) return { error: 'That person already has a roster row. Remove one of the two first.' }

  const { error } = await supabase.from('forge_dot_company_drivers').update({ personnel_id: personnelId, updated_by: context.user.id }).eq('id', driverId)

  if (error) return { error: dbMessage(error, 'Unable to link the driver.') }

  // The flag must agree with the roster; the trigger finds the existing row and leaves it.
  await supabase.from('forge_personnel').update({ is_company_driver: true, updated_by: context.user.id }).eq('id', personnelId).eq('is_company_driver', false)
  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.company_driver_linked', entityType: 'dot_company_driver', entityId: driverId, after: { personnel_id: personnelId } })
  revalidatePath('/dot/company-drivers')
  revalidatePath('/dot/company-drivers/' + driverId)

  return { message: 'Driver linked to personnel.' }
}

export const startMvrSample = async ({ year, force }: { year: number; force: boolean }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')

  if (context.permission.scope !== 'organization') return { error: 'Drawing the annual sample needs organization-wide DOT access.' }

  const supabase = createServiceRoleClient() as any
  const organizationId = context.activeOrganization.id
  const { data, error } = await supabase.rpc('forge_dot_start_mvr_sample', { p_organization_id: organizationId, p_year: year, p_force: force, p_actor_user_id: context.user.id })

  if (error) return { error: dbMessage(error, 'Unable to draw the sample.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.mvr_sample_drawn', entityType: 'dot_mvr_sample', entityId: organizationId, after: { year, size: data, force } })
  revalidatePath('/dot/company-drivers')
  revalidatePath('/dot')

  return { message: `${data} driver${data === 1 ? '' : 's'} selected for the ${year} MVR sample.` }
}

export const completeMvrSample = async ({ driverId, completedOn, note }: { driverId: string; completedOn: string; note: string }): Promise<Result> => {
  const loaded = await loadCompanyDriverInScope(await requireTenantPermission('dot.edit'), driverId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { context, organizationId, supabase } = loaded
  const date = cleanDate(completedOn)

  if (!date) return { error: 'Enter the date the MVR was pulled.' }

  const { error } = await supabase.rpc('forge_dot_complete_mvr_sample', {
    p_organization_id: organizationId,
    p_company_driver_id: driverId,
    p_completed_on: date,
    p_note: note || null,
    p_actor_user_id: context.user.id
  })

  if (error) return { error: dbMessage(error, 'Unable to record the MVR.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.mvr_sample_completed', entityType: 'dot_company_driver', entityId: driverId, after: { completed_on: date } })
  revalidatePath('/dot/company-drivers')
  revalidatePath('/dot/company-drivers/' + driverId)
  revalidatePath('/dot')

  return { message: 'Sampled MVR recorded.' }
}

// ---------------------------------------------------------------------------
// Other DOT records
// ---------------------------------------------------------------------------

export type DotRecordValues = {
  category: string
  title: string
  record_date: string
  personnel_id: string
  location_id: string
  description: string
  outcome: string
}

const recordPatch = (values: DotRecordValues) => {
  const date = cleanDate(values.record_date)

  if (date === undefined) return { error: 'Use a YYYY-MM-DD date.' } as const
  if (!['roadside_inspection', 'accident', 'drug_alcohol', 'company', 'other'].includes(values.category)) return { error: 'Pick a category.' } as const

  const title = cleanText(values.title)

  if (!title) return { error: 'Enter a title.' } as const

  return {
    patch: {
      category: values.category,
      title,
      record_date: date,
      personnel_id: values.personnel_id || null,
      location_id: values.location_id || null,
      description: cleanText(values.description),
      outcome: cleanText(values.outcome)
    }
  } as const
}

export const createDotRecord = async ({ values }: { values: DotRecordValues }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const organizationId = context.activeOrganization.id
  const built = recordPatch(values)

  if ('error' in built) return { error: built.error }
  if (!(await personInScope(context, built.patch.personnel_id))) return { error: built.patch.personnel_id ? 'Pick personnel you can manage.' : 'Pick the driver this record is about.' }

  const supabase = createServiceRoleClient() as any
  const { data: number } = await supabase.rpc('next_forge_dot_number', { p_organization_id: organizationId, p_kind: 'record' })

  const { data, error } = await supabase
    .from('forge_dot_records')
    .insert({ organization_id: organizationId, record_number: number, ...built.patch, created_by: context.user.id, updated_by: context.user.id })
    .select('id')
    .single()

  if (error || !data) return { error: dbMessage(error, 'Unable to create the record.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.record_created', entityType: 'dot_record', entityId: data.id, after: { record_number: number, ...built.patch } })
  revalidatePath('/dot/records')

  return { id: data.id, message: 'Record created.' }
}

export const updateDotRecord = async ({ recordId, values, status }: { recordId: string; values?: DotRecordValues; status?: 'open' | 'closed' }): Promise<Result> => {
  const context = await requireTenantPermission('dot.edit')
  const loaded = await loadDotRecordInScope(context, recordId)

  if (!('ok' in loaded)) return { error: loaded.error }

  const { organizationId, supabase, row } = loaded
  let patch: Record<string, unknown> = { updated_by: context.user.id }

  if (values) {
    const built = recordPatch(values)

    if ('error' in built) return { error: built.error }
    if (!(await personInScope(context, built.patch.personnel_id))) return { error: 'Pick personnel you can manage.' }
    patch = { ...patch, ...built.patch }
  }

  if (status) patch = { ...patch, status, closed_by: status === 'closed' ? context.user.id : null }

  const { error } = await supabase.from('forge_dot_records').update(patch).eq('id', recordId)

  if (error) return { error: dbMessage(error, 'Unable to save the record.') }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.record_updated', entityType: 'dot_record', entityId: recordId, before: row, after: patch })
  revalidatePath('/dot/records')
  revalidatePath('/dot/records/' + recordId)

  return { message: status === 'closed' ? 'Record closed.' : status === 'open' ? 'Record reopened.' : 'Record saved.' }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const saveDotSettings = async ({
  hiddenDocumentTypes,
  dotDriversAreCompanyDrivers,
  insurerName,
  insurerEmail,
  mvrSamplePercent
}: {
  hiddenDocumentTypes: string[]
  dotDriversAreCompanyDrivers: boolean
  insurerName: string
  insurerEmail: string
  mvrSamplePercent: number
}): Promise<Result> => {
  const context = await requireTenantPermission('dot.settings')
  const organizationId = context.activeOrganization.id
  const hidden = Array.from(new Set(hiddenDocumentTypes)).filter(key => DOT_DOCUMENT_KEYS.includes(key))
  const percent = Math.round(Number(mvrSamplePercent))
  const email = cleanText(insurerEmail)

  if (!Number.isFinite(percent) || percent < 1 || percent > 100) return { error: 'The MVR sample is between 1% and 100%.' }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid insurer email.' }

  const supabase = createServiceRoleClient() as any

  const values = {
    organization_id: organizationId,
    hidden_document_types: hidden,
    dot_drivers_are_company_drivers: Boolean(dotDriversAreCompanyDrivers),
    insurer_name: cleanText(insurerName),
    insurer_email: email,
    mvr_sample_percent: percent,
    updated_by: context.user.id
  }

  const { error } = await supabase.from('forge_dot_settings').upsert(values, { onConflict: 'organization_id' })

  if (error) return { error: dbMessage(error, 'Unable to save DOT settings.') }

  // Turning the company-driver rule on applies it to today's DOT drivers too.
  if (values.dot_drivers_are_company_drivers) {
    await supabase
      .from('forge_personnel')
      .update({ is_company_driver: true, updated_by: context.user.id })
      .eq('organization_id', organizationId)
      .eq('is_dot_driver', true)
      .eq('is_company_driver', false)
  }

  await audit({ supabase, actorUserId: context.user.id, organizationId, action: 'dot.settings_saved', entityType: 'dot_settings', entityId: organizationId, after: values })
  revalidatePath('/dot', 'layout')

  return { message: 'DOT settings saved.' }
}
