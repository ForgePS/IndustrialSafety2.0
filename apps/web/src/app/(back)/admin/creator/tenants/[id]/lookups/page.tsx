import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantLookupManager from './TenantLookupManager'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenant Dropdowns & Lookups | Forge Creator 2.0' }

const TenantLookupsPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: definitions },
    { data: coreOptions },
    { data: tenantOptions },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('forge_lookup_definitions').select('*').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('forge_lookup_options').select('*').order('sort_order'),
    supabase.from('forge_tenant_lookup_options').select('*').eq('organization_id', id).order('sort_order'),
    supabase.from('forge_tenant_lookup_overrides').select('*').eq('organization_id', id)
  ])

  if (!tenant) notFound()

  const coreByLookup = new Map<string, any[]>()
  const tenantByLookup = new Map<string, any[]>()
  const overrideByLookup = new Map((overrides || []).map((item: any) => [item.lookup_id, item]))

  for (const option of coreOptions || []) {
    if (!coreByLookup.has(option.lookup_id)) coreByLookup.set(option.lookup_id, [])
    coreByLookup.get(option.lookup_id)?.push(option)
  }

  for (const option of tenantOptions || []) {
    if (!tenantByLookup.has(option.lookup_id)) tenantByLookup.set(option.lookup_id, [])
    tenantByLookup.get(option.lookup_id)?.push(option)
  }

  const hydrated = (definitions || []).map((definition: any) => {
    const tenantRows = tenantByLookup.get(definition.id) || []
    const tenantByBase = new Map(tenantRows.filter((item: any) => item.base_option_id).map((item: any) => [item.base_option_id, item]))

    const options = (coreByLookup.get(definition.id) || []).map((core: any) => {
      const tenantOverride = tenantByBase.get(core.id)

      return {
        id: core.id,
        base_option_id: core.id,
        option_key: core.option_key,
        label: tenantOverride?.label || core.label,
        description: tenantOverride?.description ?? core.description ?? null,
        sort_order: tenantOverride?.sort_order ?? core.sort_order,
        is_active: tenantOverride?.is_active ?? core.is_active,
        is_core: true,
        is_custom: false,
        color: tenantOverride?.color ?? core.color ?? null,
        icon: tenantOverride?.icon ?? core.icon ?? null
      }
    }).concat(
      tenantRows
        .filter((item: any) => item.is_custom)
        .map((item: any) => ({
          id: item.id,
          base_option_id: null,
          custom_option_key: item.custom_option_key,
          option_key: item.custom_option_key,
          label: item.label,
          description: item.description ?? null,
          sort_order: item.sort_order,
          is_active: item.is_active,
          is_core: false,
          is_custom: true,
          color: item.color ?? null,
          icon: item.icon ?? null
        }))
    )

    return {
      ...definition,
      override: overrideByLookup.get(definition.id) || null,
      options
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Dropdowns & Lookups</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Configure this tenant's dropdown labels, options, ordering and exactly what its administrators are allowed to change.
          </p>
        </div>
        <Button variant='outline' asChild>
          <Link href={`/admin/creator/tenants/${id}`}>Back to Tenant</Link>
        </Button>
      </div>

      <TenantLookupManager organizationId={id} lookups={hydrated} />
    </div>
  )
}

export default TenantLookupsPage
