import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import CompanyLookupManager from './CompanyLookupManager'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Dropdown Manager' }

const CompanyLookupsPage = async () => {
  const context = await requireTenantPermission('tenant.lookups.manage')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: definitions },
    { data: coreOptions },
    { data: tenantOptions },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('forge_lookup_definitions').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('forge_lookup_options').select('*').order('sort_order'),
    supabase.from('forge_tenant_lookup_options').select('*').eq('organization_id', organizationId).order('sort_order'),
    supabase.from('forge_tenant_lookup_overrides').select('*').eq('organization_id', organizationId)
  ])

  const coreByLookup = new Map<string, any[]>()
  const tenantByLookup = new Map<string, any[]>()
  const overrideByLookup = new Map<string, any>((overrides || []).map((item: any) => [item.lookup_id, item]))

  for (const option of coreOptions || []) {
    if (!coreByLookup.has(option.lookup_id)) coreByLookup.set(option.lookup_id, [])
    coreByLookup.get(option.lookup_id)?.push(option)
  }

  for (const option of tenantOptions || []) {
    if (!tenantByLookup.has(option.lookup_id)) tenantByLookup.set(option.lookup_id, [])
    tenantByLookup.get(option.lookup_id)?.push(option)
  }

  const hydrated = (definitions || []).map((definition: any) => {
    const override = overrideByLookup.get(definition.id) || null
    const rows = tenantByLookup.get(definition.id) || []
    const byBase = new Map<string, any>(rows.filter((row: any) => row.base_option_id).map((row: any) => [row.base_option_id, row]))

    const options = (coreByLookup.get(definition.id) || []).map((base: any) => {
      const tenant = byBase.get(base.id)
      return {
        id: base.id,
        tenantOptionId: tenant?.id || null,
        optionKey: base.option_key,
        label: tenant?.label ?? base.label,
        sortOrder: tenant?.sort_order ?? base.sort_order,
        isActive: tenant?.is_active ?? base.is_active,
        isCustom: false
      }
    }).concat(
      rows.filter((row: any) => row.is_custom).map((row: any) => ({
        id: row.id,
        tenantOptionId: row.id,
        optionKey: row.custom_option_key,
        label: row.label,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        isCustom: true
      }))
    ).sort((a: any,b: any) => a.sortOrder - b.sortOrder)

    return {
      id: definition.id,
      lookup_key: definition.lookup_key,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      canRename: override?.can_rename_override ?? definition.tenant_can_rename,
      canReorder: override?.can_reorder_override ?? definition.tenant_can_reorder,
      canAddOptions: override?.can_add_options_override ?? definition.tenant_can_add_options,
      canHideCoreOptions: override?.can_hide_core_options_override ?? definition.tenant_can_hide_core_options,
      effectiveLabel: override?.label ?? definition.name,
      effectiveDescription: override?.description ?? definition.description ?? '',
      options
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Dropdown Manager</h1>
        <p className='text-textSecondary mt-2 max-w-4xl'>
          Customize the dropdowns Forge Creator has opened for your company without changing protected system keys.
        </p>
      </div>

      <CompanyLookupManager lookups={hydrated} />
    </div>
  )
}

export default CompanyLookupsPage
