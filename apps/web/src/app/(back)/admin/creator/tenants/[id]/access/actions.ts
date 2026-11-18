'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

const permissionInputSchema = z.object({
  permissionId: z.string().uuid(),
  allowed: z.boolean(),
  scope: z.enum(['own', 'assigned', 'location', 'division', 'organization']).nullable().optional()
})

const saveRoleSchema = z.object({
  organizationId: z.string().uuid(),
  roleId: z.string().uuid(),
  name: z.string().trim().min(2),
  description: z.string().trim().optional(),
  permissions: z.array(permissionInputSchema)
})

const audit = async (
  supabase: any,
  actorUserId: string,
  organizationId: string,
  action: string,
  entityId: string,
  beforeValue?: unknown,
  afterValue?: unknown
) => {
  await supabase.from('forge_creator_audit_log').insert({
    actor_user_id: actorUserId,
    organization_id: organizationId,
    action,
    entity_type: 'tenant_role',
    entity_id: entityId,
    before_value: beforeValue ?? null,
    after_value: afterValue ?? null
  })
}

export const saveTenantRolePermissions = async (input: z.infer<typeof saveRoleSchema>) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const parsed = saveRoleSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid role data.' }

  const data = parsed.data
  const supabase = createServiceRoleClient() as any

  const { data: role, error: roleError } = await supabase
    .from('forge_tenant_roles')
    .select('*')
    .eq('id', data.roleId)
    .eq('organization_id', data.organizationId)
    .single()

  if (roleError || !role) return { error: roleError?.message ?? 'Role not found.' }

  const { data: currentPermissions } = await supabase
    .from('forge_tenant_role_permissions')
    .select('*')
    .eq('role_id', data.roleId)

  const { error: updateRoleError } = await supabase
    .from('forge_tenant_roles')
    .update({
      name: data.name,
      description: data.description || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', data.roleId)

  if (updateRoleError) return { error: updateRoleError.message }

  const { error: deleteError } = await supabase
    .from('forge_tenant_role_permissions')
    .delete()
    .eq('role_id', data.roleId)

  if (deleteError) return { error: deleteError.message }

  const allowed = data.permissions.filter(item => item.allowed)
  if (allowed.length) {
    const { error: insertError } = await supabase.from('forge_tenant_role_permissions').insert(
      allowed.map(item => ({
        role_id: data.roleId,
        permission_id: item.permissionId,
        allowed: true,
        scope: item.scope || 'organization'
      }))
    )

    if (insertError) return { error: insertError.message }
  }

  await audit(
    supabase,
    user.id,
    data.organizationId,
    'tenant_role.permissions_updated',
    data.roleId,
    { role, permissions: currentPermissions || [] },
    { name: data.name, description: data.description || null, permissions: allowed }
  )

  revalidatePath(`/admin/creator/tenants/${data.organizationId}/access`)
  return { message: 'Role permissions saved.' }
}

export const applyTenantRoleTemplate = async ({
  organizationId,
  roleId,
  templateId
}: {
  organizationId: string
  roleId: string
  templateId: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: role }, { data: template }, { data: templatePermissions }] = await Promise.all([
    supabase.from('forge_tenant_roles').select('*').eq('id', roleId).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('forge_role_templates').select('*').eq('id', templateId).eq('is_active', true).maybeSingle(),
    supabase.from('forge_role_template_permissions').select('*').eq('template_id', templateId)
  ])

  if (!role) return { error: 'Role not found.' }
  if (!template) return { error: 'Role template not found.' }

  const { data: beforePermissions } = await supabase
    .from('forge_tenant_role_permissions')
    .select('*')
    .eq('role_id', roleId)

  const { error: deleteError } = await supabase.from('forge_tenant_role_permissions').delete().eq('role_id', roleId)
  if (deleteError) return { error: deleteError.message }

  if (templatePermissions?.length) {
    const { error: insertError } = await supabase.from('forge_tenant_role_permissions').insert(
      templatePermissions
        .filter((item: any) => item.allowed)
        .map((item: any) => ({
          role_id: roleId,
          permission_id: item.permission_id,
          allowed: true,
          scope: item.scope || 'organization',
          constraints: item.constraints || {}
        }))
    )

    if (insertError) return { error: insertError.message }
  }

  await audit(
    supabase,
    user.id,
    organizationId,
    'tenant_role.template_applied',
    roleId,
    beforePermissions || [],
    { template_id: templateId, template_key: template.template_key }
  )

  revalidatePath(`/admin/creator/tenants/${organizationId}/access`)
  return { message: `${template.name} template applied.` }
}

