'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const scopeSchema = z.enum(['own', 'assigned', 'location', 'division', 'organization'])

const saveIndividualAccessSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()),
  overrides: z.array(
    z.object({
      permissionId: z.string().uuid(),
      state: z.enum(['inherit', 'allow', 'deny']),
      scope: scopeSchema.nullable().optional()
    })
  )
})

export const saveIndividualTenantAccess = async (input: z.infer<typeof saveIndividualAccessSchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const parsed = saveIndividualAccessSchema.safeParse(input)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid access configuration.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, user_id, is_active')
    .eq('organization_id', data.organizationId)
    .eq('user_id', data.userId)
    .maybeSingle()

  if (!membership?.is_active) return { error: 'This user is not an active member of the tenant.' }

  const [{ data: beforeRoles }, { data: beforeOverrides }] = await Promise.all([
    supabase
      .from('forge_tenant_user_roles')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('user_id', data.userId),
    supabase
      .from('forge_user_permission_overrides')
      .select('*')
      .eq('organization_id', data.organizationId)
      .eq('user_id', data.userId)
  ])

  const { data: validRoles } = await supabase
    .from('forge_tenant_roles')
    .select('id')
    .eq('organization_id', data.organizationId)
    .in('id', data.roleIds.length ? data.roleIds : ['00000000-0000-0000-0000-000000000000'])

  const validRoleIds = new Set((validRoles || []).map((role: any) => role.id))
  if (data.roleIds.some(roleId => !validRoleIds.has(roleId))) return { error: 'One or more roles do not belong to this tenant.' }

  const { error: clearRolesError } = await supabase
    .from('forge_tenant_user_roles')
    .delete()
    .eq('organization_id', data.organizationId)
    .eq('user_id', data.userId)

  if (clearRolesError) return { error: clearRolesError.message }

  if (data.roleIds.length) {
    const { error: insertRolesError } = await supabase.from('forge_tenant_user_roles').insert(
      data.roleIds.map(roleId => ({
        organization_id: data.organizationId,
        user_id: data.userId,
        role_id: roleId
      }))
    )

    if (insertRolesError) return { error: insertRolesError.message }
  }

  const { error: clearOverridesError } = await supabase
    .from('forge_user_permission_overrides')
    .delete()
    .eq('organization_id', data.organizationId)
    .eq('user_id', data.userId)

  if (clearOverridesError) return { error: clearOverridesError.message }

  const explicitOverrides = data.overrides.filter(item => item.state !== 'inherit')

  if (explicitOverrides.length) {
    const { error: overrideError } = await supabase.from('forge_user_permission_overrides').insert(
      explicitOverrides.map(item => ({
        organization_id: data.organizationId,
        user_id: data.userId,
        permission_id: item.permissionId,
        override_state: item.state,
        scope: item.scope || null
      }))
    )

    if (overrideError) return { error: overrideError.message }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: data.organizationId,
    action: 'tenant_user.access_updated',
    entity_type: 'tenant_user',
    entity_id: data.userId,
    before_value: { roles: beforeRoles || [], overrides: beforeOverrides || [] },
    after_value: { roles: data.roleIds, overrides: explicitOverrides }
  })

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/access/users`)
  revalidatePath(`/admin/creator/tenants/${data.organizationId}/access/users/${data.userId}`)

  return { message: 'Individual access saved.' }
}

export const saveTenantUserScopeAssignments = async ({
  organizationId,
  userId,
  locationIds,
  divisionIds
}: {
  organizationId: string
  userId: string
  locationIds: string[]
  divisionIds: string[]
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: validLocations }, { data: validDivisions }] = await Promise.all([
    supabase.from('locations').select('id').eq('organization_id', organizationId).in('id', locationIds.length ? locationIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('divisions').select('id').eq('organization_id', organizationId).in('id', divisionIds.length ? divisionIds : ['00000000-0000-0000-0000-000000000000'])
  ])

  if ((validLocations || []).length !== locationIds.length) return { error: 'One or more Locations do not belong to this tenant.' }
  if ((validDivisions || []).length !== divisionIds.length) return { error: 'One or more Divisions do not belong to this tenant.' }

  await Promise.all([
    supabase.from('forge_tenant_user_location_access').delete().eq('organization_id', organizationId).eq('user_id', userId),
    supabase.from('forge_tenant_user_division_access').delete().eq('organization_id', organizationId).eq('user_id', userId)
  ])

  if (locationIds.length) {
    const { error } = await supabase.from('forge_tenant_user_location_access').insert(
      locationIds.map(locationId => ({ organization_id: organizationId, user_id: userId, location_id: locationId }))
    )
    if (error) return { error: error.message }
  }

  if (divisionIds.length) {
    const { error } = await supabase.from('forge_tenant_user_division_access').insert(
      divisionIds.map(divisionId => ({ organization_id: organizationId, user_id: userId, division_id: divisionId }))
    )
    if (error) return { error: error.message }
  }

  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: user.id,
    organization_id: organizationId,
    action: 'tenant_user.scope_assignments_updated',
    entity_type: 'tenant_user',
    entity_id: userId,
    after_value: { location_ids: locationIds, division_ids: divisionIds }
  })

  revalidatePath(`/admin/creator/tenants/${organizationId}/access/users/${userId}`)
  return { message: 'Scope assignments saved.' }
}
