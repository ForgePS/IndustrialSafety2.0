import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import CompanyExperienceManager from './CompanyExperienceManager'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Company Settings' }

const CompanySettingsPage = async () => {
  const context = await requireTenantPermission('tenant.settings.view')
  const supabase = createServiceRoleClient() as any

  const [
    { data: elements },
    { data: overrides }
  ] = await Promise.all([
    supabase
      .from('forge_experience_elements')
      .select('*')
      .neq('tenant_edit_mode', 'none')
      .eq('platform_enabled', true)
      .order('category')
      .order('sort_order'),
    supabase
      .from('forge_tenant_experience_overrides')
      .select('*')
      .eq('organization_id', context.activeOrganization.id)
  ])

  const overrideByElement = new Map((overrides || []).map((item: any) => [item.element_id, item]))

  const items = (elements || []).map((element: any) => {
    const override = overrideByElement.get(element.id) || null

    return {
      ...element,
      tenant_edit_mode: override?.tenant_edit_mode_override ?? element.tenant_edit_mode,
      location_edit_mode: override?.location_edit_mode_override ?? element.location_edit_mode,
      user_edit_mode: override?.user_edit_mode_override ?? element.user_edit_mode,
      can_hide: override?.can_hide_override ?? element.can_hide,
      can_rename: override?.can_rename_override ?? element.can_rename,
      can_reorder: override?.can_reorder_override ?? element.can_reorder,
      override
    }
  })

  const canManage = context.access.effective.some(
    item => item.permissionKey === 'tenant.settings.manage' && item.allowed
  )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name}</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Company Settings</h1>
        <p className='text-textSecondary mt-2 max-w-4xl'>
          Customize the parts of Forge that have been opened by Forge Creator. Protected system behavior remains locked.
        </p>
      </div>

      {canManage ? (
        <CompanyExperienceManager items={items} />
      ) : (
        <div className='rounded-lg border p-5 text-textSecondary'>
          You can view company settings, but your current role cannot modify them.
        </div>
      )}
    </div>
  )
}

export default CompanySettingsPage
