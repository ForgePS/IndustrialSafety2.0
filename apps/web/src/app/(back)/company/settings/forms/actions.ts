'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

const formPresentationSchema = z.object({
  formId: z.string().uuid(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  submitLabel: z.string().trim().min(1),
  cancelLabel: z.string().trim().min(1)
})

const fieldSchema = z.object({
  formId: z.string().uuid(),
  fieldId: z.string().uuid(),
  label: z.string().trim().min(1),
  helpText: z.string().trim().optional(),
  placeholder: z.string().trim().optional(),
  fieldType: z.string().trim().min(1),
  lookupId: z.string().uuid().nullable(),
  sectionLabel: z.string().trim().min(1),
  sortOrder: z.number().int(),
  width: z.enum(['quarter','third','half','two_thirds','three_quarters','full']),
  isRequired: z.boolean(),
  isVisible: z.boolean()
})

const loadFormPolicy = async (supabase: any, organizationId: string, formId: string) => {
  const [{ data: form }, { data: override }] = await Promise.all([
    supabase.from('forge_form_definitions').select('*').eq('id', formId).eq('is_active', true).maybeSingle(),
    supabase.from('forge_tenant_form_overrides').select('*').eq('organization_id', organizationId).eq('form_id', formId).maybeSingle()
  ])

  if (!form) return null

  return {
    form,
    override,
    editMode: override?.tenant_edit_mode_override ?? form.tenant_edit_mode,
    canHideFields: override?.tenant_can_hide_fields_override ?? form.tenant_can_hide_fields,
    canReorderFields: override?.tenant_can_reorder_fields_override ?? form.tenant_can_reorder_fields,
    canChangeRequired: override?.tenant_can_change_required_override ?? form.tenant_can_change_required,
    canChangeInputType: override?.tenant_can_change_input_type_override ?? form.tenant_can_change_input_type,
    canChangeLookup: override?.tenant_can_change_lookup_override ?? form.tenant_can_change_lookup
  }
}

export const saveCompanyFormPresentation = async (input: z.infer<typeof formPresentationSchema>) => {
  const context = await requireTenantPermission('tenant.forms.manage')
  const parsed = formPresentationSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid form settings.' }

  const supabase = createServiceRoleClient() as any
  const organizationId = context.activeOrganization.id
  const policy = await loadFormPolicy(supabase, organizationId, parsed.data.formId)

  if (!policy) return { error: 'Form not found.' }
  if (policy.editMode === 'none') return { error: 'Forge Creator has locked this form.' }

  const { data: before } = await supabase
    .from('forge_tenant_form_overrides')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('form_id', parsed.data.formId)
    .maybeSingle()

  const payload = {
    organization_id: organizationId,
    form_id: parsed.data.formId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    submit_label: parsed.data.submitLabel,
    cancel_label: parsed.data.cancelLabel,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_form_overrides').upsert(payload)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.form_presentation_updated',
    entity_type: 'form',
    entity_id: parsed.data.formId,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/company/settings/forms')
  return { message: 'Form presentation saved.' }
}

export const saveCompanyFormField = async (input: z.infer<typeof fieldSchema>) => {
  const context = await requireTenantPermission('tenant.forms.manage')
  const parsed = fieldSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid field settings.' }

  const data = parsed.data
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any
  const policy = await loadFormPolicy(supabase, organizationId, data.formId)

  if (!policy) return { error: 'Form not found.' }
  if (!['fields','full'].includes(policy.editMode)) return { error: 'Forge Creator has not enabled field editing for this form.' }

  const { data: field } = await supabase
    .from('forge_form_fields')
    .select('*')
    .eq('id', data.fieldId)
    .eq('form_id', data.formId)
    .maybeSingle()

  if (!field) return { error: 'Field not found.' }

  if (!field.can_rename && data.label !== field.label) return { error: 'Forge Creator has locked this field label.' }
  if (!field.can_change_help && data.helpText !== (field.help_text || '')) return { error: 'Forge Creator has locked help text.' }
  if (!field.can_change_placeholder && data.placeholder !== (field.placeholder || '')) return { error: 'Forge Creator has locked the placeholder.' }
  if ((!policy.canHideFields || !field.can_hide) && data.isVisible !== field.is_visible) return { error: 'Forge Creator has locked field visibility.' }
  if ((!policy.canReorderFields || !field.can_reorder) && data.sortOrder !== field.sort_order) return { error: 'Forge Creator has locked field ordering.' }
  if ((!policy.canChangeRequired || !field.can_change_required) && data.isRequired !== field.is_required) return { error: 'Forge Creator has locked the required setting.' }
  if ((!policy.canChangeInputType || !field.can_change_input_type) && data.fieldType !== field.field_type) return { error: 'Forge Creator has locked the input type.' }
  if ((!policy.canChangeLookup || !field.can_change_lookup) && data.lookupId !== field.lookup_id) return { error: 'Forge Creator has locked the dropdown source.' }

  if (data.lookupId) {
    const { data: lookup } = await supabase.from('forge_lookup_definitions').select('id').eq('id', data.lookupId).eq('is_active', true).maybeSingle()
    if (!lookup) return { error: 'Selected dropdown source is not available.' }
  }

  const { data: before } = await supabase
    .from('forge_tenant_form_field_overrides')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('field_id', data.fieldId)
    .maybeSingle()

  const payload = {
    organization_id: organizationId,
    form_id: data.formId,
    field_id: data.fieldId,
    label: field.can_rename ? data.label : before?.label ?? null,
    help_text: field.can_change_help ? data.helpText || null : before?.help_text ?? null,
    placeholder: field.can_change_placeholder ? data.placeholder || null : before?.placeholder ?? null,
    field_type: policy.canChangeInputType && field.can_change_input_type ? data.fieldType : before?.field_type ?? null,
    lookup_id: policy.canChangeLookup && field.can_change_lookup ? data.lookupId : before?.lookup_id ?? null,
    section_label: data.sectionLabel,
    sort_order: policy.canReorderFields && field.can_reorder ? data.sortOrder : before?.sort_order ?? null,
    width: data.width,
    is_required: policy.canChangeRequired && field.can_change_required ? data.isRequired : before?.is_required ?? null,
    is_visible: policy.canHideFields && field.can_hide ? data.isVisible : before?.is_visible ?? null,
    updated_by: context.user.id,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('forge_tenant_form_field_overrides').upsert(payload)
  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: context.user.id,
    organization_id: organizationId,
    action: 'tenant.form_field_updated',
    entity_type: 'form_field',
    entity_id: data.fieldId,
    before_value: before,
    after_value: payload
  })

  revalidatePath('/company/settings/forms')
  revalidatePath('/personnel')
  return { message: 'Field customization saved.' }
}
