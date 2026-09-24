import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantForgeAiSettings from './TenantForgeAiSettings'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

export const metadata: Metadata = { title: 'Forge AI Settings' }

const ForgeAiSettingsPage = async () => {
  const context = await requireTenantPermission('forge_ai.manage')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const [
    { data: settings },
    { data: capabilities },
    { data: overrides },
    { data: actions },
    { data: actionOverrides }
  ] = await Promise.all([
    supabase.from('forge_ai_tenant_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('forge_ai_capabilities').select('*').eq('platform_enabled', true).order('sort_order'),
    supabase.from('forge_ai_tenant_capabilities').select('*').eq('organization_id', organizationId),
    supabase.from('forge_ai_action_registry').select('*').eq('platform_enabled', true).order('sort_order'),
    supabase.from('forge_ai_tenant_actions').select('*').eq('organization_id', organizationId)
  ])

  if (!settings) {
    return <div className='rounded-lg border p-6'>Forge AI has not been provisioned for this tenant.</div>
  }

  const overrideByCapability = new Map(
    (overrides || []).map((item: any) => [item.capability_id, item])
  )

  const hydrated = (capabilities || []).map((capability: any) => {
    const override = overrideByCapability.get(capability.id)

    return {
      id: capability.id,
      name: capability.name,
      description: capability.description,
      category: capability.category,
      capability_type: capability.capability_type,
      enabled: override?.enabled ?? capability.platform_enabled,
      tenantCanConfigure: override?.tenant_can_configure ?? false
    }
  })

  const actionOverrideById = new Map(
    (actionOverrides || []).map((item: any) => [item.action_id, item])
  )

  const hydratedActions = (actions || []).map((action: any) => {
    const override = actionOverrideById.get(action.id)

    return {
      id: action.id,
      name: action.name,
      description: action.description,
      category: action.category,
      risk_level: action.risk_level,
      enabled: override?.enabled ?? false,
      tenantCanConfigure: override?.tenant_can_configure ?? false
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>{context.activeOrganization.name} / Forge AI</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>AI Settings</h1>
          <p className='text-textSecondary mt-2'>Company-level AI settings within the limits delegated by Forge Creator.</p>
        </div>
        <Button variant='outline' asChild><Link href='/ai'>Back to Forge AI</Link></Button>
      </div>

      <TenantForgeAiSettings
        assistantName={settings.assistant_name}
        responseStyle={settings.response_style}
        systemInstructions={settings.system_instructions}
        tenantCanConfigure={settings.tenant_can_configure}
        capabilities={hydrated}
        actions={hydratedActions}
      />
    </div>
  )
}

export default ForgeAiSettingsPage