export const createTenantRole = async ({
  organizationId,
  name,
  description
}: {
  organizationId: string
  name: string
  description?: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const trimmedName = name.trim()
  if (trimmedName.length < 2) return { error: 'Role name is required.' }

  const supabase = createServiceRoleClient() as any
  const roleKey =
    trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') +
    '-' +
    Date.now().toString(36)

  const { data: role, error } = await supabase
    .from('forge_tenant_roles')
    .insert({
      organization_id: organizationId,
      name: trimmedName,
      description: description?.trim() || null,
      role_key: roleKey,
      is_system_role: false,
      is_active: true,
      sort_order: 500
    })
    .select('*')
    .single()

  if (error || !role) return { error: error?.message ?? 'Unable to create role.' }

  await audit(supabase, user.id, organizationId, 'tenant_role.created', role.id, null, role)
  revalidatePath(`/admin/creator/tenants/${organizationId}/access`)
  return { id: role.id, message: 'Custom role created.' }
}

export const duplicateTenantRole = async ({
  organizationId,
  roleId,
  name
}: {
  organizationId: string
  roleId: string
  name: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: sourceRole }, { data: sourcePermissions }] = await Promise.all([
    supabase.from('forge_tenant_roles').select('*').eq('id', roleId).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('forge_tenant_role_permissions').select('*').eq('role_id', roleId)
  ])

  if (!sourceRole) return { error: 'Source role not found.' }

  const roleKey =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') +
    '-' +
    Date.now().toString(36)

  const { data: newRole, error } = await supabase
    .from('forge_tenant_roles')
    .insert({
      organization_id: organizationId,
      name: name.trim(),
      description: sourceRole.description,
      role_key: roleKey,
      is_system_role: false,
      is_active: true,
      sort_order: 500
    })
    .select('*')
    .single()

  if (error || !newRole) return { error: error?.message ?? 'Unable to duplicate role.' }

  if (sourcePermissions?.length) {
    const { error: copyError } = await supabase.from('forge_tenant_role_permissions').insert(
      sourcePermissions.map((item: any) => ({
        role_id: newRole.id,
        permission_id: item.permission_id,
        allowed: item.allowed,
        scope: item.scope,
        constraints: item.constraints || {}
      }))
    )
    if (copyError) return { error: copyError.message }
  }

  await audit(supabase, user.id, organizationId, 'tenant_role.duplicated', newRole.id, null, {
    source_role_id: roleId,
    new_role: newRole
  })

  revalidatePath(`/admin/creator/tenants/${organizationId}/access`)
  return { id: newRole.id, message: 'Role duplicated.' }
}

export const deleteTenantRole = async ({
  organizationId,
  roleId
}: {
  organizationId: string
  roleId: string
}) => {
  const { user } = await requireForgePlatformRole(['forge_owner', 'forge_creator'])
  const supabase = createServiceRoleClient() as any

  const [{ data: role }, { count }] = await Promise.all([
    supabase.from('forge_tenant_roles').select('*').eq('id', roleId).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('forge_tenant_user_roles').select('*', { count: 'exact', head: true }).eq('role_id', roleId)
  ])

  if (!role) return { error: 'Role not found.' }
  if (role.is_system_role) return { error: 'System roles cannot be deleted. They can be reconfigured instead.' }
  if ((count || 0) > 0) return { error: 'This role is assigned to users. Reassign them before deleting the role.' }

  const { error } = await supabase.from('forge_tenant_roles').delete().eq('id', roleId)
  if (error) return { error: error.message }

  await audit(supabase, user.id, organizationId, 'tenant_role.deleted', roleId, role, null)
  revalidatePath(`/admin/creator/tenants/${organizationId}/access`)
  return { message: 'Role deleted.' }
}
