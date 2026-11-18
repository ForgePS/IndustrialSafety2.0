'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'

import { normalizeDashboardLayout } from '@/lib/forgeDashboardRules'
import { getTenantContext } from '@/lib/forgeTenantContext'

type Result = { message: string } | { error: string }

/** Each user's own layout for the active company. Nothing here grants access: blocks still check permissions. */
const signedIn = async () => {
  const context = await getTenantContext()

  if (!context.user || !context.activeOrganization) return null

  return { organizationId: context.activeOrganization.id as string, userId: context.user.id as string }
}

export const saveDashboardLayout = async ({ layout }: { layout: unknown }): Promise<Result> => {
  const who = await signedIn()

  if (!who) return { error: 'Sign in to save your dashboard.' }

  // Cleaned the same way it is read, so a tampered request can only store a valid layout.
  const clean = normalizeDashboardLayout(layout)
  const supabase = createServiceRoleClient() as any

  const { error } = await supabase
    .from('forge_dashboard_layouts')
    .upsert({ organization_id: who.organizationId, user_id: who.userId, layout: clean, updated_at: new Date().toISOString() }, { onConflict: 'organization_id,user_id' })

  if (error) return { error: 'Unable to save your dashboard layout.' }

  revalidatePath('/dashboard')

  return { message: 'Dashboard layout saved.' }
}

export const resetDashboardLayout = async (): Promise<Result> => {
  const who = await signedIn()

  if (!who) return { error: 'Sign in to reset your dashboard.' }

  const supabase = createServiceRoleClient() as any

  const { error } = await supabase.from('forge_dashboard_layouts').delete().eq('organization_id', who.organizationId).eq('user_id', who.userId)

  if (error) return { error: 'Unable to reset your dashboard layout.' }

  revalidatePath('/dashboard')

  return { message: 'Dashboard reset to the default layout.' }
}
