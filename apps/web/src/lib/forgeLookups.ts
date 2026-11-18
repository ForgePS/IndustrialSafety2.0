import { createServiceRoleClient } from '@repo/supabase/server'

export type EffectiveLookupOption = {
  id: string
  key: string
  label: string
  description: string | null
  sortOrder: number
  active: boolean
  isCustom: boolean
  color: string | null
  icon: string | null
}

export const getEffectiveLookup = async ({
  organizationId,
  lookupKey
}: {
  organizationId: string
  lookupKey: string
}) => {
  const supabase = createServiceRoleClient() as any

  const { data: definition, error } = await supabase
    .from('forge_lookup_definitions')
    .select('*')
    .eq('lookup_key', lookupKey)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !definition) {
    return {
      definition: null,
      label: lookupKey,
      description: null,
      options: [] as EffectiveLookupOption[],
      policy: null
    }
  }

  const [
    { data: coreOptions },
    { data: tenantOptions },
    { data: tenantOverride }
  ] = await Promise.all([
    supabase
      .from('forge_lookup_options')
      .select('*')
      .eq('lookup_id', definition.id)
      .order('sort_order'),
    supabase
      .from('forge_tenant_lookup_options')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('lookup_id', definition.id)
      .order('sort_order'),
    supabase
      .from('forge_tenant_lookup_overrides')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('lookup_id', definition.id)
      .maybeSingle()
  ])

  const tenantByBaseId = new Map<string, any>(
    (tenantOptions || [])
      .filter((item: any) => item.base_option_id)
      .map((item: any) => [item.base_option_id, item])
  )

  const options: EffectiveLookupOption[] = (coreOptions || [])
    .map((option: any) => {
      const tenant = tenantByBaseId.get(option.id)

      return {
        id: option.id,
        key: option.option_key,
        label: tenant?.label || option.label,
        description: tenant?.description ?? option.description ?? null,
        sortOrder: tenant?.sort_order ?? option.sort_order,
        active: tenant?.is_active ?? option.is_active,
        isCustom: false,
        color: tenant?.color ?? option.color ?? null,
        icon: tenant?.icon ?? option.icon ?? null
      }
    })
    .concat(
      (tenantOptions || [])
        .filter((item: any) => item.is_custom)
        .map((item: any) => ({
          id: item.id,
          key: item.custom_option_key,
          label: item.label,
          description: item.description ?? null,
          sortOrder: item.sort_order,
          active: item.is_active,
          isCustom: true,
          color: item.color ?? null,
          icon: item.icon ?? null
        }))
    )
    .filter((item: EffectiveLookupOption) => item.active)
    .sort((a: EffectiveLookupOption, b: EffectiveLookupOption) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))

  return {
    definition,
    label: tenantOverride?.label || definition.name,
    description: tenantOverride?.description || definition.description || null,
    options,
    policy: {
      canRename: tenantOverride?.can_rename_override ?? definition.tenant_can_rename,
      canReorder: tenantOverride?.can_reorder_override ?? definition.tenant_can_reorder,
      canAddOptions: tenantOverride?.can_add_options_override ?? definition.tenant_can_add_options,
      canHideCoreOptions: tenantOverride?.can_hide_core_options_override ?? definition.tenant_can_hide_core_options,
      canDeleteCoreOptions: tenantOverride?.can_delete_core_options_override ?? definition.tenant_can_delete_core_options
    }
  }
}
