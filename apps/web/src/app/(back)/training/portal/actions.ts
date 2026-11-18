'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createServiceRoleClient } from '@repo/supabase/server'

import { writeForgeAudit } from '@/lib/forgeAudit'
import { hashToken, newToken, trainingErrorMessage } from '@/lib/forgeTrainingLms'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'

type Result = { error?: string; message?: string; url?: string }

const linkSchema = z.object({
  title: z.string().trim().min(1, 'Give the kiosk a name, such as "Break room tablet".').max(200),
  location_id: z
    .string()
    .transform(value => value.trim() || null)
    .refine(value => value === null || z.string().uuid().safeParse(value).success, 'Choose a Location.'),
  expires_at: z
    .string()
    .transform(value => value.trim() || null)
    .refine(value => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Enter the expiry date as YYYY-MM-DD.')
})

/** Creates a kiosk link. The raw token is returned once and only its hash is stored. */
export const createPortalLink = async (values: z.input<typeof linkSchema>): Promise<Result> => {
  const context = await requireTenantPermission('training.manage_portal')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const parsed = linkSchema.safeParse(values)

  if (!parsed.success) return { error: parsed.error.issues[0]?.message || 'Check the kiosk link.' }

  const token = newToken()

  const { data, error } = await supabase
    .from('forge_training_portal_links')
    .insert({
      organization_id: organizationId,
      title: parsed.data.title,
      location_id: parsed.data.location_id,
      expires_at: parsed.data.expires_at ? `${parsed.data.expires_at}T23:59:59Z` : null,
      token_hash: hashToken(token),
      created_by: context.user.id
    })
    .select('id')
    .single()

  if (error) return { error: trainingErrorMessage(error) }

  await writeForgeAudit({
    actorUserId: context.user.id,
    organizationId,
    action: 'training.portal_link_created',
    entityType: 'training_portal_link',
    entityId: data.id,
    afterValue: { title: parsed.data.title, location_id: parsed.data.location_id, expires_at: parsed.data.expires_at }
  })

  revalidatePath('/training/portal')

  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')

  return { url: `${base}/training-portal/${token}`, message: 'Kiosk link created. Copy it now: it is shown only once.' }
}

/** Deactivating a link also ends every session signed in through it. */
export const deactivatePortalLink = async ({ linkId }: { linkId: string }): Promise<Result> => {
  const context = await requireTenantPermission('training.manage_portal')
  const organizationId = context.activeOrganization.id
  const supabase = createServiceRoleClient() as any

  const { data, error } = await supabase
    .from('forge_training_portal_links')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('id', linkId)
    .select('id')
    .maybeSingle()

  if (error) return { error: trainingErrorMessage(error) }
  if (!data) return { error: 'Kiosk link not found.' }

  await supabase.from('forge_training_portal_sessions').update({ revoked_at: new Date().toISOString() }).eq('link_id', linkId).is('revoked_at', null)

  await writeForgeAudit({ actorUserId: context.user.id, organizationId, action: 'training.portal_link_deactivated', entityType: 'training_portal_link', entityId: linkId })
  revalidatePath('/training/portal')

  return { message: 'Kiosk link deactivated. Anyone signed in through it has been signed out.' }
}
