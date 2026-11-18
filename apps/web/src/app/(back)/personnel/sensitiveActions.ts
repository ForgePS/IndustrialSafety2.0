'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { getEffectiveLookup } from '@/lib/forgeLookups'
import { personnelRecordWithinScope } from '@/lib/forgeScope'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export type PersonnelSensitiveValues = {
  date_of_birth: string
  sex: string
  address_line1: string
  address_line2: string
  city: string
  state_region: string
  postal_code: string
  country_code: string
}

export type EmergencyContactValues = {
  name: string
  relationship: string
  phone: string
  alternate_phone: string
  email: string
}

const SENSITIVE_KEYS: Array<keyof PersonnelSensitiveValues> = [
  'date_of_birth',
  'sex',
  'address_line1',
  'address_line2',
  'city',
  'state_region',
  'postal_code',
  'country_code'
]

const optionalText = z
  .string()
  .max(300)
  .transform(value => value.trim() || null)

const sensitiveSchema = z.object({
  date_of_birth: z
    .string()
    .transform(value => value.trim() || null)
    .refine(value => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter a valid date of birth.'),
  sex: optionalText,
  address_line1: optionalText,
  address_line2: optionalText,
  city: optionalText,
  state_region: optionalText,
  postal_code: z
    .string()
    .max(20)
    .transform(value => value.trim() || null),
  country_code: z
    .string()
    .max(2)
    .transform(value => value.trim().toUpperCase() || null)
})

const contactSchema = z.object({
  name: z.string().max(300),
  relationship: z.string().max(120),
  phone: z.string().max(40),
  alternate_phone: z.string().max(40),
  email: z.union([z.string().trim().email(), z.literal('')])
})

/** Loads the record and confirms the caller's sensitive permission reaches it. */
const loadSensitiveTarget = async (permissionKey: 'personnel.edit_sensitive', personnelId: string) => {
  const context = await requireTenantPermission(permissionKey)
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data: record } = await supabase
    .from('forge_personnel')
    .select('id, organization_id, auth_user_id, supervisor_user_id, location_id, division_id, archived_at')
    .eq('id', personnelId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!record) return { error: 'Personnel record not found.' as const }
  if (record.archived_at) return { error: 'Archived personnel records cannot be edited.' as const }

  const allowed = await personnelRecordWithinScope({
    organizationId,
    userId: context.user.id,
    scope: context.permission.scope,
    record
  })

  if (!allowed) return { error: 'This personnel record is outside your sensitive-data scope.' as const }

  return { context, organizationId, supabase, record }
}

export const savePersonnelSensitive = async ({
  personnelId,
  values
}: {
  personnelId: string
  values: PersonnelSensitiveValues
}) => {
  const target = await loadSensitiveTarget('personnel.edit_sensitive', personnelId)

  if ('error' in target) return { error: target.error }

  const parsed = sensitiveSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the sensitive fields.' }

  const payload = parsed.data
  const today = new Date().toISOString().slice(0, 10)

  if (payload.date_of_birth && (payload.date_of_birth > today || payload.date_of_birth < '1900-01-01')) {
    return { error: 'Date of birth must be between 1900-01-01 and today.' }
  }

  if (payload.sex) {
    const lookup = await getEffectiveLookup({ organizationId: target.organizationId, lookupKey: 'personnel.sex' })

    if (!lookup.options.some(option => option.key === payload.sex)) return { error: 'Sex contains an invalid option.' }
  }

  const { data: before } = await target.supabase
    .from('forge_personnel_sensitive')
    .select('*')
    .eq('personnel_id', personnelId)
    .maybeSingle()

  const { error } = await target.supabase.from('forge_personnel_sensitive').upsert(
    {
      personnel_id: personnelId,
      organization_id: target.organizationId,
      ...payload,
      updated_by: target.context.user.id
    },
    { onConflict: 'personnel_id' }
  )

  if (error) return { error: error.message }

  // Record which fields changed, never the values themselves.
  const changedFields = SENSITIVE_KEYS.filter(key => (before?.[key] ?? null) !== (payload[key] ?? null))

  await target.supabase.from('forge_creator_audit_log').insert({
    actor_user_id: target.context.user.id,
    organization_id: target.organizationId,
    action: 'personnel.sensitive_updated',
    entity_type: 'personnel',
    entity_id: personnelId,
    after_value: { changed_fields: changedFields }
  })

  revalidatePath(`/personnel/${personnelId}`)
  
return { message: 'Sensitive information saved.' }
}

export const savePersonnelEmergencyContacts = async ({
  personnelId,
  contacts
}: {
  personnelId: string
  contacts: EmergencyContactValues[]
}) => {
  const target = await loadSensitiveTarget('personnel.edit_sensitive', personnelId)

  if ('error' in target) return { error: target.error }

  if (contacts.length > 5) return { error: 'No more than five emergency contacts are allowed.' }

  const cleaned: EmergencyContactValues[] = []

  for (const [index, contact] of contacts.entries()) {
    const parsed = contactSchema.safeParse(contact)

    if (!parsed.success) return { error: `Emergency contact ${index + 1}: ${parsed.error.issues[0]?.message || 'invalid value.'}` }

    const value = parsed.data
    const hasDetails = [value.relationship, value.phone, value.alternate_phone, value.email].some(item => item.trim())

    if (!value.name.trim()) {
      if (hasDetails) return { error: `Emergency contact ${index + 1} needs a name.` }
      continue
    }

    if (!value.phone.trim() && !value.alternate_phone.trim()) {
      return { error: `Emergency contact ${index + 1} needs a phone number.` }
    }

    cleaned.push(value)
  }

  const { error } = await target.supabase.rpc('forge_replace_personnel_emergency_contacts', {
    p_organization_id: target.organizationId,
    p_personnel_id: personnelId,
    p_contacts: cleaned,
    p_actor_user_id: target.context.user.id
  })

  if (error) return { error: error.message }

  await target.supabase.from('forge_creator_audit_log').insert({
    actor_user_id: target.context.user.id,
    organization_id: target.organizationId,
    action: 'personnel.emergency_contacts_updated',
    entity_type: 'personnel',
    entity_id: personnelId,
    after_value: { contact_count: cleaned.length }
  })

  revalidatePath(`/personnel/${personnelId}`)
  
return { message: 'Emergency contacts saved.' }
}
