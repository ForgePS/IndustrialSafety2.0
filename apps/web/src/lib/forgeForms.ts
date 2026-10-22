import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveLookup } from '@/lib/forgeLookups'

export type EffectiveFormField = {
  id: string
  key: string
  label: string
  helpText: string | null
  placeholder: string | null
  fieldType: string
  sectionKey: string
  sectionLabel: string
  sortOrder: number
  width: string
  required: boolean
  visible: boolean
  readOnly: boolean
  lookupKey: string | null
  lookupOptions: Array<{ key: string; label: string }>
}

export const getEffectiveForm = async ({
  organizationId,
  formKey
}: {
  organizationId: string
  formKey: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: form } = await supabase
    .from('forge_form_definitions')
    .select('*, forge_feature_registry(feature_key), forge_form_fields(*, forge_lookup_definitions(lookup_key))')
    .eq('form_key', formKey)
    .eq('is_active', true)
    .maybeSingle()

  if (!form) return null

  const [
    { data: formOverride },
    { data: fieldOverrides }
  ] = await Promise.all([
    supabase
      .from('forge_tenant_form_overrides')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('form_id', form.id)
      .maybeSingle(),
    supabase
      .from('forge_tenant_form_field_overrides')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('form_id', form.id)
  ])

  const overrideByField = new Map<string, any>((fieldOverrides || []).map((item: any) => [item.field_id, item]))

  const fields: EffectiveFormField[] = []

  for (const field of form.forge_form_fields || []) {
    const override = overrideByField.get(field.id)
    const lookupKey = override?.lookup_id
      ? null
      : field.forge_lookup_definitions?.lookup_key || null

    let effectiveLookupKey = lookupKey

    if (override?.lookup_id) {
      const { data: lookup } = await supabase
        .from('forge_lookup_definitions')
        .select('lookup_key')
        .eq('id', override.lookup_id)
        .maybeSingle()
      effectiveLookupKey = lookup?.lookup_key || null
    }

    let lookupOptions: Array<{ key: string; label: string }> = []

    if (effectiveLookupKey) {
      const lookup = await getEffectiveLookup({
        organizationId,
        lookupKey: effectiveLookupKey
      })

      lookupOptions = lookup.options.map(option => ({
        key: option.key,
        label: option.label
      }))
    }

    fields.push({
      id: field.id,
      key: field.field_key,
      label: override?.label ?? field.label,
      helpText: override?.help_text ?? field.help_text ?? null,
      placeholder: override?.placeholder ?? field.placeholder ?? null,
      fieldType: override?.field_type ?? field.field_type,
      sectionKey: override?.section_key ?? field.section_key,
      sectionLabel: override?.section_label ?? field.section_label,
      sortOrder: override?.sort_order ?? field.sort_order,
      width: override?.width ?? field.width,
      required: override?.is_required ?? field.is_required,
      visible: override?.is_visible ?? field.is_visible,
      readOnly: override?.is_read_only ?? field.is_read_only,
      lookupKey: effectiveLookupKey,
      lookupOptions
    })
  }

  return {
    id: form.id,
    key: form.form_key,
    name: formOverride?.name ?? form.name,
    description: formOverride?.description ?? form.description ?? null,
    submitLabel: formOverride?.submit_label ?? form.submit_label,
    cancelLabel: formOverride?.cancel_label ?? form.cancel_label,
    fields: fields
      .filter(field => field.visible)
      .sort((a, b) => a.sectionLabel.localeCompare(b.sectionLabel) || a.sortOrder - b.sortOrder)
  }
}
