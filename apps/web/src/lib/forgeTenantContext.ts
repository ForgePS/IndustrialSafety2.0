import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'

export const ACTIVE_ORGANIZATION_COOKIE = 'forge-active-organization'

export type TenantContextOrganization = {
  id: string
  name: string
  slug: string
  membershipRole: string
}

export const getTenantContext = async () => {
  const {
    data: { user }
  } = await getAuthUser()

  if (!user) {
    return {
      user: null,
      organizations: [] as TenantContextOrganization[],
      activeOrganization: null as TenantContextOrganization | null
    }
  }

  const supabase = createServiceRoleClient() as any
  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, is_active, organizations(id, name, slug, status)')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const organizations: TenantContextOrganization[] = (memberships || [])
    .filter((membership: any) => membership.organizations && membership.organizations.status === 'active')
    .map((membership: any) => ({
      id: membership.organizations.id,
      name: membership.organizations.name,
      slug: membership.organizations.slug,
      membershipRole: membership.role
    }))
    .sort((a: TenantContextOrganization, b: TenantContextOrganization) => a.name.localeCompare(b.name))

  const cookieStore = await cookies()
  const requestedId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value
  const activeOrganization =
    organizations.find(organization => organization.id === requestedId) ||
    organizations[0] ||
    null

  return {
    user,
    organizations,
    activeOrganization
  }
}
