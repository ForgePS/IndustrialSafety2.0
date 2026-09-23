import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import RolePermissionEditor from './RolePermissionEditor'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Tenant Roles & Permissions | Forge Creator 2.0' }

const TenantAccessPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: roles },
    { data: permissions },
    { data: rolePermissions },
    { data: templates }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name, slug').eq('id', id).maybeSingle(),
    supabase.from('forge_tenant_roles').select('*').eq('organization_id', id).order('sort_order').order('name'),
    supabase.from('forge_permission_registry').select('*').eq('tenant_assignable', true).order('permission_group').order('sort_order'),
    supabase.from('forge_tenant_role_permissions').select('*'),
    supabase.from('forge_role_templates').select('id, template_key, name, description').eq('is_active', true).order('sort_order')
  ])

  if (!tenant) notFound()

  const roleIds = new Set((roles || []).map((role: any) => role.id))
  const permissionsByRole = new Map<string, any[]>()

  for (const item of rolePermissions || []) {
    if (!roleIds.has(item.role_id)) continue
    if (!permissionsByRole.has(item.role_id)) permissionsByRole.set(item.role_id, [])
    permissionsByRole.get(item.role_id)?.push(item)
  }

  const hydratedRoles = (roles || []).map((role: any) => ({
    ...role,
    permissions: permissionsByRole.get(role.id) || []
  }))

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Roles & Permissions</h1>
          <p className='text-textSecondary mt-2 max-w-3xl'>
            Configure exactly what each tenant role can do, including per-permission scope.
          </p>
        </div>
        <Button variant='outline' asChild>
          <Link href={`/admin/creator/tenants/${tenant.id}`}>Back to Tenant</Link>
        </Button>
      </div>

      <RolePermissionEditor
        organizationId={tenant.id}
        organizationName={tenant.name}
        roles={hydratedRoles}
        permissions={permissions || []}
        templates={templates || []}
      />
    </div>
  )
}

export default TenantAccessPage
