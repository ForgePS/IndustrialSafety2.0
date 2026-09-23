import { createServiceRoleClient } from '@repo/supabase/server'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'

export type EffectiveExperienceElement = {
  id: string
  key: string
  type: string
  label: string
  description: string | null
  route: string | null
  category: string
  sortOrder: number
  hidden: boolean
  routeLive: boolean
  featureKey: string | null
}

export const getEffectiveExperience = async ({
  organizationId,
  userId,
  types
}: {
  organizationId: string
  userId: string
  types?: string[]
}) => {
  const supabase = createServiceRoleClient() as any

  let query = supabase
    .from('forge_experience_elements')
    .select('*, forge_feature_registry(id, feature_key, platform_state, requires_entitlement)')
    .eq('platform_enabled', true)
    .order('sort_order')

  if (types?.length) query = query.in('element_type', types)

  const [
    { data: elements, error },
    { data: tenantOverrides },
    { data: userPreferences },
    { data: subscriptions },
    { data: entitlementOverrides },
    access
  ] = await Promise.all([
    query,
    supabase
      .from('forge_tenant_experience_overrides')
      .select('*')
      .eq('organization_id', organizationId),
    supabase
      .from('forge_user_experience_preferences')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId),
    supabase
      .from('forge_subscriptions')
      .select('plan_id, status, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('forge_tenant_entitlement_overrides')
      .select('feature_id, enabled')
      .eq('organization_id', organizationId),
    getEffectiveTenantAccess({ organizationId, userId })
  ])

  if (error) throw new Error(`Unable to resolve Forge experience: ${error.message}`)

  const subscription = subscriptions?.[0] || null
  const { data: planEntitlements } = subscription?.plan_id
    ? await supabase
        .from('forge_plan_entitlements')
        .select('feature_id, enabled')
        .eq('plan_id', subscription.plan_id)
    : { data: [] }

  const tenantOverrideByElement = new Map((tenantOverrides || []).map((item: any) => [item.element_id, item]))
  const userPreferenceByElement = new Map((userPreferences || []).map((item: any) => [item.element_id, item]))
  const planEntitlementByFeature = new Map((planEntitlements || []).map((item: any) => [item.feature_id, item.enabled]))
  const tenantEntitlementByFeature = new Map((entitlementOverrides || []).map((item: any) => [item.feature_id, item.enabled]))

  const allowedFeatureKeys = new Set(
    access.effective
      .filter(item => item.allowed && item.featureKey)
      .map(item => item.featureKey as string)
  )

  return (elements || [])
    .map((element: any): EffectiveExperienceElement | null => {
      const feature = element.forge_feature_registry
      const tenantOverride = tenantOverrideByElement.get(element.id)
      const userPreference = userPreferenceByElement.get(element.id)

      if (feature) {
        if (['disabled', 'maintenance', 'deprecated'].includes(feature.platform_state)) return null

        if (feature.requires_entitlement) {
          const tenantEntitlement = tenantEntitlementByFeature.get(feature.id)
          const planEntitlement = planEntitlementByFeature.get(feature.id)
          if (!(tenantEntitlement ?? planEntitlement ?? false)) return null
        }

        if (!allowedFeatureKeys.has(feature.feature_key)) return null
      }

      const tenantMayHide = element.tenant_edit_mode !== 'none' && element.can_hide
      const userMayHide = element.user_edit_mode !== 'none'
      const hidden =
        (tenantMayHide && tenantOverride?.hidden === true) ||
        (userMayHide && userPreference?.hidden === true)

      const tenantMayRename = element.tenant_edit_mode !== 'none' && element.can_rename
      const label =
        (tenantMayRename ? tenantOverride?.label : null) ||
        element.default_label ||
        element.name

      const description =
        (element.tenant_edit_mode !== 'none' ? tenantOverride?.description : null) ||
        element.default_description ||
        null

      const tenantMayReorder = element.tenant_edit_mode !== 'none' && element.can_reorder
      const userMayReorder = element.user_edit_mode !== 'none'
      const sortOrder =
        (userMayReorder && userPreference?.sort_order != null ? userPreference.sort_order : null) ??
        (tenantMayReorder && tenantOverride?.sort_order != null ? tenantOverride.sort_order : null) ??
        element.sort_order

      return {
        id: element.id,
        key: element.element_key,
        type: element.element_type,
        label,
        description,
        route: element.route,
        category: element.category,
        sortOrder,
        hidden,
        routeLive: Boolean(element.settings?.route_live),
        featureKey: feature?.feature_key || null
      }
    })
    .filter((item: EffectiveExperienceElement | null): item is EffectiveExperienceElement => Boolean(item && !item.hidden))
    .sort((a: EffectiveExperienceElement, b: EffectiveExperienceElement) => a.sortOrder - b.sortOrder)
}
