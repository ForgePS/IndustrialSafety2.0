import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import ForgeAiTenantManager from './ForgeAiTenantManager'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Forge AI | Forge Creator 2.0' }

const defaultSettings = {
  enabled: true,
  assistant_name: 'Forge AI',
  model: process.env.FORGE_AI_MODEL || 'gpt-6-sol',
  reasoning_effort: 'medium' as const,
  response_style: 'professional' as const,
  system_instructions: null,
  allow_sensitive_data: false,
  action_mode: 'approval_required' as const,
  tenant_can_configure: false,
  monthly_token_budget: null,
  max_input_chars: 12000,
  max_output_tokens: 3000,
  max_tool_calls: 8,
  requests_per_minute: 12,
  data_retention_days: 365
}

const TenantForgeAiPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: settings },
    { data: capabilities },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('forge_ai_tenant_settings').select('*').eq('organization_id', id).maybeSingle(),
    supabase.from('forge_ai_capabilities').select('*').order('sort_order'),
    supabase.from('forge_ai_tenant_capabilities').select('*').eq('organization_id', id)
  ])

  if (!tenant) notFound()

  const overrideByCapability = new Map(
    (overrides || []).map((item: any) => [item.capability_id, item])
  )

  const hydratedCapabilities = (capabilities || []).map((capability: any) => {
    const override = overrideByCapability.get(capability.id)

    return {
      ...capability,
      enabled: override?.enabled ?? capability.platform_enabled,
      tenantCanConfigure: override?.tenant_can_configure ?? false
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Forge AI Assistant</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Configure the tenant AI model, capability boundaries, sensitive-data policy, action controls, limits and tenant-admin authority.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild><Link href={'/admin/creator/tenants/' + id + '/features'}>Feature Entitlement</Link></Button>
          <Button variant='outline' asChild><Link href={'/admin/creator/tenants/' + id}>Back to Tenant</Link></Button>
        </div>
      </div>

      <ForgeAiTenantManager
        organizationId={id}
        settings={{ ...defaultSettings, ...(settings || {}) }}
        capabilities={hydratedCapabilities}
      />
    </div>
  )
}

export default TenantForgeAiPage
