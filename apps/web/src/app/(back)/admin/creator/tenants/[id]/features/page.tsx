import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import TenantFeatureManager from './TenantFeatureManager'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenant Features | Forge Creator 2.0' }

const TenantFeaturesPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: features },
    { data: subscriptions },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('forge_feature_registry').select('*').order('sort_order').order('name'),
    supabase.from('forge_subscriptions').select('plan_id, status, created_at').eq('organization_id', id).order('created_at', { ascending: false }).limit(1),
    supabase.from('forge_tenant_entitlement_overrides').select('*').eq('organization_id', id)
  ])

  if (!tenant) notFound()

  const subscription = subscriptions?.[0] || null
  const { data: planEntitlements } = subscription?.plan_id
    ? await supabase.from('forge_plan_entitlements').select('feature_id, enabled').eq('plan_id', subscription.plan_id)
    : { data: [] }

  const planByFeature = new Map((planEntitlements || []).map((item: any) => [item.feature_id, item.enabled]))
  const overrideByFeature = new Map((overrides || []).map((item: any) => [item.feature_id, item]))

  const hydrated = (features || []).map((feature: any) => {
    const override = overrideByFeature.get(feature.id)

    return {
      ...feature,
      planEnabled: planByFeature.has(feature.id) ? Boolean(planByFeature.get(feature.id)) : null,
      overrideEnabled: override?.enabled ?? null,
      tenantCanConfigureOverride: override?.tenant_can_configure ?? null
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Features & Entitlements</h1>
          <p className='text-textSecondary mt-2 max-w-4xl'>
            Control exactly which Forge capabilities this tenant receives and what their administrators are allowed to configure.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild><Link href='/admin/creator/features'>Platform Features</Link></Button>
          <Button variant='outline' asChild><Link href={`/admin/creator/tenants/${id}`}>Back to Tenant</Link></Button>
        </div>
      </div>

      <TenantFeatureManager organizationId={id} features={hydrated} />
    </div>
  )
}

export default TenantFeaturesPage
