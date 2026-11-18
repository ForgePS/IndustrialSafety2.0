'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const platformStateSchema = z.enum(['enabled', 'disabled', 'beta', 'maintenance', 'deprecated'])

export const savePlatformFeature = async ({
  featureId,
  platformState,
  tenantConfigurable,
  locationConfigurable,
  userConfigurable
}: {
  featureId: string
  platformState: z.infer<typeof platformStateSchema>
  tenantConfigurable: boolean
  locationConfigurable: boolean
  userConfigurable: boolean
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const parsedState = platformStateSchema.safeParse(platformState)
  if (!parsedState.success) return { error: 'Invalid platform state.' }

  const supabase = createServiceRoleClient() as any
  const { data: before, error: beforeError } = await supabase
    .from('forge_feature_registry')
    .select('*')
    .eq('id', featureId)
    .single()

  if (beforeError || !before) return { error: beforeError?.message ?? 'Feature not found.' }

  const { data: after, error } = await supabase
    .from('forge_feature_registry')
    .update({
      platform_state: platformState,
      tenant_configurable: tenantConfigurable,
      location_configurable: locationConfigurable,
      user_configurable: userConfigurable,
      updated_at: new Date().toISOString()
    })
    .eq('id', featureId)
    .select('*')
    .single()

  if (error || !after) return { error: error?.message ?? 'Unable to update feature.' }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    action: 'feature.platform_updated',
    entity_type: 'feature',
    entity_id: featureId,
    before_value: before,
    after_value: after
  })

  revalidatePath('/admin/creator/features')
  return { message: 'Feature updated.' }
}

export const savePlanEntitlement = async ({
  planId,
  featureId,
  enabled
}: {
  planId: string
  featureId: string
  enabled: boolean
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: plan }, { data: feature }] = await Promise.all([
    supabase.from('forge_plans').select('id, name').eq('id', planId).maybeSingle(),
    supabase.from('forge_feature_registry').select('id, name').eq('id', featureId).maybeSingle()
  ])

  if (!plan || !feature) return { error: 'Plan or feature not found.' }

  const { data: before } = await supabase
    .from('forge_plan_entitlements')
    .select('*')
    .eq('plan_id', planId)
    .eq('feature_id', featureId)
    .maybeSingle()

  const { error } = await supabase.from('forge_plan_entitlements').upsert({
    plan_id: planId,
    feature_id: featureId,
    enabled
  })

  if (error) return { error: error.message }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    action: 'plan.entitlement_updated',
    entity_type: 'plan_entitlement',
    entity_id: `${planId}:${featureId}`,
    before_value: before,
    after_value: { plan_id: planId, feature_id: featureId, enabled }
  })

  revalidatePath('/admin/creator/features')
  return { message: 'Plan entitlement updated.' }
}

export const saveTenantEntitlementOverride = async ({
  organizationId,
  featureId,
  mode,
  tenantCanConfigure
}: {
  organizationId: string
  featureId: string
  mode: 'inherit' | 'on' | 'off'
  tenantCanConfigure: boolean | null
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: tenant }, { data: feature }] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', organizationId).maybeSingle(),
    supabase.from('forge_feature_registry').select('id, name').eq('id', featureId).maybeSingle()
  ])

  if (!tenant || !feature) return { error: 'Tenant or feature not found.' }

  const { data: before } = await supabase
    .from('forge_tenant_entitlement_overrides')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('feature_id', featureId)
    .maybeSingle()

  if (mode === 'inherit' && tenantCanConfigure === null) {
    const { error } = await supabase
      .from('forge_tenant_entitlement_overrides')
      .delete()
      .eq('organization_id', organizationId)
      .eq('feature_id', featureId)

    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('forge_tenant_entitlement_overrides').upsert({
      organization_id: organizationId,
      feature_id: featureId,
      enabled: mode === 'inherit' ? null : mode === 'on',
      tenant_can_configure: tenantCanConfigure,
      config: {}
    })

    if (error) return { error: error.message }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: organizationId,
    action: 'tenant.entitlement_override_updated',
    entity_type: 'tenant_entitlement',
    entity_id: `${organizationId}:${featureId}`,
    before_value: before,
    after_value: {
      organization_id: organizationId,
      feature_id: featureId,
      mode,
      tenant_can_configure: tenantCanConfigure
    }
  })

  revalidatePath(`/admin/creator/tenants/${organizationId}/features`)
  revalidatePath(`/admin/creator/tenants/${organizationId}`)
  return { message: 'Tenant entitlement updated.' }
}
