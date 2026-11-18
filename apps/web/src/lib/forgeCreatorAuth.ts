// Next Imports
import { redirect } from 'next/navigation'

// Third-party Imports
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { createServiceRoleClient } from '@repo/supabase/server'

export type ForgePlatformRole =
  | 'forge_owner'
  | 'forge_creator'
  | 'forge_support'
  | 'forge_billing'
  | 'forge_read_only'

export const getForgePlatformRole = async (userId?: string | null): Promise<ForgePlatformRole | null> => {
  if (!userId) return null

  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_platform_users')
    .select('platform_role, is_active')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data?.is_active) return null

  return data.platform_role as ForgePlatformRole
}

export const getForgePlatformAccess = async () => {
  const {
    data: { user }
  } = await getAuthUser()

  const platformRole = await getForgePlatformRole(user?.id)

  return { user, platformRole }
}

export const requireForgePlatformRole = async (allowedRoles?: ForgePlatformRole[]) => {
  const { user, platformRole } = await getForgePlatformAccess()

  if (!user || !platformRole || (allowedRoles && !allowedRoles.includes(platformRole))) {
    redirect('/not-authorized')
  }

  return { user, platformRole }
}
