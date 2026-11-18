'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const formPolicySchema = z.object({
  organizationId: z.string().uuid(),
  formId: z.string().uuid(),
  name: z.string().trim().optional(),
  description: z.string().trim().optional(),
  submitLabel: z.string().trim().optional(),
  cancelLabel: z.string().trim().optional(),
  tenantEditModeOverride: z.enum(['none','presentation','fields','full']).nullable(),
  tenantCanAddFieldsOverride: z.boolean().nullable(),
  tenantCanHideFieldsOverride: z.boolean().nullable(),
  tenantCanReorderFieldsOverride: z.boolean().nullable(),
  tenantCanChangeRequiredOverride: z.boolean().nullable(),
  tenantCanChangeInputTypeOverride: z.boolean().nullable(),
  tenantCanChangeLookupOverride: z.boolean().nullable()
})

const fieldSchema = z.object({
  organizationId: z.string().uuid(),
  formId: z.string().uuid(),
  fieldId: z.string().uuid(),
  label: z.string().trim().optional(),
  helpText: z.string().trim().optional(),
  placeholder: z.string().trim().optional(),
  fieldType: z.string().trim().min(1),
  lookupId: z.string().uuid().nullable(),
  sectionKey: z.string().trim().min(1),
  sectionLabel: z.string().trim().min(1),
  sortOrder: z.number().int(),
  width: z.enum(['quarter','third','half','two_thirds','three_quarters','full']),
  isRequired: z.boolean(),
  isVisible: z.boolean(),
  isReadOnly: z.boolean()
})

export const saveCreatorTenantFormPolicy = async (input: z.infer<typeof formPolicySchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = formPolicySchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid form policy.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const [{ data: tenant }, { data: form }, { data: before }] = await Promise.all([
    supabase.from('organizations').select('id').eq('id', data.organizationId).maybeSingle(),
    supabase.from('forge_form_definitions').select('*').eq('id', data.formId).maybeSingle(),
    supabase.from('forge_tenant_form_overrides').select('*').eq('organization_id', data.organizationId).eq('form_id', data.formId).maybeSingle()
  ])

  if (!tenant || !form) return { error: 'Tenant or form not found.' }

  const payload = {
    organization_id: data.organizationId,
    form_id: data.formId,
    name: data.name || null,
    description: data.description || null,
    submit_label: data.submitLabel || null,
    cancel_label: data.cancelLabel || null,
    tenant_edit_mode_override: data.tenantEditModeOverride,
    tenant_can_add_fields_override: data.tenantCanAddFieldsOverride,
    tenant_can_hide_fields_override: data.tenantCanHideFieldsOverride,
    tenant_can_reorder_fields_override: data.tenantCanReorderFieldsOverride,
    tenant_can_change_required_override: data.tenantCanChangeRequiredOverride,
    tenant_can_change_input_type_override: data.tenantCanChangeInputTypeOverride,
    tenant_can_change_lookup_override: data.tenantCanChangeLookupOverride,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_form_overrides').upsert(payload)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.tenant_form_policy_updated',
    entity_type: 'form',
    entity_id: data.formId,
    before_value: before,
    after_value: payload
  })

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/forms`)
  return { message: 'Form settings saved.' }
}

export const saveCreatorTenantFormField = async (input: z.infer<typeof fieldSchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const parsed = fieldSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid field configuration.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const { data: field } = await supabase
    .from('forge_form_fields')
    .select('*')
    .eq('id', data.fieldId)
    .eq('form_id', data.formId)
    .maybeSingle()

  if (!field) return { error: 'Field not found.' }

  const { data: before } = await supabase
    .from('forge_tenant_form_field_overrides')
    .select('*')
    .eq('organization_id', data.organizationId)
    .eq('field_id', data.fieldId)
    .maybeSingle()

  const payload = {
    organization_id: data.organizationId,
    form_id: data.formId,
    field_id: data.fieldId,
    label: data.label || null,
    help_text: data.helpText || null,
    placeholder: data.placeholder || null,
    field_type: data.fieldType,
    lookup_id: data.lookupId,
    section_key: data.sectionKey,
    section_label: data.sectionLabel,
    sort_order: data.sortOrder,
    width: data.width,
    is_required: data.isRequired,
    is_visible: data.isVisible,
    is_read_only: data.isReadOnly,
    updated_by: user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_form_field_overrides').upsert(payload)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'creator.tenant_form_field_updated',
    entity_type: 'form_field',
    entity_id: data.fieldId,
    before_value: before,
    after_value: payload
  })

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/forms`)
  return { message: 'Field settings saved.' }
}

export const resetCreatorTenantForm = async ({
  organizationId,
  formId
}: {
  organizationId: string
  formId: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner','forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: beforeForm }, { data: beforeFields }] = await Promise.all([
    supabase.from('forge_tenant_form_overrides').select('*').eq('organization_id', organizationId).eq('form_id', formId).maybeSingle(),
    supabase.from('forge_tenant_form_field_overrides').select('*').eq('organization_id', organizationId).eq('form_id', formId)
  ])

  await Promise.all([
    supabase.from('forge_tenant_form_overrides').delete().eq('organization_id', organizationId).eq('form_id', formId),
    supabase.from('forge_tenant_form_field_overrides').delete().eq('organization_id', organizationId).eq('form_id', formId)
  ])

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: organizationId,
    action: 'creator.tenant_form_reset',
    entity_type: 'form',
    entity_id: formId,
    before_value: { form: beforeForm, fields: beforeFields || [] },
    after_value: null
  })

  revalidatePath(`/admin/creator/tenants/${organizationId}/forms`)
  return { message: 'Form reset to platform defaults.' }
}
