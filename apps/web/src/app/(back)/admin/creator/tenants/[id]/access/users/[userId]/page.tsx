import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { createServiceRoleClient } from '@repo/supabase/server'
import UserAccessEditor from './UserAccessEditor'
import { getEffectiveTenantAccess } from '@/lib/forgeEffectiveAccess'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export const metadata: Metadata = { title: 'Individual Access | Forge Creator 2.0' }

const UserAccessPage = async ({
  params
}: {
  params: Promise<{ id: string; userId: string }>
}) => {
  await requireForgePlatformRole()
  const { id, userId } = await params
  const supabase = createServiceRoleClient() as any

  const [
    { data: tenant },
    { data: membership },
    { data: profile },
    { data: roles },
    { data: locations },
    { data: divisions },
    { data: locationAccess },
    { data: divisionAccess },
    access
  ] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('organization_memberships').select('*').eq('organization_id', id).eq('user_id', userId).maybeSingle(),
    supabase.from('users').select('user_id, name, email').eq('user_id', userId).maybeSingle(),
    supabase.from('forge_tenant_roles').select('id, name, description').eq('organization_id', id).eq('is_active', true).order('sort_order'),
    supabase.from('locations').select('id, name, code').eq('organization_id', id).eq('is_active', true).order('name'),
    supabase.from('divisions').select('id, name, code').eq('organization_id', id).eq('is_active', true).order('name'),
    supabase.from('forge_tenant_user_location_access').select('location_id').eq('organization_id', id).eq('user_id', userId),
    supabase.from('forge_tenant_user_division_access').select('division_id').eq('organization_id', id).eq('user_id', userId),
    getEffectiveTenantAccess({ organizationId: id, userId })
  ])

  if (!tenant || !membership) notFound()

  const allowedCount = access.effective.filter(item => item.allowed).length
  const deniedOverrideCount = access.effective.filter(item => item.source === 'override_deny').length
  const allowedOverrideCount = access.effective.filter(item => item.source === 'override_allow').length

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <p className='text-primary text-sm font-semibold uppercase tracking-wide'>Forge Creator 2.0 / {tenant.name}</p>
          <h1 className='text-textPrimary mt-1 text-3xl font-bold'>{profile?.name || 'Unnamed User'}</h1>
          <p className='text-textSecondary mt-1'>{profile?.email || userId}</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link href={`/admin/creator/tenants/${id}/access/users`}>All Personnel</Link>
          </Button>
          <Button variant='outline' asChild>
            <Link href={`/admin/creator/tenants/${id}/access`}>Role Builder</Link>
          </Button>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Membership</CardDescription></CardHeader>
          <CardContent><Badge size='sm' variant={membership.is_active ? 'tonalSuccess' : 'secondary'}>{membership.role}</Badge></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Effective Permissions</CardDescription></CardHeader>
          <CardContent><div className='text-textPrimary text-2xl font-semibold'>{allowedCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Allow Overrides</CardDescription></CardHeader>
          <CardContent><div className='text-textPrimary text-2xl font-semibold'>{allowedOverrideCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className='pb-2'><CardDescription>Deny Overrides</CardDescription></CardHeader>
          <CardContent><div className='text-textPrimary text-2xl font-semibold'>{deniedOverrideCount}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Effective Access Viewer</CardTitle>
          <CardDescription>
            Forge calculates access from subscription entitlements, role grants, feature availability and individual overrides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid gap-3 md:grid-cols-4'>
            <div className='rounded-lg border p-3'><div className='text-xs text-textSecondary'>1</div><div className='font-semibold'>Feature available</div></div>
            <div className='rounded-lg border p-3'><div className='text-xs text-textSecondary'>2</div><div className='font-semibold'>Role permission</div></div>
            <div className='rounded-lg border p-3'><div className='text-xs text-textSecondary'>3</div><div className='font-semibold'>Individual override</div></div>
            <div className='rounded-lg border p-3'><div className='text-xs text-textSecondary'>4</div><div className='font-semibold'>Effective access</div></div>
          </div>
        </CardContent>
      </Card>

      <UserAccessEditor
        organizationId={id}
        userId={userId}
        roles={roles || []}
        effective={access.effective}
        assignedRoleIds={access.assignedRoleIds}
        locations={locations || []}
        divisions={divisions || []}
        selectedLocationIds={(locationAccess || []).map((item: any) => item.location_id)}
        selectedDivisionIds={(divisionAccess || []).map((item: any) => item.division_id)}
      />
    </div>
  )
}

export default UserAccessPage
