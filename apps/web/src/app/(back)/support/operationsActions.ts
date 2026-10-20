'use server'

import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@repo/supabase/server'
import { requireTenantPermission } from '@/lib/forgeTenantAuth'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'

export async function submitSupportFeedback(ticketId: string, rating: number, comment: string) {
  const actor = await requireTenantPermission('customer_support.view')

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== 'string' || comment.trim().length > 2000) {
    return { error: 'Choose a rating from 1 to 5 and keep comments under 2,000 characters.' }
  }

  const db = createServiceRoleClient() as any
  const { error } = await db.rpc('submit_forge_support_feedback', {
    p_org: actor.activeOrganization.id,
    p_ticket: ticketId,
    p_actor: actor.user.id,
    p_rating: rating,
    p_comment: comment.trim()
  })

  if (error) {
    return { error: error.code === '23505' ? 'Feedback has already been submitted.' : 'Unable to submit feedback. Confirm that this is your resolved request.' }
  }

  revalidatePath('/support/' + ticketId)
  revalidatePath('/admin/creator/support/' + ticketId)
  revalidatePath('/admin/creator/support/reports')
  return { message: 'Thank you for rating your support experience.' }
}

export async function markSupportNotificationsRead(audience: 'customer' | 'staff', ids: string[]) {
  if (!['customer', 'staff'].includes(audience) || !Array.isArray(ids) || ids.length > 50 ||
      ids.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id))) {
    return { error: 'Invalid notifications.' }
  }

  let userId: string
  let organizationId: string | null = null

  if (audience === 'staff') {
    const actor = await requireForgePlatformRole(['forge_owner', 'forge_creator', 'forge_support'])
    userId = actor.user.id
  } else {
    const actor = await requireTenantPermission('customer_support.view')
    userId = actor.user.id
    organizationId = actor.activeOrganization.id
  }

  if (!ids.length) return { message: 'No unread notifications.' }

  const db = createServiceRoleClient() as any
  let query = db.from('forge_support_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_user_id', userId).eq('audience', audience).is('read_at', null).in('id', ids)

  if (organizationId) query = query.eq('organization_id', organizationId)

  const { error } = await query
  if (error) return { error: 'Unable to mark notifications as read.' }

  revalidatePath(audience === 'staff' ? '/admin/creator/support' : '/support')
  return { message: 'Notifications marked as read.' }
}
