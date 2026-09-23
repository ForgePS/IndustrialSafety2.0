'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { getAuthUser } from '@repo/supabase/serverHelpers'
import { ACTIVE_ORGANIZATION_COOKIE } from '@/lib/forgeTenantContext'

export const setActiveOrganization = async (organizationId: string) => {
  const {
    data: { user }
  } = await getAuthUser()

  if (!user) return { error: 'You must be signed in.' }

  const supabase = createServiceRoleClient() as any
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, is_active')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership?.is_active) return { error: 'You do not have access to that company.' }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365
  })

  revalidatePath('/', 'layout')
  return { message: 'Company changed.' }
}
