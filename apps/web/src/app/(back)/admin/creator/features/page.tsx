import type { Metadata } from 'next'
import { createServiceRoleClient } from '@repo/supabase/server'
import FeatureManager from './FeatureManager'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Features & Entitlements | Forge Creator 2.0' }

const FeaturesPage = async () => {
  await requireForgePlatformRole()
  const supabase = createServiceRoleClient() as any

  const [
    { data: features, error: featureError },
    { data: plans },
    { data: entitlements }
  ] = await Promise.all([
    supabase.from('forge_feature_registry').select('*').order('sort_order').order('name'),
    supabase.from('forge_plans').select('id, name, plan_key, status').eq('status', 'active').order('name'),
    supabase.from('forge_plan_entitlements').select('plan_id, feature_id, enabled')
  ])

  if (featureError) throw new Error(`Unable to load feature registry: ${featureError.message}`)

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0</p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Features & Entitlements</h1>
        <p className='text-textSecondary mt-2 max-w-4xl'>
          Control platform availability, plan inclusion, and which configuration layers tenants are allowed to use.
        </p>
      </div>

      <FeatureManager
        features={features || []}
        plans={plans || []}
        entitlements={entitlements || []}
      />
    </div>
  )
}

export default FeaturesPage
