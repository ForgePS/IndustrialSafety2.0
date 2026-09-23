import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@repo/ui/components/ui/button'
import { createServiceRoleClient } from '@repo/supabase/server'
import AccessUsers from './AccessUsers'
import type { AccessUserListItem } from './AccessUsers'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Personnel Access | Forge Creator 2.0' }

const PersonnelAccessPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  await requireForgePlatformRole()
  const { id } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: memberships },
    { data: roleAssignments },
    { data: overrides }
  ] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('organization_memberships').select('user_id, role, is_active').eq('organization_id', id),
    supabase
      .from('forge_tenant_user_roles')
      .select('user_id, forge_tenant_roles(name)')
      .eq('organization_id', id),
    supabase
      .from('forge_user_permission_overrides')
      .select('user_id')
      .eq('organization_id', id)
  ])

  if (!tenant) notFound()

  const userIds = (memberships || []).map((item: any) => item.user_id)
  const { data: profiles } = userIds.length
    ? await supabase.from('users').select('user_id, name, email').in('user_id', userIds)
    : { data: [] }

  const profileById = new Map((profiles || []).map((profile: any) => [profile.user_id, profile]))
  const rolesByUser = new Map<string, string[]>()
  const overrideCounts = new Map<string, number>()

  for (const assignment of roleAssignments || []) {
    const roleName = assignment.forge_tenant_roles?.name
    if (!roleName) continue
    if (!rolesByUser.has(assignment.user_id)) rolesByUser.set(assignment.user_id, [])
    rolesByUser.get(assignment.user_id)?.push(roleName)
  }

  for (const override of overrides || []) {
    overrideCounts.set(override.user_id, (overrideCounts.get(override.user_id) || 0) + 1)
  }

  const users: AccessUserListItem[] = (memberships || []).map((membership: any) => {
    const profile = profileById.get(membership.user_id)

    return {
      userId: membership.user_id,
      name: profile?.name || null,
      email: profile?.email || membership.user_id,
      membershipRole: membership.role,
      isActive: membership.is_active,
      assignedRoles: rolesByUser.get(membership.user_id) || [],
      overrideCount: overrideCounts.get(membership.user_id) || 0
    }
  })

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Personnel Access</h1>
          <p className='text-textSecondary mt-2 max-w-3xl'>
            Assign tenant roles, individual overrides, and scope restrictions for each person.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link href={`/admin/creator/tenants/${id}/access`}>Role Builder</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href={`/admin/creator/tenants/${id}`}>Back to Tenant</Link>
          </Button>
        </div>
      </div>

      <AccessUsers organizationId={id} users={users} />
    </div>
  )
}

export default PersonnelAccessPage
