'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveForm } from '@/lib/forgeForms'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type PersonnelFormValues = Record<string, string | boolean | null>

const emailSchema = z.union([z.string().email(), z.literal(''), z.null()])

const cleanText = (value: unknown) => {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned : null
}

const validateFormValues = async ({
  organizationId,
  values
}: {
  organizationId: string
  values: PersonnelFormValues
}) => {
  const form = await getEffectiveForm({ organizationId, formKey: 'personnel.profile' })
  if (!form) return { error: 'Personnel Profile form is not configured.' as const }

  for (const field of form.fields) {
    const value = values[field.key]

    if (field.required && (value == null || value === '')) {
      return { error: `${field.label} is required.` as const }
    }

    if (field.fieldType === 'select' && value && field.lookupOptions.length) {
      if (!field.lookupOptions.some(option => option.key === value)) {
        return { error: `${field.label} contains an invalid option.` as const }
      }
    }
  }

  const email = values.email ?? null
  const emailResult = emailSchema.safeParse(email)
  if (!emailResult.success) return { error: 'Enter a valid email address.' as const }

  return { form }
}

const validateAssignments = async ({
  supabase,
  organizationId,
  locationId,
  divisionId
}: {
  supabase: any
  organizationId: string
  locationId: string | null
  divisionId: string | null
}) => {
  if (locationId) {
    const { data } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle()

    if (!data) return 'Selected Location does not belong to this company.'
  }

  if (divisionId) {
    const { data } = await supabase
      .from('divisions')
      .select('id')
      .eq('id', divisionId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle()

    if (!data) return 'Selected Division does not belong to this company.'
  }

  return null
}

const buildPersonnelPayload = (values: PersonnelFormValues) => ({
  first_name: cleanText(values.first_name),
  last_name: cleanText(values.last_name),
  employee_number: cleanText(values.employee_number),
  employment_status: cleanText(values.employment_status) || 'active',
  job_title: cleanText(values.job_title),
  email: cleanText(values.email),
  phone: cleanText(values.phone),
  hire_date: cleanText(values.hire_date),
  location_id: cleanText(values.location_id),
  division_id: cleanText(values.division_id)
})

export const createPersonnel = async (values: PersonnelFormValues) => {
  const context = await requireTenantPermission('personnel.create')
  const organizationId = context.activeOrganization.id
  const validation = await validateFormValues({ organizationId, values })

  if ('error' in validation) return validation

  const payload = buildPersonnelPayload(values)
  if (!payload.first_name || !payload.last_name) return { error: 'First Name and Last Name are required.' }

  const supabase = createServiceRoleClient() as any
  const assignmentError = await validateAssignments({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })

  if (assignmentError) return { error: assignmentError }

  const inScope = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: {
      organization_id: organizationId,
      auth_user_id: context.permission.scope === 'own' ? context.user.id : null,
      supervisor_user_id: context.permission.scope === 'assigned' ? context.user.id : null,
      location_id: payload.location_id,
      division_id: payload.division_id
    }
  })

  if (!inScope) return { error: 'The selected assignment is outside your Personnel access scope.' }

  const { data: record, error } = await supabase
    .from('forge_personnel')
    .insert({
      organization_id: organizationId,
      ...payload,
      auth_user_id: context.permission.scope === 'own' ? context.user.id : null,
      supervisor_user_id: context.permission.scope === 'assigned' ? context.user.id : null,
      created_by: context.user.id,
      updated_by: context.user.id
    })
    .select('*')
    .single()

  if (error || !record) return { error: error?.message ?? 'Unable to create personnel record.' }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'personnel.created',
    entity_type: 'personnel',
    entity_id: record.id,
    after_value: record
  })

  revalidatePath('/personnel')
  return { id: record.id, message: 'Personnel record created.' }
}

export const updatePersonnel = async ({
  personnelId,
  values
}: {
  personnelId: string
  values: PersonnelFormValues
}) => {
  const context = await requireTenantPermission('personnel.edit')
  const organizationId = context.activeOrganization.id
  const validation = await validateFormValues({ organizationId, values })

  if ('error' in validation) return validation

  const supabase = createServiceRoleClient() as any
  const { data: before, error: beforeError } = await supabase
    .from('forge_personnel')
    .select('*')
    .eq('id', personnelId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (beforeError || !before) return { error: beforeError?.message ?? 'Personnel record not found.' }

  const mayEdit = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: before
  })

  if (!mayEdit) return { error: 'This personnel record is outside your edit scope.' }

  const payload = buildPersonnelPayload(values)
  if (!payload.first_name || !payload.last_name) return { error: 'First Name and Last Name are required.' }

  const assignmentError = await validateAssignments({
    supabase,
    organizationId,
    locationId: payload.location_id,
    divisionId: payload.division_id
  })

  if (assignmentError) return { error: assignmentError }

  const afterScope = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: {
      ...before,
      location_id: payload.location_id,
      division_id: payload.division_id
    }
  })

  if (!afterScope) return { error: 'The new assignment would move this record outside your edit scope.' }

  const { data: after, error } = await supabase
    .from('forge_personnel')
    .update({
      ...payload,
      updated_by: context.user.id,
      updated_at: new Date().toISOString()
    })
    .eq('id', personnelId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update personnel record.' }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'personnel.updated',
    entity_type: 'personnel',
    entity_id: personnelId,
    before_value: before,
    after_value: after
  })

  revalidatePath('/personnel')
  revalidatePath(`/personnel/${personnelId}`)
  return { message: 'Personnel record updated.' }
}

export const archivePersonnel = async (personnelId: string) => {
  const context = await requireTenantPermission('personnel.archive')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: before } = await supabase
    .from('forge_personnel')
    .select('*')
    .eq('id', personnelId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!before) return { error: 'Personnel record not found.' }

  const allowed = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record: before
  })

  if (!allowed) return { error: 'This personnel record is outside your archive scope.' }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('forge_personnel')
    .update({
      archived_at: now,
      updated_at: now,
      updated_by: context.user.id
    })
    .eq('id', personnelId)
    .eq('organization_id', organizationId)

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'personnel.archived',
    entity_type: 'personnel',
    entity_id: personnelId,
    before_value: before,
    after_value: { archived_at: now }
  })

  revalidatePath('/personnel')
  return { message: 'Personnel record archived.' }
}
