import { createServiceRoleClient } from '@repo/supabase/server'

import type { EffectivePermission } from '@/lib/forgeEffectiveAccess'

export const COMMAND_CENTER_FEATURE = 'forge_ai_command_center'

// Whether a feature is available to a tenant, resolved the same way effective access resolves a
// permission's feature: the platform state first, then (for entitled features) the tenant
// override, then the plan entitlement, and otherwise off. For server jobs that run without a user.
export const isTenantFeatureAvailable = async ({ organizationId, featureKey }: { organizationId: string; featureKey: string }) => {
  const supabase = createServiceRoleClient() as any

  const { data: feature } = await supabase
    .from('forge_feature_registry')
    .select('id, platform_state, requires_entitlement')
    .eq('feature_key', featureKey)
    .maybeSingle()

  if (!feature || ['disabled', 'maintenance', 'deprecated'].includes(feature.platform_state)) return false
  if (!feature.requires_entitlement) return true

  const [{ data: override }, { data: subscriptions }] = await Promise.all([
    supabase
      .from('forge_tenant_entitlement_overrides')
      .select('enabled')
      .eq('organization_id', organizationId)
      .eq('feature_id', feature.id)
      .maybeSingle(),
    supabase
      .from('forge_subscriptions')
      .select('plan_id, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
  ])

  if (override && override.enabled != null) return Boolean(override.enabled)

  const planId = subscriptions?.[0]?.plan_id

  if (!planId) return false

  const { data: entitlement } = await supabase
    .from('forge_plan_entitlements')
    .select('enabled')
    .eq('plan_id', planId)
    .eq('feature_id', feature.id)
    .maybeSingle()

  return Boolean(entitlement?.enabled)
}

// For a signed-in user: the Command Center is on when Forge AI itself is usable and the
// Command Center feature is available to their tenant.
export const commandCenterAvailable = (effective: EffectivePermission[]) =>
  effective.some(item => item.permissionKey === 'forge_ai.use' && item.allowed) &&
  effective.some(item => item.featureKey === COMMAND_CENTER_FEATURE && item.featureAvailable)
