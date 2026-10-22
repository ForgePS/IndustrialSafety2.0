import { createServiceRoleClient } from '@repo/supabase/server'

const scopeRank: Record<string, number> = {
  own: 1,
  assigned: 2,
  location: 3,
  division: 4,
  organization: 5
}

const widerScope = (a?: string | null, b?: string | null) => {
  const left = a || 'own'
  const right = b || 'own'

  return (scopeRank[right] || 0) > (scopeRank[left] || 0) ? right : left
}

export type EffectivePermission = {
  permissionId: string
  permissionKey: string
  name: string
  group: string
  featureKey: string | null
  allowed: boolean
  scope: string | null
  source: 'role' | 'override_allow' | 'override_deny' | 'not_granted' | 'feature_unavailable'
  assignedRoles: string[]
  overrideState: 'inherit' | 'allow' | 'deny'
  featureAvailable: boolean
}

export const getEffectiveTenantAccess = async ({
  organizationId,
  userId
}: {
  organizationId: string
  userId: string
}) => {
  const supabase = createServiceRoleClient() as any

  const [
    { data: permissions },
    { data: assignedUserRoles },
    { data: overrides },
    { data: subscriptionRows },
    { data: entitlementOverrides }
  ] = await Promise.all([
    supabase
      .from('forge_permission_registry')
      .select('*')
      .eq('tenant_assignable', true)
      .order('permission_group')
      .order('sort_order'),
    supabase
      .from('forge_tenant_user_roles')
      .select('role_id, forge_tenant_roles(id, name, is_active)')
      .eq('organization_id', organizationId)
      .eq('user_id', userId),
    supabase
      .from('forge_user_permission_overrides')
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
      .eq('organization_id', organizationId)
  ])

  const subscription = subscriptionRows?.[0] || null
  const planId = subscription?.plan_id || null

  const activeRoles = (assignedUserRoles || [])
    .map((assignment: any) => assignment.forge_tenant_roles)
    .filter((role: any) => role?.is_active && role?.id)

  const activeRoleIds = activeRoles.map((role: any) => role.id)
  const roleNameById = new Map<string, string>(activeRoles.map((role: any) => [role.id, role.name]))

  const [{ data: features }, { data: planEntitlements }, { data: rolePermissionRows }] = await Promise.all([
    supabase.from('forge_feature_registry').select('id, feature_key, platform_state, requires_entitlement'),
    planId
      ? supabase.from('forge_plan_entitlements').select('feature_id, enabled').eq('plan_id', planId)
      : Promise.resolve({ data: [] }),
    activeRoleIds.length
      ? supabase
          .from('forge_tenant_role_permissions')
          .select('role_id, permission_id, allowed, scope')
          .in('role_id', activeRoleIds)
          .eq('allowed', true)
      : Promise.resolve({ data: [] })
  ])

  const featureByKey = new Map<string, any>((features || []).map((feature: any) => [feature.feature_key, feature]))
  const planEntitlementByFeature = new Map<string, boolean | null>((planEntitlements || []).map((item: any) => [item.feature_id, item.enabled]))
  const tenantOverrideByFeature = new Map<string, boolean | null>((entitlementOverrides || []).map((item: any) => [item.feature_id, item.enabled]))
  const overrideByPermission = new Map<string, any>((overrides || []).map((item: any) => [item.permission_id, item]))

  const rolePermissionMap = new Map<string, { scope: string | null; roles: string[] }>()

  for (const grant of rolePermissionRows || []) {
    if (!grant.allowed) continue
    const current = rolePermissionMap.get(grant.permission_id)
    const roleName = roleNameById.get(grant.role_id)
    rolePermissionMap.set(grant.permission_id, {
      scope: current ? widerScope(current.scope, grant.scope) : grant.scope || 'organization',
      roles: [...new Set([...(current?.roles || []), ...(roleName ? [roleName] : [])])]
    })
  }

  const effective: EffectivePermission[] = (permissions || []).map((permission: any) => {
    const feature = permission.feature_key ? featureByKey.get(permission.feature_key) : null
    let featureAvailable = true

    if (feature) {
      featureAvailable = !['disabled', 'maintenance', 'deprecated'].includes(feature.platform_state)

      if (featureAvailable && feature.requires_entitlement) {
        const tenantOverride = tenantOverrideByFeature.get(feature.id)
        const planEntitlement = planEntitlementByFeature.get(feature.id)
        featureAvailable = tenantOverride ?? planEntitlement ?? false
      }
    }

    const roleGrant = rolePermissionMap.get(permission.id)
    const override = overrideByPermission.get(permission.id)
    const overrideState = (override?.override_state || 'inherit') as 'inherit' | 'allow' | 'deny'

    if (!featureAvailable) {
      return {
        permissionId: permission.id,
        permissionKey: permission.permission_key,
        name: permission.name,
        group: permission.permission_group,
        featureKey: permission.feature_key,
        allowed: false,
        scope: null,
        source: 'feature_unavailable' as const,
        assignedRoles: roleGrant?.roles || [],
        overrideState,
        featureAvailable: false
      }
    }

    if (overrideState === 'deny') {
      return {
        permissionId: permission.id,
        permissionKey: permission.permission_key,
        name: permission.name,
        group: permission.permission_group,
        featureKey: permission.feature_key,
        allowed: false,
        scope: null,
        source: 'override_deny' as const,
        assignedRoles: roleGrant?.roles || [],
        overrideState,
        featureAvailable: true
      }
    }

    if (overrideState === 'allow') {
      return {
        permissionId: permission.id,
        permissionKey: permission.permission_key,
        name: permission.name,
        group: permission.permission_group,
        featureKey: permission.feature_key,
        allowed: true,
        scope: override.scope || roleGrant?.scope || permission.default_scope || 'organization',
        source: 'override_allow' as const,
        assignedRoles: roleGrant?.roles || [],
        overrideState,
        featureAvailable: true
      }
    }

    return {
      permissionId: permission.id,
      permissionKey: permission.permission_key,
      name: permission.name,
      group: permission.permission_group,
      featureKey: permission.feature_key,
      allowed: Boolean(roleGrant),
      scope: roleGrant?.scope || null,
      source: roleGrant ? ('role' as const) : ('not_granted' as const),
      assignedRoles: roleGrant?.roles || [],
      overrideState,
      featureAvailable: true
    }
  })

  return {
    effective,
    assignedRoleIds: (assignedUserRoles || []).map((item: any) => item.role_id)
  }
}
